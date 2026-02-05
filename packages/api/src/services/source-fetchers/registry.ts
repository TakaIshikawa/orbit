/**
 * Source Fetcher Registry
 *
 * Manages all available source fetchers and routes
 * fetch requests to the appropriate handler.
 */

import type { SourceFetcher, FetchedContent, FetchOptions } from './index.js';
import { ArxivFetcher } from './arxiv.js';
import { OWIDFetcher } from './owid.js';
import { RSSFetcher } from './rss.js';
// Phase 1: Priority Data Sources
import { WorldBankFetcher } from './world-bank.js';
import { WHOFetcher } from './who.js';
import { CochraneFetcher } from './cochrane.js';
import { ReutersFetcher } from './reuters.js';
// Phase 2: Research Sources
import { PubMedFetcher } from './pubmed.js';
import { NBERFetcher } from './nber.js';
import { ThinkTankFetcher } from './think-tanks.js';
// Phase 3: Fact-Checkers
import { FactCheckerFetcher } from './fact-checkers.js';
// Phase 5: Government Data
import { GovernmentDataFetcher } from './government-data.js';

export class SourceFetcherRegistry {
  private fetchers: SourceFetcher[] = [];
  private static instance: SourceFetcherRegistry | null = null;

  private constructor() {
    // Register fetchers in priority order (most specific first)
    this.fetchers = [
      // Existing
      new ArxivFetcher(),
      new OWIDFetcher(),
      // Phase 1: Priority Data Sources
      new WorldBankFetcher(),
      new WHOFetcher(),
      new CochraneFetcher(),
      new ReutersFetcher(),
      // Phase 2: Research Sources
      new PubMedFetcher(),
      new NBERFetcher(),
      new ThinkTankFetcher(),
      // Phase 3: Fact-Checkers
      new FactCheckerFetcher(),
      // Phase 5: Government Data
      new GovernmentDataFetcher(),
      // Fallback
      new RSSFetcher(),
    ];
  }

  static getInstance(): SourceFetcherRegistry {
    if (!SourceFetcherRegistry.instance) {
      SourceFetcherRegistry.instance = new SourceFetcherRegistry();
    }
    return SourceFetcherRegistry.instance;
  }

  /**
   * Find the appropriate fetcher for a source
   */
  getFetcher(sourceType: string, url: string): SourceFetcher | null {
    for (const fetcher of this.fetchers) {
      if (fetcher.canHandle(sourceType, url)) {
        return fetcher;
      }
    }
    return null;
  }

  /**
   * Fetch content from a source using the appropriate fetcher
   */
  async fetch(
    source: {
      id: string;
      name: string;
      url: string;
      sourceType: string;
      domains: string[];
      credibility: number;
    },
    options: FetchOptions
  ): Promise<FetchedContent | null> {
    const fetcher = this.getFetcher(source.sourceType, source.url);

    if (!fetcher) {
      console.warn(`[Registry] No fetcher available for source: ${source.name} (${source.sourceType})`);
      return null;
    }

    try {
      const content = await fetcher.fetch(source, options);
      console.log(`[Registry] Fetched ${content.items.length} items from ${source.name}`);
      return content;
    } catch (error) {
      console.error(`[Registry] Error fetching from ${source.name}:`, error);
      return null;
    }
  }

  /**
   * Fetch from multiple sources in parallel with error handling
   */
  async fetchMany(
    sources: Array<{
      id: string;
      name: string;
      url: string;
      sourceType: string;
      domains: string[];
      credibility: number;
    }>,
    options: FetchOptions
  ): Promise<FetchedContent[]> {
    const results = await Promise.allSettled(
      sources.map((source) => this.fetch(source, options))
    );

    return results
      .filter((result): result is PromiseFulfilledResult<FetchedContent | null> =>
        result.status === 'fulfilled' && result.value !== null
      )
      .map((result) => result.value as FetchedContent);
  }

  /**
   * Register a custom fetcher
   */
  registerFetcher(fetcher: SourceFetcher): void {
    // Add to beginning so custom fetchers take priority
    this.fetchers.unshift(fetcher);
  }
}
