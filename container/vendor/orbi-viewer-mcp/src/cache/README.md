# Cache Module

LRU (Least Recently Used) in-memory cache for the Orbi MCP Server.

## Features

- **Configurable TTL per data type**: Hot (5min), Warm (1hr), Cold (24hr)
- **LRU eviction policy**: Automatically removes least recently used entries
- **Size-based limits**: Prevents memory bloat with configurable limits
- **Pattern-based invalidation**: Clear cache by prefix, exact match, or regex
- **Statistics tracking**: Hit rate, evictions, cache size monitoring

## Usage

### Basic Usage

```typescript
import { getCache, CacheDataType } from './cache/index.js';

const cache = getCache();

// Set with explicit TTL
cache.set('user:123', userData, 60000); // 1 minute

// Set with predefined data type
cache.setWithType('trending:topics', trendingData, CacheDataType.HOT); // 5 minutes
cache.setWithType('exam:schedule', examData, CacheDataType.WARM); // 1 hour
cache.setWithType('post:456', postData, CacheDataType.COLD); // 24 hours

// Get cached data
const data = cache.get<UserData>('user:123');
if (data) {
  console.log('Cache hit!', data);
}
```

### Cache Data Types

```typescript
enum CacheDataType {
  HOT = 'hot',    // 5 minutes - trending topics, real-time stats
  WARM = 'warm',  // 1 hour - exam schedules, emoticons
  COLD = 'cold',  // 24 hours - posts, comments
}
```

### Invalidation

```typescript
// Invalidate by exact key
cache.invalidate({ exact: 'user:123' });

// Invalidate by prefix
cache.invalidate({ prefix: 'user:' }); // Removes all user:* keys

// Invalidate by regex
cache.invalidate({ regex: /^post:\d+$/ }); // Removes all post:123, post:456, etc.

// Clear all
cache.clear();
```

### Statistics

```typescript
const stats = cache.getStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
console.log(`Entries: ${stats.currentEntries}`);
console.log(`Size: ${(stats.currentSize / 1024 / 1024).toFixed(2)} MB`);
```

### Configuration

```typescript
import { CacheManager } from './cache/index.js';

const cache = new CacheManager({
  maxEntries: 2000,              // Max number of entries
  maxSizeBytes: 100 * 1024 * 1024, // 100 MB
  debug: true,                    // Enable debug logging
});
```

## Cache Keys Convention

Use namespaced keys for better organization and invalidation:

- `trending:topics` - Trending topics list
- `trending:exams` - Trending exams list
- `exam:{id}` - Individual exam data
- `post:{id}` - Individual post data
- `emoticon:list` - Emoticon list
- `rare-items:list` - Rare items list
- `stats:board:{boardId}` - Board statistics

## Memory Management

The cache automatically:
1. Cleans expired entries before eviction
2. Evicts LRU entries when `maxEntries` is reached
3. Evicts LRU entries when `maxSizeBytes` is exceeded
4. Estimates entry size for accurate memory tracking

## Best Practices

1. **Use appropriate data types**: Match TTL to data freshness requirements
2. **Namespace your keys**: Makes invalidation easier
3. **Monitor statistics**: Track hit rate to optimize cache usage
4. **Clean expired entries**: Call `cache.cleanExpired()` periodically
5. **Invalidate on updates**: Clear cache when data changes

## Example: Tool Integration

```typescript
import { getCache, CacheDataType } from '../cache/index.js';

export async function getTrendingTopics() {
  const cache = getCache();
  const cacheKey = 'trending:topics';

  // Try cache first
  const cached = cache.get<TrendingData>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from API
  const data = await fetchTrendingTopics();

  // Cache with HOT data type (5 minutes)
  cache.setWithType(cacheKey, data, CacheDataType.HOT);

  return data;
}

export function invalidateTrendingCache() {
  const cache = getCache();
  cache.invalidate({ prefix: 'trending:' });
}
```
