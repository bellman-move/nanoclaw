/**
 * LRU Cache Manager for Orbi MCP Server
 *
 * Provides in-memory caching with:
 * - Configurable TTL per data type
 * - LRU eviction policy
 * - Size-based limits
 * - Pattern-based invalidation
 */

import {
  CacheEntry,
  CacheConfig,
  CacheStats,
  InvalidationPattern,
  CacheDataType,
  TTL_CONFIG,
} from './types.js';

export * from './types.js';

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  maxEntries: 1000,
  maxSizeBytes: 50 * 1024 * 1024, // 50 MB
  debug: false,
};

/**
 * LRU Cache Manager
 */
export class CacheManager {
  private cache: Map<string, CacheEntry<unknown>>;
  private accessOrder: Map<string, number>; // Track access time for LRU
  private config: CacheConfig;
  private stats: CacheStats;
  private currentSize: number;

  constructor(config: Partial<CacheConfig> = {}) {
    this.cache = new Map();
    this.accessOrder = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentSize = 0;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      currentSize: 0,
      currentEntries: 0,
      hitRate: 0,
    };
  }

  /**
   * Get cached data by key
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      this.log(`Cache MISS: ${key}`);
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      this.log(`Cache EXPIRED: ${key}`);
      return null;
    }

    // Update access time for LRU
    this.accessOrder.set(key, Date.now());
    this.stats.hits++;
    this.updateHitRate();
    this.log(`Cache HIT: ${key}`);

    return entry.data;
  }

  /**
   * Set cached data with TTL
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    const size = this.estimateSize(data);
    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
      size,
    };

    // Check if we need to evict entries
    this.ensureCapacity(size);

    // Remove old entry if exists
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key);
      if (oldEntry) {
        this.currentSize -= oldEntry.size;
      }
    }

    this.cache.set(key, entry as CacheEntry<unknown>);
    this.accessOrder.set(key, Date.now());
    this.currentSize += size;
    this.updateStats();
    this.log(`Cache SET: ${key} (${size} bytes, TTL: ${ttlMs}ms)`);
  }

  /**
   * Set cached data with predefined data type TTL
   */
  setWithType<T>(key: string, data: T, dataType: CacheDataType): void {
    const ttl = TTL_CONFIG[dataType];
    this.set(key, data, ttl);
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.updateStats();
      this.log(`Cache DELETE: ${key}`);
      return true;
    }
    return false;
  }

  /**
   * Invalidate cache entries matching pattern
   */
  invalidate(pattern: InvalidationPattern): number {
    let count = 0;
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (this.matchesPattern(key, pattern)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      if (this.delete(key)) {
        count++;
      }
    }

    this.log(`Cache INVALIDATE: ${count} entries removed`);
    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.accessOrder.clear();
    this.currentSize = 0;
    this.updateStats();
    this.log(`Cache CLEAR: ${count} entries removed`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): number {
    const now = Date.now();
    let count = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      if (this.delete(key)) {
        count++;
      }
    }

    if (count > 0) {
      this.log(`Cache CLEAN: ${count} expired entries removed`);
    }

    return count;
  }

  /**
   * Ensure cache has capacity for new entry
   */
  private ensureCapacity(requiredSize: number): void {
    // Clean expired entries first
    this.cleanExpired();

    // Check if we need to evict by count
    while (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    // Check if we need to evict by size
    while (this.currentSize + requiredSize > this.config.maxSizeBytes) {
      if (!this.evictLRU()) {
        break; // No more entries to evict
      }
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): boolean {
    if (this.accessOrder.size === 0) {
      return false;
    }

    // Find LRU entry
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, time] of this.accessOrder.entries()) {
      if (time < lruTime) {
        lruTime = time;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.delete(lruKey);
      this.stats.evictions++;
      this.log(`Cache EVICT (LRU): ${lruKey}`);
      return true;
    }

    return false;
  }

  /**
   * Check if key matches invalidation pattern
   */
  private matchesPattern(key: string, pattern: InvalidationPattern): boolean {
    if (pattern.exact) {
      return key === pattern.exact;
    }
    if (pattern.prefix) {
      return key.startsWith(pattern.prefix);
    }
    if (pattern.regex) {
      return pattern.regex.test(key);
    }
    return false;
  }

  /**
   * Estimate size of data in bytes
   */
  private estimateSize(data: unknown): number {
    const str = JSON.stringify(data);
    return str.length * 2; // Rough estimate: 2 bytes per char
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    this.stats.currentSize = this.currentSize;
    this.stats.currentEntries = this.cache.size;
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.error(`[CacheManager] ${message}`);
    }
  }
}

/**
 * Global cache instance
 */
let globalCache: CacheManager | null = null;

/**
 * Get or create global cache instance
 */
export function getCache(config?: Partial<CacheConfig>): CacheManager {
  if (!globalCache) {
    globalCache = new CacheManager(config);
  }
  return globalCache;
}

/**
 * Reset global cache instance (mainly for testing)
 */
export function resetCache(): void {
  globalCache = null;
}
