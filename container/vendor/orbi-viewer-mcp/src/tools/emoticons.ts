/**
 * Emoticons tool for orbi.kr.
 *
 * Fetches the available emoticon sets from the public
 * `/api/v1/board/emoticons` endpoint.
 *
 * @module tools/emoticons
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchHtml } from "../utils/fetcher.js";
import type { EmoticonResponse, McpToolResult } from "../types/index.js";
import { getCache, CacheDataType } from "../cache/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "get_emoticons";
const ENDPOINT = "/api/v1/board/emoticons";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers the emoticons tool on the provided MCP server instance.
 *
 * @param server - The McpServer instance to attach the tool to.
 */
export function registerEmoticonsTool(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      description:
        "Retrieve the list of emoticon sets available on orbi.kr. " +
        "Each set includes a name, cover image, and a collection of individual " +
        "emoticon icons with their URLs and dimensions.",
      inputSchema: {
        // No parameters required.
      },
    },
    async (): Promise<McpToolResult> => {
      try {
        const cache = getCache();
        const cacheKey = "emoticons:all";
        const cached = cache.get<EmoticonResponse>(cacheKey);

        let data: EmoticonResponse;
        if (cached) {
          data = cached;
        } else {
          const raw = await fetchHtml(ENDPOINT);
          // Strip JavaScript prefix: "window.$orbiEmoticon = "
          const jsonStr = raw.replace(/^window\.\$orbiEmoticon\s*=\s*/, '').trim();
          data = JSON.parse(jsonStr) as EmoticonResponse;
          cache.setWithType(cacheKey, data, CacheDataType.WARM);
        }

        // Format each emoticon set.
        const sets = data.map((set) => {
          const iconCount = set.icons.length;
          return [
            `- [${set.id}] ${set.name}`,
            `    Preview: ${set.image}`,
            `    Icons: ${iconCount}`,
            `    Order: ${set.order}`,
          ].join("\n");
        });

        const totalIcons = data.reduce((sum, set) => sum + set.icons.length, 0);

        const output = [
          `Emoticon Sets on Orbi.kr`,
          `Total Sets: ${data.length}`,
          `Total Icons: ${totalIcons}`,
          "",
          ...sets,
        ].join("\n");

        return {
          content: [{ type: "text", text: output }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching emoticons: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
