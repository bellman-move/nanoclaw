/**
 * HTTP client for orbi.kr API requests.
 *
 * Features:
 * - Token-bucket rate limiting to avoid overwhelming the server
 * - Exponential-backoff retry on transient errors (5xx / network)
 * - Configurable timeouts via AbortController
 * - Consistent User-Agent header
 *
 * @module utils/fetcher
 */

import type { FetcherConfig } from "../types/index.js";

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: FetcherConfig = {
  baseUrl: "https://orbi.kr",
  maxRetries: 3,
  retryDelayMs: 1000,
  rateLimitMs: 200,
  timeoutMs: 15_000,
};

const USER_AGENT = "orbi-mcp/1.0.0 (MCP Server; +https://github.com/Move-AX/Orbi-Homepage-MCP)";

// ---------------------------------------------------------------------------
// Rate limiter (simple token-bucket approach)
// ---------------------------------------------------------------------------

let lastRequestTime = 0;

/**
 * Wait until the rate-limit window has passed since the previous request.
 * This is intentionally process-global so that all tool handlers share a
 * single throttle.
 */
async function waitForRateLimit(rateLimitMs: number): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < rateLimitMs) {
    await new Promise((resolve) => setTimeout(resolve, rateLimitMs - elapsed));
  }
  lastRequestTime = Date.now();
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

/** Errors thrown by the fetcher include the HTTP status when available. */
export class FetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly url?: string,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

/**
 * Determine whether an HTTP status code represents a transient error that
 * is worth retrying.
 */
function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Perform a single HTTP GET request with timeout support.
 *
 * @param url      - Fully-qualified URL to fetch.
 * @param headers  - Additional headers to include.
 * @param timeoutMs - Timeout in milliseconds.
 * @returns The fetch Response object.
 */
async function singleFetch(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...headers,
      },
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FetchOptions {
  /** Additional headers to merge into the request. */
  headers?: Record<string, string>;
  /** Override the default configuration for this request. */
  config?: Partial<FetcherConfig>;
}

/**
 * Fetch JSON data from an orbi.kr API endpoint.
 *
 * The URL can be either:
 *  - An absolute URL (starts with "http")
 *  - A path relative to the configured base URL (e.g. "/api/v1/board/exam_list")
 *
 * @typeParam T - Expected shape of the parsed JSON response.
 * @param urlOrPath - Absolute URL or path segment.
 * @param options   - Optional headers and config overrides.
 * @returns Parsed JSON response.
 * @throws {FetchError} On non-retryable HTTP errors or after all retries are exhausted.
 */
export async function fetchJson<T>(
  urlOrPath: string,
  options: FetchOptions = {},
): Promise<T> {
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const url = urlOrPath.startsWith("http")
    ? urlOrPath
    : `${config.baseUrl}${urlOrPath}`;

  const headers = options.headers ?? {};

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    await waitForRateLimit(config.rateLimitMs);

    try {
      const response = await singleFetch(url, headers, config.timeoutMs);

      if (response.ok) {
        return (await response.json()) as T;
      }

      // Non-transient failure -- bail immediately.
      if (!isTransient(response.status)) {
        const body = await response.text().catch(() => "(unreadable body)");
        throw new FetchError(
          `HTTP ${response.status} from ${url}: ${body}`,
          response.status,
          url,
        );
      }

      // Transient -- record and retry.
      lastError = new FetchError(
        `HTTP ${response.status} (attempt ${attempt + 1}/${config.maxRetries + 1})`,
        response.status,
        url,
      );
    } catch (err) {
      if (err instanceof FetchError && err.status !== undefined && !isTransient(err.status)) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    // Exponential back-off before the next attempt.
    if (attempt < config.maxRetries) {
      const delay = config.retryDelayMs * Math.pow(2, attempt);
      console.error(
        `[orbi-mcp] Retry ${attempt + 1}/${config.maxRetries} for ${url} in ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new FetchError(`All retries exhausted for ${url}`, undefined, url);
}

/**
 * Fetch raw HTML from a URL. Used by the post tool to retrieve
 * the full page for JSON-LD extraction.
 *
 * Shares the same rate-limiting and retry logic as {@link fetchJson}.
 *
 * @param urlOrPath - Absolute URL or path segment.
 * @param options   - Optional headers and config overrides.
 * @returns Raw HTML string.
 */
export async function fetchHtml(
  urlOrPath: string,
  options: FetchOptions = {},
): Promise<string> {
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const url = urlOrPath.startsWith("http")
    ? urlOrPath
    : `${config.baseUrl}${urlOrPath}`;

  const headers: Record<string, string> = {
    Accept: "text/html",
    ...options.headers,
  };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    await waitForRateLimit(config.rateLimitMs);

    try {
      const response = await singleFetch(url, headers, config.timeoutMs);

      if (response.ok) {
        return await response.text();
      }

      if (!isTransient(response.status)) {
        throw new FetchError(
          `HTTP ${response.status} from ${url}`,
          response.status,
          url,
        );
      }

      lastError = new FetchError(
        `HTTP ${response.status} (attempt ${attempt + 1}/${config.maxRetries + 1})`,
        response.status,
        url,
      );
    } catch (err) {
      if (err instanceof FetchError && err.status !== undefined && !isTransient(err.status)) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < config.maxRetries) {
      const delay = config.retryDelayMs * Math.pow(2, attempt);
      console.error(
        `[orbi-mcp] Retry ${attempt + 1}/${config.maxRetries} for ${url} in ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new FetchError(`All retries exhausted for ${url}`, undefined, url);
}
