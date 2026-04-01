# Orbi MCP Server

TypeScript | Node.js 18+ | MIT License | MCP 1.0.0

An MCP (Model Context Protocol) Server that provides AI applications with read-only access to **orbi.kr**, Korea's largest entrance exam (수능) community platform. Exposes real-time trending searches, exam schedules, collectible items, emoticons, and individual post metadata to Claude and other MCP-compatible AI assistants.

## Table of Contents

- [Features](#features)
- [What is orbi.kr](#what-is-orbi-kr)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Tool Reference](#tool-reference)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

- **5 Read-Only Tools**: Access trending searches, exam dates, marketplace items, emoticons, and post metadata
- **Rate Limiting**: Token-bucket rate limiting (200ms default) prevents overwhelming orbi.kr servers
- **Automatic Retries**: Exponential backoff (1s → 2s → 4s) on transient errors (5xx, 429)
- **LRU Caching**: In-memory cache with tiered TTLs (HOT: 5min, WARM: 1hr, COLD: 24hr)
- **JSON-LD Extraction**: Automatically parses schema.org Article metadata from post pages
- **TypeScript**: Strict type safety with comprehensive type definitions
- **Zero Dependencies**: Uses only Node.js 18+ built-in fetch, plus MCP SDK and Zod

## What is orbi.kr

**orbi.kr** is Korea's premier entrance exam community platform:

- **10M+ Posts** across 74 content categories
- **Subjects**: Korean, English, Math, History, Geography, Science, and more
- **Content**: Study resources, exam prep materials, university admissions info, question discussions
- **Annual Events**: 수능 (College Entrance Exam), 모의고사 (Practice Exams), 수시/정시 (Regular/Early Admission)
- **Operator**: Move Inc.
- **Traffic**: One of the most visited educational platforms in South Korea

This MCP server exposes public APIs to help AI assistants provide up-to-date information about Korean education and exam trends.

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn

### From Source

```bash
git clone https://github.com/Move-AX/Orbi-Homepage-MCP.git
cd Orbi-Homepage-MCP
npm install
npm run build
```

## Quick Start

### 1. Build the Project

```bash
npm install
npm run build
```

This compiles TypeScript to `dist/index.js`.

### 2. Configure Claude Desktop

Add the server to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "orbi": {
      "command": "node",
      "args": ["/absolute/path/to/Orbi-Homepage-MCP/dist/index.js"]
    }
  }
}
```

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "orbi": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\Orbi-Homepage-MCP\\dist\\index.js"]
    }
  }
}
```

Replace `/absolute/path/to/Orbi-Homepage-MCP` with the actual directory path.

### 3. Restart Claude Desktop

Close and reopen Claude Desktop. The Orbi tools will now be available.

### 4. Start Using

In Claude, ask questions like:

- "What are the current trending searches on orbi.kr?"
- "Get the post details for ID 12345678"
- "What exams are coming up?"
- "Show me the available emoticons"

## Tool Reference

### get_trending_searches

Retrieve real-time trending search keywords on orbi.kr ranked by popularity and search velocity.

**Parameters**: None

**Response Format**:

```
Trending Searches on Orbi.kr
Updated: 2024-01-30T10:15:30Z
Algorithm: TimeWindow

1. 수능 (+2)
2. 미적분 (-)
3. 영어 독해 (NEW)
4. 한국사 (-3)
...
```

**Fields**:
- `idx`: Rank position (1-based)
- `key`: Search keyword
- `chg`: Rank change from previous snapshot (positive = improved, negative = dropped, 0 = unchanged)
- `new`: Boolean indicating if keyword newly entered the rankings

**Cache**: 5 minutes (HOT tier)

---

### get_exam_list

Fetch the official schedule of Korean entrance exams tracked by orbi.kr.

**Parameters**: None

**Response Format**:

```
Korean Entrance Exams
Tracked at: 2024-01-30T10:15:30Z

- 2024 수능 (College Entrance Exam): 2024-11-14
- 2024 수능 이의/결과: 2024-12-06
- 2024년 겨울 모의고사: 2024-12-12
...
```

**Exam Types**:
- `수능`: College Entrance Exam (typically November)
- `모의고사`: Practice exam (monthly or seasonal)
- `수시/정시`: Regular and early admission periods
- Custom exams defined by the platform

**Cache**: 1 hour (WARM tier)

---

### get_rare_items

Browse the orbi.kr marketplace for collectible items (digital goods, badges, special items).

**Parameters**: None

**Response Format**:

```
Rare Items on Orbi.kr
Updated: 2024-01-30T10:15:30Z

- Item 1: "Golden Badge" (Price: 5000 Points)
- Item 2: "Silver Frame" (Price: 2500 Points)
...
```

**Use Cases**:
- Discover available collectibles
- Check marketplace pricing
- Get item details and rarity tiers

**Cache**: 24 hours (COLD tier)

---

### get_emoticons

List all available emoticon sets on orbi.kr.

**Parameters**: None

**Response Format**:

