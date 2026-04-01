/**
 * Shared JSON-LD extraction utilities for orbi.kr.
 *
 * Provides functions to parse and extract schema.org Article data from
 * JSON-LD blocks embedded in orbi.kr HTML pages.
 *
 * @module utils/json-ld
 */

import type { PostArticle, TagListItem } from "../types/index.js";

// ---------------------------------------------------------------------------
// Core JSON-LD Parsing
// ---------------------------------------------------------------------------

/**
 * Parse all JSON-LD script blocks from HTML.
 *
 * Finds all `<script type="application/ld+json">` elements and returns
 * their parsed JSON content as an array.
 *
 * @param html - Raw HTML string to parse.
 * @returns Array of parsed JSON-LD objects (empty if none found or all invalid).
 */
export function parseJsonLdBlocks(html: string): unknown[] {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks: unknown[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as unknown;
      blocks.push(parsed);
    } catch {
      // Invalid JSON -- skip this block.
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Single Article Extraction
// ---------------------------------------------------------------------------

/**
 * Extract a single Article from JSON-LD blocks.
 *
 * Searches for an Article object in two patterns:
 * 1. Direct `@type: "Article"` at the top level.
 * 2. Within an `@graph` array.
 *
 * This is used by the `get_post` tool for individual post retrieval.
 *
 * @param html - Raw HTML string of the post page.
 * @returns Parsed PostArticle or null if not found.
 */
export function extractSingleArticle(html: string): PostArticle | null {
  const blocks = parseJsonLdBlocks(html);

  for (const block of blocks) {
    if (typeof block !== "object" || block === null) continue;

    // Handle @graph array.
    if (
      "@graph" in block &&
      Array.isArray((block as Record<string, unknown>)["@graph"])
    ) {
      const graph = (block as Record<string, unknown[]>)["@graph"];
      const article = graph.find(
        (item): item is PostArticle =>
          typeof item === "object" &&
          item !== null &&
          "@type" in item &&
          (item as Record<string, unknown>)["@type"] === "Article",
      );
      if (article) return article;
    }

    // Direct Article object.
    if (
      "@type" in block &&
      (block as Record<string, unknown>)["@type"] === "Article"
    ) {
      return block as PostArticle;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Article List Extraction
// ---------------------------------------------------------------------------

/**
 * Extract all ListItem entries containing Articles from JSON-LD blocks.
 *
 * Searches for `@graph` arrays containing ListItem objects. Each ListItem
 * has a `position` and an `item` property containing the Article data.
 *
 * This is used for tag pages and list views that embed multiple articles.
 *
 * @param html - Raw HTML string of a list/tag page.
 * @returns Array of TagListItem objects with position and article data.
 */
export function extractArticleList(html: string): TagListItem[] {
  const blocks = parseJsonLdBlocks(html);
  const results: TagListItem[] = [];

  for (const block of blocks) {
    if (typeof block !== "object" || block === null) continue;

    // Only process @graph arrays.
    if (
      !("@graph" in block) ||
      !Array.isArray((block as Record<string, unknown>)["@graph"])
    ) {
      continue;
    }

    const graph = (block as Record<string, unknown[]>)["@graph"];

    for (const item of graph) {
      if (
        typeof item !== "object" ||
        item === null ||
        !("@type" in item) ||
        (item as Record<string, unknown>)["@type"] !== "ListItem"
      ) {
        continue;
      }

      const listItem = item as Record<string, unknown>;

      // Extract position.
      const position =
        typeof listItem.position === "number" ? listItem.position : 0;

      // Extract nested Article from item property.
      const articleData = listItem.item;
      if (
        typeof articleData !== "object" ||
        articleData === null ||
        !("@type" in articleData) ||
        (articleData as Record<string, unknown>)["@type"] !== "Article"
      ) {
        continue;
      }

      const article = articleData as PostArticle;

      // Extract postId from URL.
      const urlToExtract = article.mainEntityOfPage || article.url || "";
      const postIdMatch = /(\d{8,})/.exec(urlToExtract);
      const postId = postIdMatch ? postIdMatch[1] : "";

      // Sum interaction counts.
      let interactionCount = 0;
      if (article.interactionStatistic) {
        interactionCount = article.interactionStatistic.reduce((sum, stat) => {
          const count =
            typeof stat.userInteractionCount === "number"
              ? stat.userInteractionCount
              : parseInt(String(stat.userInteractionCount), 10) || 0;
          return sum + count;
        }, 0);
      }

      // Extract image URL (handle both string and object formats).
      let imageUrl: string | undefined;
      if (typeof article.image === "string") {
        imageUrl = article.image;
      } else if (
        typeof article.image === "object" &&
        article.image !== null &&
        "url" in article.image
      ) {
        imageUrl = String(article.image.url);
      }

      // Parse commentCount.
      const commentCount =
        article.commentCount !== undefined
          ? typeof article.commentCount === "number"
            ? article.commentCount
            : parseInt(String(article.commentCount), 10) || undefined
          : undefined;

      results.push({
        position,
        postId,
        headline: article.headline,
        description: article.description,
        authorName: article.author.name,
        authorUrl: article.author.url,
        datePublished: article.datePublished,
        dateModified: article.dateModified,
        commentCount,
        interactionCount: interactionCount > 0 ? interactionCount : undefined,
        url: urlToExtract,
        image: imageUrl,
      });
    }
  }

  return results;
}
