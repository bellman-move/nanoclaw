#!/usr/bin/env node
/**
 * orbi-mcp - MCP Server for orbi.kr
 *
 * This server exposes tools for interacting with orbi.kr, Korea's largest
 * entrance exam community. It provides read-only access to public APIs:
 *
 * - Trending searches (real-time search keywords)
 * - Exam list (tracked Korean exam periods)
 * - Rare items marketplace (collectible items)
 * - Emoticons (available emoticon sets)
 * - Post retrieval (individual post metadata via JSON-LD)
 * - Tag posts (browse posts by tag/category)
 * - Search posts (keyword search across posts)
 *
 * @module orbi-mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerTrendingTool } from "./tools/trending.js";
import { registerExamsTool } from "./tools/exams.js";
import { registerRareItemsTool } from "./tools/rare-items.js";
import { registerEmoticonsTool } from "./tools/emoticons.js";
import { registerPostTool } from "./tools/post.js";
import { registerTagPostsTool } from "./tools/tag-posts.js";
import { registerSearchTool } from "./tools/search.js";
import { getCache } from "./cache/index.js";
import type { McpToolResult } from "./types/index.js";

// ---------------------------------------------------------------------------
// Server metadata
// ---------------------------------------------------------------------------

const SERVER_NAME = "orbi-mcp";
const SERVER_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Server initialization
// ---------------------------------------------------------------------------

/**
 * Create and configure the MCP server with all orbi.kr tools.
 *
 * @returns Configured McpServer instance.
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register all tools.
  registerTrendingTool(server);
  registerExamsTool(server);
  registerRareItemsTool(server);
  registerEmoticonsTool(server);
  registerPostTool(server);
  registerTagPostsTool(server);
  registerSearchTool(server);

  // Register cache stats tool.
  server.registerTool(
    "get_cache_stats",
    {
      description:
        "Retrieve cache statistics including total entries, hits, misses, " +
        "hit rate, and per-key details with TTL information.",
      inputSchema: {},
    },
    async (): Promise<McpToolResult> => {
      try {
        const cache = getCache();
        const stats = cache.getStats();

        const output = [
          `Cache Statistics`,
          `================`,
          ``,
          `Current Entries: ${stats.currentEntries}`,
          `Current Size: ${stats.currentSize} bytes`,
          `Cache Hits: ${stats.hits}`,
          `Cache Misses: ${stats.misses}`,
          `Hit Rate: ${stats.hitRate}`,
          `Evictions: ${stats.evictions}`,
        ].join("\n");

        return {
          content: [{ type: "text", text: output }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error retrieving cache stats: ${message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Start the MCP server using stdio transport.
 *
 * The server communicates via stdin/stdout using JSON-RPC 2.0.
 * All logging is sent to stderr to avoid corrupting the protocol stream.
 */
async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  // Connect the server to the transport.
  await server.connect(transport);

  // Log startup to stderr (never stdout for stdio-based MCP servers).
  console.error(`[${SERVER_NAME}] Server v${SERVER_VERSION} running on stdio`);
  console.error(`[${SERVER_NAME}] Available tools:`);
  console.error(`[${SERVER_NAME}]   - get_trending_searches`);
  console.error(`[${SERVER_NAME}]   - get_exam_list`);
  console.error(`[${SERVER_NAME}]   - get_rare_items`);
  console.error(`[${SERVER_NAME}]   - get_emoticons`);
  console.error(`[${SERVER_NAME}]   - get_post`);
  console.error(`[${SERVER_NAME}]   - get_posts_by_tag`);
  console.error(`[${SERVER_NAME}]   - search_posts`);
  console.error(`[${SERVER_NAME}]   - get_cache_stats`);
}

// Run the server.
main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  process.exit(1);
});
