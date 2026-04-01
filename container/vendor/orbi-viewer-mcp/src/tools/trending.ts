/**
 * Trending searches tool for orbi.kr.
 *
 * Fetches real-time trending search keywords from the public
 * `/api/v1/board/search/realtime` endpoint.
 *
 * @module tools/trending
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchJson } from "../utils/fetcher.js";
import type { TrendingSearchResponse, McpToolResult } from "../types/index.js";
import { getCache, CacheDataType } from "../cache/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "get_trending_searches";
const ENDPOINT = "/api/v1/board/search/realtime";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers the trending-searches tool on the provided MCP server instance.
 *
 * @param server - The McpServer instance to attach the tool to.
 */
export function registerTrendingTool(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      description:
        "Retrieve the current real-time trending search keywords on orbi.kr. " +
        "Returns a ranked list showing each keyword, its position, whether it is " +
        "new to the rankings, and how its rank has changed since the previous snapshot.",
      inputSchema: {
        // No parameters required for this endpoint.
      },
    },
    async (): Promise<McpToolResult> => {
      try {
        const cache = getCache();
        const cacheKey = "trending:realtime";
        const cached = cache.get<TrendingSearchResponse>(cacheKey);

        let data: TrendingSearchResponse;
        if (cached) {
          data = cached;
        } else {
          data = await fetchJson<TrendingSearchResponse>(ENDPOINT);
          cache.setWithType(cacheKey, data, CacheDataType.HOT);
        }

        // Format for human-readable output.
        const lines = data.rank.data.map((entry) => {
          const change =
            entry.new
              ? "(NEW)"
              : entry.chg > 0
                ? `(+${entry.chg})`
                : entry.chg < 0
                  ? `(${entry.chg})`
                  : "(-)";
          return `${entry.idx}. ${entry.key} ${change}`;
        });

        const output = [
          `Trending Searches on Orbi.kr`,
          `Updated: ${data.rank.created_at}`,
          `Algorithm: ${data.rank.method}`,
          "",
          ...lines,
        ].join("\n");

        return {
          content: [{ type: "text", text: output }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching trending searches: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
