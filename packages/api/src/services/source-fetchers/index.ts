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
  // Popularity/attention metrics (populated by enrichers)
  popularity?: {
    citationCount?: number;        // Total citations
    influentialCitationCount?: number; // Citations from influential papers
    referenceCount?: number;       // Number of references in this paper
    downloadCount?: number;        // Downloads (if available)
    viewCount?: number;            // Views (if available)
    altmetricScore?: number;       // Altmetric attention score
    trendingScore?: number;        // Computed trending score (recency + velocity)
  };
  // Computed relevance score (0-1) based on recency + popularity + topic match
  relevanceScore?: number;
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
// Phase 1: Priority Data Sources
export { WorldBankFetcher } from './world-bank.js';
export { WHOFetcher } from './who.js';
export { CochraneFetcher } from './cochrane.js';
export { ReutersFetcher } from './reuters.js';
// Phase 2: Research Sources
export { PubMedFetcher } from './pubmed.js';
export { NBERFetcher } from './nber.js';
export { ThinkTankFetcher } from './think-tanks.js';
// Phase 3: Fact-Checkers
export { FactCheckerFetcher } from './fact-checkers.js';
// Phase 5: Government Data
export { GovernmentDataFetcher } from './government-data.js';

export { SourceFetcherRegistry } from './registry.js';
export { SemanticScholarEnricher, getSemanticScholarEnricher } from './semantic-scholar.js';
