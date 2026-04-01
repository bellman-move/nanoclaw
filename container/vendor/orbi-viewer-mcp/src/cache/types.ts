/**
 * Cache configuration types for Orbi MCP Server
 */

/**
 * Cache entry with data and expiration timestamp
 */
export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
  size: number; // Approximate size in bytes
}

/**
 * Cache data type categories with different TTLs
 */
export enum CacheDataType {
  /** Hot data (trending topics, real-time stats) - 5 minutes */
  HOT = 'hot',
  /** Warm data (exam schedules, emoticons) - 1 hour */
  WARM = 'warm',
  /** Cold data (posts, comments) - 24 hours */
  COLD = 'cold',
}

/**
 * TTL configuration in milliseconds
 */
export const TTL_CONFIG: Record<CacheDataType, number> = {
  [CacheDataType.HOT]: 5 * 60 * 1000, // 5 minutes
  [CacheDataType.WARM]: 60 * 60 * 1000, // 1 hour
  [CacheDataType.COLD]: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Maximum number of entries */
  maxEntries: number;
  /** Maximum cache size in bytes */
  maxSizeBytes: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  currentSize: number;
  currentEntries: number;
  hitRate: number;
}

/**
 * Cache invalidation pattern
 */
export interface InvalidationPattern {
  /** Exact key match */
  exact?: string;
  /** Prefix match */
  prefix?: string;
  /** Regex pattern */
  regex?: RegExp;
}
