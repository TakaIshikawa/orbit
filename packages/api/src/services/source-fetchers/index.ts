/**
 * Source Fetchers - Fetch real content from managed sources
 *
 * Each fetcher implements the SourceFetcher interface and handles
 * a specific source type (RSS, API, etc.)
 */

export interface FetchedContent {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  items: FetchedItem[];
  fetchedAt: Date;
  credibility: number;
}

export interface FetchedItem {
  id: string;
  title: string;
  summary: string;
  content: string;
  url: string;
  publishedAt: Date | null;
  authors: string[];
  categories: string[];
  metadata: Record<string, unknown>;
}

export interface SourceFetcher {
  canHandle(sourceType: string, url: string): boolean;
  fetch(source: {
    id: string;
    name: string;
    url: string;
    sourceType: string;
    domains: string[];
    credibility: number;
  }, options: FetchOptions): Promise<FetchedContent>;
}

export interface FetchOptions {
  keywords: string[];
  domains: string[];
  maxItems: number;
  since?: Date;
}

export { ArxivFetcher } from './arxiv.js';
export { OWIDFetcher } from './owid.js';
export { RSSFetcher } from './rss.js';
export { SourceFetcherRegistry } from './registry.js';
