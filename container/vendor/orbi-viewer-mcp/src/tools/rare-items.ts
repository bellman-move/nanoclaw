/**
 * Rare items marketplace tool for orbi.kr.
 *
 * Fetches the list of rare collectible items from the public
 * `/api/amusement/v1/rare` endpoint.
 *
 * @module tools/rare-items
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchJson } from "../utils/fetcher.js";
import type { RareItemsResponse, McpToolResult } from "../types/index.js";
import { getCache, CacheDataType } from "../cache/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "get_rare_items";
const ENDPOINT = "/api/amusement/v1/rare";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers the rare-items tool on the provided MCP server instance.
 *
 * @param server - The McpServer instance to attach the tool to.
 */
export function registerRareItemsTool(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      description:
        "Retrieve the list of rare collectible items available on the orbi.kr " +
        "marketplace. Returns categories, individual items with their current " +
        "value, description, exchangeability status, and the transaction fee.",
      inputSchema: {
        // No parameters required.
      },
    },
    async (): Promise<McpToolResult> => {
      try {
        const cache = getCache();
        const cacheKey = "rare:items";
        const cached = cache.get<RareItemsResponse>(cacheKey);

        let data: RareItemsResponse;
        if (cached) {
          data = cached;
        } else {
          data = await fetchJson<RareItemsResponse>(ENDPOINT);
          cache.setWithType(cacheKey, data, CacheDataType.HOT);
        }

        // Build category lookup.
        const categories = data.data.categories
          .map((c) => `  - ${c.id}: ${c.name}`)
          .join("\n");

        // Build item list.
        const items = data.data.items.map((item) => {
          const categoryName = item.category?.name ?? "Unknown";
          const exchangeStatus = item.exchangeable ? "Exchangeable" : "Not exchangeable";
          return [
            `- [${item.id}] ${item.description}`,
            `    Category: ${categoryName}`,
            `    Value: ${item.current_value.toLocaleString()}`,
            `    Status: ${exchangeStatus}`,
            `    Listed: ${item.created_at}`,
          ].join("\n");
        });

        const output = [
          `Rare Items Marketplace on Orbi.kr`,
          `Transaction Fee: ${data.data.fee}%`,
          "",
          `Categories:`,
          categories,
          "",
          `Items (${data.data.items.length}):`,
          ...items,
        ].join("\n");

        return {
          content: [{ type: "text", text: output }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching rare items: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