```
Available Emoticons on Orbi.kr
Updated: 2024-01-30T10:15:30Z

- Set 1: "Basic Emotions" (13 emotes)
- Set 2: "Study Mode" (15 emotes)
- Set 3: "Celebration Pack" (10 emotes)
...
```

**Details**:
- Emoticon set names and descriptions
- Number of emoticons per set
- Availability status

**Cache**: 24 hours (COLD tier)

---

### get_post

Retrieve detailed metadata for a single post from orbi.kr using its 8-digit numeric ID.

**Parameters**:
- `postId` (string, required): 8-digit numeric identifier (e.g., "00012345")

**Response Format**:

```
Post 00012345
URL: https://orbi.kr/00012345

Headline: "2024 수능 영어 어휘 정리"
Description: "Complete English vocabulary guide for 2024 College Entrance Exam"

Author: JohnDoe
Author URL: https://orbi.kr/user/JohnDoe

Published: 2024-01-15T08:30:00Z
Modified: 2024-01-20T10:15:00Z
Comments: 42

Interactions:
  - CommentAction: 42
  - LikeAction: 156
  - ShareAction: 23

Body Preview:
This guide covers essential vocabulary patterns appearing in recent 수능 exams...
```

**Data Extraction**:
- **Source**: JSON-LD Article schema embedded in page HTML
- **Fallback**: HTML title tag if JSON-LD unavailable
- **Fields**:
  - `headline`: Post title
  - `description`: Summary (if available)
  - `author.name`: Author username
  - `datePublished`: Creation timestamp
  - `dateModified`: Last edit timestamp (if available)
  - `commentCount`: Number of comments
  - `interactionStatistic`: Engagement metrics (likes, shares, comments)
  - `articleBody`: Full post content (truncated to 500 chars in response)

**Error Handling**:
- Returns available data even if JSON-LD parsing fails
- Shows HTML title as fallback for metadata-less posts

**Cache**: 1 hour (WARM tier)

---

## Configuration

### Environment Variables

None required. All configuration is code-based.

### Customization

Edit `src/utils/fetcher.ts` to adjust request behavior:

```typescript
const DEFAULT_CONFIG: FetcherConfig = {
  baseUrl: "https://orbi.kr",        // API base URL
  maxRetries: 3,                      // Retry attempts on transient errors
  retryDelayMs: 1000,                 // Initial backoff (exponential: 1s, 2s, 4s)
  rateLimitMs: 200,                   // Minimum milliseconds between requests
  timeoutMs: 15_000,                  // Request timeout (15 seconds)
};
```

Edit `src/cache/types.ts` to adjust cache behavior:

```typescript
const DEFAULT_CONFIG: CacheConfig = {
  maxEntries: 1000,                   // Maximum cache entries before LRU eviction
  maxSizeBytes: 50 * 1024 * 1024,    // Maximum cache size (50 MB)
  debug: false,                       // Enable cache logging
};

// Tiered TTLs for different data types
export const TTL_CONFIG: Record<CacheDataType, number> = {
  HOT: 5 * 60 * 1000,                 // 5 minutes for trending/frequently accessed
  WARM: 60 * 60 * 1000,               // 1 hour for semi-stable data
  COLD: 24 * 60 * 60 * 1000,          // 24 hours for static/rarely changing
};
```

## Architecture

### Project Structure

```
Orbi-Homepage-MCP/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/                # Tool implementations
│   │   ├── trending.ts       # Trending searches tool
│   │   ├── exams.ts          # Exam list tool
│   │   ├── rare-items.ts     # Marketplace items tool
│   │   ├── emoticons.ts      # Emoticons tool
│   │   └── post.ts           # Post retrieval tool
│   ├── utils/
│   │   └── fetcher.ts        # HTTP client with retry & rate limiting
│   ├── cache/
│   │   ├── index.ts          # LRU cache manager
│   │   └── types.ts          # Cache type definitions
│   └── types/
│       └── index.ts          # Shared TypeScript types
├── dist/                     # Compiled output (created by npm run build)
├── package.json
├── tsconfig.json
└── README.md
```

### Data Flow

```
Claude Desktop
      |
      v
MCP Protocol (stdio)
      |
      v
orbi-mcp Server
      |
      +-- Trending Tool -----> Cache ----> orbi.kr API
      |                                   /api/v1/board/search/realtime
      |
      +-- Exams Tool ---------> Cache ----> orbi.kr API
      |                                   /api/v1/board/exam_list
      |
      +-- Rare Items Tool ----> Cache ----> orbi.kr API
      |                                   /api/v1/marketplace/items
      |
      +-- Emoticons Tool -----> Cache ----> orbi.kr API
      |                                   /api/v1/emoticons
      |
      +-- Post Tool ----------> Cache ----> orbi.kr
                                          /[postId] (HTML + JSON-LD)
```

### Key Components

#### HTTP Client (`src/utils/fetcher.ts`)

- **Rate Limiting**: Token-bucket approach (200ms minimum between requests)
- **Retries**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Timeouts**: 15-second request timeout via AbortController
- **Error Classification**: Distinguishes transient (5xx, 429) from permanent errors
- **User-Agent**: Identifies requests as MCP server for analytics/monitoring

