/**
 * Search tool for orbi.kr.
 *
 * Searches for posts by keyword and extracts results from HTML.
 *
 * NOTE: This tool uses HTML scraping which is more fragile than JSON-LD based tools.
 * Search results may vary in structure and availability of metadata.
 *
 * @module tools/search
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchHtml } from "../utils/fetcher.js";
import type { SearchResultItem, McpToolResult } from "../types/index.js";
import { getCache, CacheDataType } from "../cache/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "search_posts";

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extract search result items from raw HTML.
 *
 * Uses regex to find post links and surrounding metadata. This is inherently
 * fragile and may break if orbi.kr changes their HTML structure.
 *
 * @param html - Raw HTML string of the search results page.
 * @returns Array of parsed search result items.
 */
function extractSearchResults(html: string): SearchResultItem[] {
  const results: SearchResultItem[] = [];

  // Pattern to match post links with 8+ digit IDs, including slug suffixes.
  // Handles URLs like /00077432515/post-slug?q=query or /00077432515
  const linkRegex = /<a[^>]*href=["']\/(\d{8,})(?:\/[^"']*)?["'][^>]*>([^<]+)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const postId = match[1];
    const title = match[2].trim();
    const matchIndex = match.index;

    // Extract surrounding context (400 chars before to capture profile link, 200 after).
    // Profile links appear BEFORE post title links in search results.
    const contextStart = Math.max(0, matchIndex - 400);
    const contextEnd = Math.min(html.length, matchIndex + match[0].length + 200);
    const context = html.slice(contextStart, contextEnd);

    // Try to extract author from profile div in context (uses onclick, not href).
    const authorMatch = /onclick=["']location\.href='\/profile\/(\d+)'/i.exec(context);
    const author = authorMatch ? `user:${authorMatch[1]}` : undefined;

    // Try to extract preview text from nearby content divs or paragraphs.
    const previewMatch = /<(?:div|p)[^>]*class=["'][^"']*(?:content|preview|snippet|desc)[^"']*["'][^>]*>([^<]+)<\/(?:div|p)>/i.exec(context);
    const preview = previewMatch ? previewMatch[1].trim() : undefined;

    // Try to extract timestamp from abbr element (e.g. "13분 전").
    const timestampMatch = /<abbr[^>]*>[\s\S]*?(\d+\s*[분시일주개월년]\s*전)[\s\S]*?<\/abbr>/i.exec(context);
    const timestamp = timestampMatch ? timestampMatch[1].trim() : undefined;

    results.push({
      postId,
      title,
      author,
      preview,
      timestamp,
      url: `https://orbi.kr/${postId}`,
    });
  }

  return results;
}

/**
 * Check if the HTML contains a pagination link for the next page.
 *
 * @param html - Raw HTML string.
 * @param currentPage - Current page number.
 * @returns True if a next page link is detected.
 */
function hasNextPage(html: string, currentPage: number): boolean {
  const nextPagePattern = new RegExp(`[?&]page=${currentPage + 1}(?:[&"]|$)`, "i");
  return nextPagePattern.test(html) || /<a[^>]*(?:class|aria-label)=["'][^"']*(?:next|다음)[^"']*["'][^>]*>/i.test(html);
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers the search tool on the provided MCP server instance.
 *
 * @param server - The McpServer instance to attach the tool to.
 */
export function registerSearchTool(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      description:
        "Search for posts on orbi.kr by keyword. Returns matching posts with titles, authors, and preview snippets. " +
        "Supports pagination. Note: search results have less metadata than get_posts_by_tag results.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("Search query keyword(s). Examples: '서울대 추합', '수학 공부법', '의대 합격수기'."),
        page: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(1)
          .describe("Page number (1-indexed, default: 1)."),
      },
    },
    async ({ query, page = 1 }): Promise<McpToolResult> => {
      try {
        const cache = getCache();
        const cacheKey = `search:${query}:page:${page}`;
        const cachedOutput = cache.get<string>(cacheKey);

        if (cachedOutput) {
          return {
            content: [{ type: "text", text: cachedOutput }],
          };
        }

        const url = `https://orbi.kr/search?q=${encodeURIComponent(query)}&page=${page}`;
        const html = await fetchHtml(url);

        const posts = extractSearchResults(html);
        const hasMore = hasNextPage(html, page);

        // Format output.
        const lines = posts.map((post, idx) => {
          const parts = [
            `${idx + 1}. ${post.title}`,
            post.author || post.timestamp
              ? `   Author: ${post.author || "(unknown)"} | ${post.timestamp || "(no timestamp)"}`
              : null,
            post.preview
              ? `   Preview: ${post.preview.slice(0, 100)}${post.preview.length > 100 ? "..." : ""}`
              : null,
            `   URL: ${post.url}`,
          ];
          return parts.filter(Boolean).join("\n");
        });

        const output = [
          `Search Results for "${query}" (Page ${page})`,
          `URL: ${url}`,
          `Results: ${posts.length} posts found`,
          "",
          posts.length > 0 ? lines.join("\n\n") : "(No results found.)",
          "",
          `Page ${page} | More pages available: ${hasMore ? "Yes" : "No"}`,
        ].join("\n");

        cache.setWithType(cacheKey, output, CacheDataType.HOT);

        return {
          content: [{ type: "text", text: output }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error searching for "${query}": ${message}` }],
          isError: true,
        };
      }
    },
  );
}
