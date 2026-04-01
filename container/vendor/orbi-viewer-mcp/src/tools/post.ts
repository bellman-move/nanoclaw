/**
 * Post retrieval tool for orbi.kr.
 *
 * Fetches a post by its 8-digit ID and extracts structured data from the
 * JSON-LD (schema.org Article) embedded in the page HTML.
 *
 * @module tools/post
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchHtml } from "../utils/fetcher.js";
import type { McpToolResult } from "../types/index.js";
import { getCache, CacheDataType } from "../cache/index.js";
import { extractSingleArticle } from "../utils/json-ld.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "get_post";

// ---------------------------------------------------------------------------
// JSON-LD extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract the page title from HTML as a fallback when JSON-LD is unavailable.
 */
function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers the post-retrieval tool on the provided MCP server instance.
 *
 * @param server - The McpServer instance to attach the tool to.
 */
export function registerPostTool(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      description:
        "Retrieve a single post from orbi.kr by its 8-digit numeric ID. " +
        "Returns structured metadata including the headline, author, " +
        "publication date, comment count, and interaction statistics " +
        "extracted from the embedded JSON-LD Article data.",
      inputSchema: {
        postId: z
          .string()
          .regex(/^\d{8}$/, "Post ID must be exactly 8 digits")
          .describe("The 8-digit numeric identifier for the post (e.g. '00012345')."),
      },
    },
    async ({ postId }): Promise<McpToolResult> => {
      try {
        const cache = getCache();
        const cacheKey = `post:${postId}`;
        const cachedOutput = cache.get<string>(cacheKey);

        if (cachedOutput) {
          return {
            content: [{ type: "text", text: cachedOutput }],
          };
        }

        const url = `https://orbi.kr/${postId}`;
        const html = await fetchHtml(url);

        const article = extractSingleArticle(html);

        if (!article) {
          // Fallback: return minimal info from HTML title.
          const title = extractTitle(html) ?? "(No title found)";
          const fallbackOutput = [
            `Post ${postId}`,
            `URL: ${url}`,
            `Title: ${title}`,
            "",
            "(JSON-LD metadata not available for this post.)",
          ].join("\n");

          cache.setWithType(cacheKey, fallbackOutput, CacheDataType.COLD);

          return {
            content: [
              {
                type: "text",
                text: fallbackOutput,
              },
            ],
          };
        }

        // Format interaction stats if present.
        let interactionInfo = "";
        if (article.interactionStatistic && article.interactionStatistic.length > 0) {
          const stats = article.interactionStatistic
            .map((stat) => `  - ${stat.interactionType}: ${stat.userInteractionCount}`)
            .join("\n");
          interactionInfo = `\nInteractions:\n${stats}`;
        }

        const output = [
          `Post ${postId}`,
          `URL: ${url}`,
          "",
          `Headline: ${article.headline}`,
          article.description ? `Description: ${article.description}` : null,
          "",
          `Author: ${article.author.name}`,
          `Author URL: ${article.author.url}`,
          "",
          `Published: ${article.datePublished}`,
          article.dateModified ? `Modified: ${article.dateModified}` : null,
          article.commentCount !== undefined ? `Comments: ${article.commentCount}` : null,
          interactionInfo || null,
          article.articleBody
            ? `\nBody Preview:\n${article.articleBody.slice(0, 500)}${article.articleBody.length > 500 ? "..." : ""}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");

        cache.setWithType(cacheKey, output, CacheDataType.COLD);

        return {
          content: [{ type: "text", text: output }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching post ${postId}: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