#### Cache Manager (`src/cache/index.ts`)

- **LRU Eviction**: Tracks access order, evicts least-recently-used entries
- **Size-Based Limits**: 50 MB default, configurable
- **Entry Limits**: 1000 entries default, configurable
- **TTL Tiers**: HOT (5min), WARM (1hr), COLD (24hr)
- **Pattern-Based Invalidation**: Can invalidate entries by prefix, exact match, or regex
- **Statistics**: Tracks hits, misses, evictions, hit rate

#### MCP Server (`src/index.ts`)

- **Stdio Transport**: Communicates with Claude via JSON-RPC 2.0 over stdin/stdout
- **Tool Registry**: Registers 5 tools with descriptions and input schemas
- **Error Handling**: Returns error responses with isError flag
- **Logging**: Writes all logs to stderr to avoid corrupting protocol stream

### Type Safety

All components use strict TypeScript with:
- Zod schema validation for user inputs
- Type-safe API responses
- Comprehensive error types
- Full tsconfig strict mode enabled

## Development

### Scripts

```bash
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode - recompile on changes
npm start          # Run the compiled server
npm run inspect    # Launch MCP Inspector for testing
npm run clean      # Remove dist/ directory
```

### Inspect Tool in Action

The MCP Inspector allows you to test tools in isolation:

```bash
npm run inspect
```

This opens a web interface where you can:
- Call each tool with custom inputs
- See JSON-RPC requests and responses
- View server capabilities
- Debug parameter validation

### Debugging

Enable cache logging by modifying `src/cache/index.ts`:

```typescript
const DEFAULT_CONFIG: CacheConfig = {
  // ... other settings ...
  debug: true,  // Enable cache debug logs
};
```

Run in dev mode:

```bash
npm run dev
```

All logs appear in the terminal (for server operations) or stderr (for Claude integration).

### Testing Changes Locally

1. Make code changes
2. Run `npm run build`
3. Restart Claude Desktop
4. Test in Claude

Or use the MCP Inspector for faster iteration.

## Troubleshooting

### Server Won't Start

**Error**: `Cannot find module '@modelcontextprotocol/sdk'`

**Solution**: Install dependencies
```bash
npm install
npm run build
```

### Tools Not Appearing in Claude

**Error**: Tools list is empty in Claude

**Solutions**:
1. Check the config file path is absolute (not relative)
2. Verify `dist/index.js` exists: `ls -la dist/`
3. Rebuild: `npm run build`
4. Restart Claude Desktop completely
5. Check Claude's debug logs: Claude > Settings > Logs

### Rate Limiting Delays

**Issue**: Requests are slow, appearing to pause

**Cause**: Normal behavior - 200ms minimum between requests to respect orbi.kr rate limits

**To Adjust**:
```typescript
rateLimitMs: 100,  // Reduce to 100ms (at your own risk)
```

### Cache Not Working

**Issue**: Repeated requests always hit the network

**Check**:
1. Verify cache TTL configuration in `src/cache/types.ts`
2. Enable debug logging: `debug: true` in cache config
3. Check stderr output for cache hits/misses

### HTTP 429 (Too Many Requests)

**Issue**: Requests are being throttled by orbi.kr

**Cause**: Rate limit exceeded

**Solution**: Increase `rateLimitMs` in fetcher config
```typescript
rateLimitMs: 500,  // Increase to 500ms between requests
```

### Post ID Not Found

**Error**: "Error fetching post 00012345: HTTP 404 from ..."

**Cause**: Post ID doesn't exist or has been deleted

**Verification**: Try visiting `https://orbi.kr/00012345` in a browser

### JSON-LD Parsing Fails

**Issue**: Post metadata not extracting correctly

**Cause**: orbi.kr may have changed their HTML structure

**Fallback**: Server still returns page title and URL

**Report Issue**: File a bug with the post ID so we can investigate

## Contributing

### Reporting Issues

Found a bug or have a feature request?

1. Check existing GitHub issues
2. Create a new issue with:
   - Reproduction steps
   - Expected vs actual behavior
   - Error messages and logs
   - Node.js and npm versions

### Development Setup

```bash
# Fork the repository
git clone https://github.com/YOUR-USERNAME/Orbi-Homepage-MCP.git
cd Orbi-Homepage-MCP

# Install dependencies
npm install

# Make your changes
# Edit src/...

# Build and test
npm run build
npm run inspect

# Commit with clear messages
git add .
git commit -m "feat: add new tool"

# Push and create a pull request
git push origin feature-branch
```

### Code Style

- TypeScript strict mode required
- ESLint configuration (if applicable)
- Type all function parameters and returns
- Comment complex logic
- Test tools with MCP Inspector before submitting

## License

MIT License. See LICENSE file for details.

## Additional Resources

- Model Context Protocol Documentation: https://modelcontextprotocol.io/
- orbi.kr: https://orbi.kr
- Move Inc.: https://move.co.kr
- Claude Documentation: https://claude.ai/docs

## Support

For issues, questions, or contributions, please visit:
https://github.com/Move-AX/Orbi-Homepage-MCP

---

Made with care for Korea's education community.
