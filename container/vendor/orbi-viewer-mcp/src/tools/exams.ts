/**
 * Exam list tool for orbi.kr.
 *
 * Fetches the list of exam periods from the public
 * `/api/v1/board/exam_list` endpoint.
 *
 * @module tools/exams
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchJson } from "../utils/fetcher.js";
import type { ExamListResponse, McpToolResult } from "../types/index.js";
import { getCache, CacheDataType } from "../cache/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "get_exam_list";
const ENDPOINT = "/api/v1/board/exam_list";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers the exam-list tool on the provided MCP server instance.
 *
 * @param server - The McpServer instance to attach the tool to.
 */
export function registerExamsTool(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      description:
        "Retrieve the list of Korean entrance exam periods tracked by orbi.kr. " +
        "Each exam is identified by a YYMM code (e.g. 2506 = June 2025) and a " +
        "Korean name describing the exam type (e.g. 6월 모의평가, 수능).",
      inputSchema: {
        // No parameters required.
      },
    },
    async (): Promise<McpToolResult> => {
      try {
        const cache = getCache();
        const cacheKey = "exams:list";
        const cached = cache.get<ExamListResponse>(cacheKey);

        let data: ExamListResponse;
        if (cached) {
          data = cached;
        } else {
          data = await fetchJson<ExamListResponse>(ENDPOINT);
          cache.setWithType(cacheKey, data, CacheDataType.WARM);
        }

        if (!data.ok) {
          return {
            content: [{ type: "text", text: "API returned ok=false. No exam data available." }],
            isError: true,
          };
        }

        // Format output for readability.
        const lines = data.exam_list.map(
          (exam) => `- ${exam.code}: ${exam.name}`,
        );

        const output = [
          `Exam Periods on Orbi.kr`,
          `Total: ${data.exam_list.length}`,
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
          content: [{ type: "text", text: `Error fetching exam list: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
