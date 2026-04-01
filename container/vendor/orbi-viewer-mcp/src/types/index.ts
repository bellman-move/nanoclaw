/**
 * TypeScript type definitions for orbi.kr API responses.
 *
 * These interfaces mirror the JSON schemas documented in docs/api-schemas.json
 * and represent the data structures returned by the public orbi.kr endpoints.
 *
 * @module types
 */

// ---------------------------------------------------------------------------
// Trending Searches  -  GET /api/v1/board/search/realtime
// ---------------------------------------------------------------------------

/** A single entry in the real-time search ranking. */
export interface TrendingSearchEntry {
  /** Ranking position (1-based). */
  idx: number;
  /** The search keyword. */
  key: string;
  /** Change in ranking since the previous snapshot (+/- or 0). */
  chg: number;
  /** Whether this keyword is a new entry in the ranking. */
  new: boolean;
}

/** Wrapper object for the ranking data. */
export interface TrendingRank {
  /** Timestamp of the ranking snapshot in "YYYY.MM.DD HH:mm" format. */
  created_at: string;
  /** Ordered list of trending search entries. */
  data: TrendingSearchEntry[];
  /** Identifier for the ranking algorithm used. */
  method: string;
}

/** Top-level response from the real-time trending searches endpoint. */
export interface TrendingSearchResponse {
  rank: TrendingRank;
}

// ---------------------------------------------------------------------------
// Exam List  -  GET /api/v1/board/exam_list
// ---------------------------------------------------------------------------

/** A single exam period entry. */
export interface ExamEntry {
  /** Exam identifier in YYMM format (e.g. 2506 = June 2025). */
  code: number;
  /** Exam name in Korean. */
  name: string;
}

/** Top-level response from the exam list endpoint. */
export interface ExamListResponse {
  exam_list: ExamEntry[];
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Rare Items Marketplace  -  GET /api/amusement/v1/rare
// ---------------------------------------------------------------------------

/** Category metadata for a rare item. */
export interface RareItemCategory {
  id: number;
  name: string;
  background_color?: string;
  font_color?: string;
}

/** A single item listed on the rare-items marketplace. */
export interface RareItem {
  id: number;
  category: RareItemCategory;
  created_at: string;
  current_value: number;
  description: string;
  exchangeable: boolean;
}

/** Top-level payload inside the rare-items response. */
export interface RareItemsData {
  categories: RareItemCategory[];
  /** Transaction fee applied to marketplace exchanges. */
  fee: number;
  items: RareItem[];
}

/** Top-level response from the rare-items endpoint. */
export interface RareItemsResponse {
  data: RareItemsData;
}

// ---------------------------------------------------------------------------
// Emoticons  -  GET /api/v1/board/emoticons
// ---------------------------------------------------------------------------

/** A single emoticon icon within a set. */
export interface EmoticonIcon {
  /** URL of the emoticon image. */
  url: string;
  width: number;
  height: number;
}

/** A named set of emoticons (e.g. "basic", "animals"). */
export interface EmoticonSet {
  id: number;
  name: string;
  /** Preview/cover image URL. */
  image: string;
  /** Individual emoticon icons belonging to this set. */
  icons: EmoticonIcon[];
  /** Display order. */
  order: number;
}

/** The emoticons endpoint returns an array of sets. */
export type EmoticonResponse = EmoticonSet[];

// ---------------------------------------------------------------------------
// Post (JSON-LD Article)  -  extracted from https://orbi.kr/{postId}
// ---------------------------------------------------------------------------

/** Author information embedded in the JSON-LD Article. */
export interface PostAuthor {
  name: string;
  url: string;
}

/** An interaction counter from schema.org InteractionCounter. */
export interface InteractionCounter {
  "@type": "InteractionCounter";
  interactionType: string;
  userInteractionCount: string | number;
}

/** JSON-LD Article data extracted from a post page. */
export interface PostArticle {
  "@type": "Article";
  headline: string;
  description?: string;
  articleBody?: string;
  datePublished: string;
  dateModified?: string;
  author: PostAuthor;
  commentCount?: string | number;
  interactionStatistic?: InteractionCounter[];
  mainEntityOfPage?: string;
  url?: string;
  image?: string | { url: string };
}

/** A ListItem entry from JSON-LD @graph arrays containing article data. */
export interface TagListItem {
  position: number;
  postId: string;
  headline: string;
  description?: string;
  authorName: string;
  authorUrl?: string;
  datePublished: string;
  dateModified?: string;
  commentCount?: number;
  interactionCount?: number;
  url: string;
  image?: string;
}

// ---------------------------------------------------------------------------
// Tag Post List  -  extracted from https://orbi.kr/list/tag/{tagName}
// ---------------------------------------------------------------------------

/** Result wrapper for tag-based post listing. */
export interface TagListResult {
  /** The tag name that was queried. */
  tag: string;
  /** Current page number (1-based). */
  page: number;
  /** Whether more pages are available. */
  hasNextPage: boolean;
  /** List of posts on this page. */
  posts: TagListItem[];
}

// ---------------------------------------------------------------------------
// Search Results  -  extracted from https://orbi.kr/search?q={query}
// ---------------------------------------------------------------------------

/** A single search result item extracted from HTML. */
export interface SearchResultItem {
  /** The post's numeric ID extracted from its URL. */
  postId: string;
  /** Post title. */
  title: string;
  /** Author display name (if available). */
  author?: string;
  /** Preview/snippet text from the post. */
  preview?: string;
  /** Relative timestamp (e.g. "15분 전"). */
  timestamp?: string;
  /** Full URL to the post. */
  url: string;
}

/** Result wrapper for keyword search. */
export interface SearchResult {
  /** The search query string. */
  query: string;
  /** Current page number (1-based). */
  page: number;
  /** Whether more pages are available. */
  hasNextPage: boolean;
  /** List of search result posts. */
  posts: SearchResultItem[];
}

// ---------------------------------------------------------------------------
// Shared / Utility types
// ---------------------------------------------------------------------------

/** Standard MCP text content block returned by all tools. */
export interface McpTextContent {
  type: "text";
  text: string;
}

/** Standard MCP tool result shape with index signature for SDK compatibility. */
export interface McpToolResult {
  content: McpTextContent[];
  isError?: boolean;
  /** Allow additional properties for SDK compatibility. */
  [key: string]: unknown;
}

/** Configuration for the HTTP fetcher. */
export interface FetcherConfig {
  /** Base URL for API requests. */
  baseUrl: string;
  /** Maximum number of retry attempts on transient failures. */
  maxRetries: number;
  /** Delay in milliseconds between retries (doubled on each attempt). */
  retryDelayMs: number;
  /** Minimum interval in milliseconds between consecutive requests. */
  rateLimitMs: number;
  /** Request timeout in milliseconds. */
  timeoutMs: number;
}
