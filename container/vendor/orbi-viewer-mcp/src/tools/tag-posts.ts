/**
 * Tag posts browsing tool for orbi.kr.
 *
 * Fetches posts from a specific tag/category page and extracts structured
 * list data from JSON-LD (schema.org ListItem containing Article objects)
 * embedded in the page HTML.
 *
 * @module tools/tag-posts
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchHtml } from "../utils/fetcher.js";
import { extractArticleList } from "../utils/json-ld.js";
import type { McpToolResult, TagListItem } from "../types/index.js";
import { getCache, CacheDataType } from "../cache/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "get_posts_by_tag";

// ---------------------------------------------------------------------------
// HTML Fallback Extraction
// ---------------------------------------------------------------------------

/**
 * Fallback HTML-based extraction when JSON-LD is unavailable.
 *
 * Tag listing pages 2+ may not have JSON-LD ListItem data. This function
 * extracts post information directly from HTML link structure.
 *
 * @param html - Raw HTML string of the tag page.
 * @returns Array of TagListItem objects extracted from HTML.
 */
function extractArticleListFromHtml(html: string): TagListItem[] {
  const results: TagListItem[] = [];

  // First try: Pattern to match post links: /00077432515 or /00077432515/slug
  const postLinkRegex = /<a[^>]*href=["']\/(\d{8,})(?:\/[^"']*)?["'][^>]*>([^<]+)<\/a>/gi;
  let match: RegExpExecArray | null;

  let position = 1;

  while ((match = postLinkRegex.exec(html)) !== null) {
    const postId = match[1];
    const headline = match[2].trim();

    // Skip if headline is too short (likely not a real post title)
    if (!headline || headline.length < 2) continue;

    const matchIndex = match.index;

    // Look in surrounding context (300 chars before) for author profile link
    const contextStart = Math.max(0, matchIndex - 300);
    const context = html.slice(contextStart, matchIndex);

    // Try to extract author from profile div using onclick pattern
    const authorMatch = /onclick=["']location\.href='\/profile\/(\d+)'/i.exec(context);
    const authorName = authorMatch ? `user:${authorMatch[1]}` : "(unknown)";

    results.push({
      position: position++,
      postId,
      headline,
      authorName,
      datePublished: "", // Not available in HTML fallback
      url: `https://orbi.kr/${postId}`,
    });
  }

  // Second try: look for post IDs in quoted paths if no <a> links found (CSR pages)
  if (results.length === 0) {
    const pathRegex = /["']\/?(00\d{9,})(?:\/[^"']*)?["']/g;
    const foundIds: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = pathRegex.exec(html)) !== null) {
      const id = m[1];
      if (!foundIds.includes(id)) {
        foundIds.push(id);
      }
    }
    // Create minimal entries with just postIds (no title available in CSR)
    foundIds.forEach((id) => {
      results.push({
        position: position++,
        postId: id,
        headline: `(Post ${id})`,
        authorName: "(unknown)",
        datePublished: "",
        url: `https://orbi.kr/${id}`,
      });
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Pagination detection
// ---------------------------------------------------------------------------

/**
 * Check if the HTML contains a link to the next page.
 *
 * Looks for pagination patterns indicating more pages are available.
 *
 * @param html - Raw HTML string of the tag page.
 * @param currentPage - Current page number.
 * @returns True if a next page link exists.
 */
function hasNextPage(html: string, currentPage: number): boolean {
  // Check for next page link with page=${currentPage + 1}.
  const nextPagePattern = new RegExp(
    `page=${currentPage + 1}|page%3D${currentPage + 1}`,
    "i"
  );

  // Also check for common pagination arrow/button elements.
  const hasNextButton = /<a[^>]*class="[^"]*next[^"]*"[^>]*>/i.test(html) ||
                        /<a[^>]*aria-label="[^"]*next[^"]*"[^>]*>/i.test(html) ||
                        /<a[^>]*>[\s\S]*?next[\s\S]*?<\/a>/i.test(html) ||
                        /<button[^>]*class="[^"]*next[^"]*"[^>]*>/i.test(html);

  return nextPagePattern.test(html) || hasNextButton;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers the tag posts browsing tool on the provided MCP server instance.
 *
 * @param server - The McpServer instance to attach the tool to.
 */
export function registerTagPostsTool(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      description:
        "Retrieve posts from a specific tag/category on orbi.kr. " +
        "Tags include subjects (국어, 수학), universities (서울대, 연세대), " +
        "admissions (정시, 수시), and community topics (합격수기, 공부법). " +
        "Returns structured post listings with pagination support.",
      inputSchema: {
        tag: z
          .string()
          .min(1)
          .describe(
            "Tag name to browse (Korean or English). Examples: '서울대', '수학', '합격수기', '정시'."
          ),
        page: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(1)
          .describe("Page number (1-indexed, default: 1)."),
      },
    },
    async ({ tag, page = 1 }): Promise<McpToolResult> => {
      try {
        const cache = getCache();
        const cacheKey = `tag:${tag}:page:${page}`;
        const cachedOutput = cache.get<string>(cacheKey);

        if (cachedOutput) {
          return {
            content: [{ type: "text", text: cachedOutput }],
          };
        }

        const url = `https://orbi.kr/list/tag/${encodeURIComponent(tag)}?page=${page}`;
        const html = await fetchHtml(url);

        let posts = extractArticleList(html);

        // Fallback to HTML extraction if JSON-LD returns no results
        if (posts.length === 0) {
          posts = extractArticleListFromHtml(html);
        }

        const hasMore = hasNextPage(html, page);

        if (posts.length === 0) {
          const noResultsOutput = [
            `Posts tagged "${tag}" (Page ${page})`,
            `URL: ${url}`,
            `Results: 0 posts`,
            "",
            "(No posts found for this tag/page combination.)",
          ].join("\n");

          cache.setWithType(cacheKey, noResultsOutput, CacheDataType.WARM);

          return {
            content: [{ type: "text", text: noResultsOutput }],
          };
        }

        // Format posts for human-readable output.
        const postLines = posts.map((post, index) => {
          const lines = [
            `${index + 1}. ${post.headline}`,
            `   Author: ${post.authorName} | Published: ${post.datePublished}`,
          ];

          // Add optional fields if present.
          const metadata: string[] = [];
          if (post.commentCount !== undefined) {
            metadata.push(`Comments: ${post.commentCount}`);
          }
          if (post.interactionCount !== undefined) {
            metadata.push(`Interactions: ${post.interactionCount}`);
          }
          if (metadata.length > 0) {
            lines.push(`   ${metadata.join(" | ")}`);
          }

          lines.push(`   URL: https://orbi.kr/${post.postId}`);

          return lines.join("\n");
        });

        const output = [
          `Posts tagged "${tag}" (Page ${page})`,
          `URL: ${url}`,
          `Results: ${posts.length} posts`,
          "",
          ...postLines,
          "",
          `Page ${page} | More pages available: ${hasMore ? "Yes" : "No"}`,
        ].join("\n");

        cache.setWithType(cacheKey, output, CacheDataType.WARM);

        return {
          content: [{ type: "text", text: output }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Error fetching posts for tag "${tag}": ${message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
