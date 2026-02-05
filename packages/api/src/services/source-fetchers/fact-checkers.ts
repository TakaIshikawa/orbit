/**
 * Fact-Checker Aggregator Fetcher
 *
 * Aggregates content from major independent fact-checking organizations:
 * - Snopes (oldest, broadest scope)
 * - PolitiFact (political claims, Truth-O-Meter)
 * - Full Fact (UK-based, IFCN certified)
 *
 * All are IFCN (International Fact-Checking Network) signatories.
 *
 * Features:
 * - Verified claim assessments
 * - Structured ratings (True/False/Mixed)
 * - Source citations
 */

import type { SourceFetcher, FetchedContent, FetchedItem, FetchOptions } from './index.js';

interface FactCheckerConfig {
  name: string;
  rssUrl: string;
  baseUrl: string;
  ratingField?: string;
  isIFCNCertified: boolean;
}

const FACT_CHECKERS: FactCheckerConfig[] = [
  {
    name: 'Snopes',
    rssUrl: 'https://www.snopes.com/feed/',
    baseUrl: 'https://www.snopes.com',
    isIFCNCertified: true,
  },
  {
    name: 'PolitiFact',
    rssUrl: 'https://www.politifact.com/rss/all/',
    baseUrl: 'https://www.politifact.com',
    ratingField: 'truth-o-meter',
    isIFCNCertified: true,
  },
  {
    name: 'Full Fact',
    rssUrl: 'https://fullfact.org/feed/',
    baseUrl: 'https://fullfact.org',
    isIFCNCertified: true,
  },
];

// Normalized rating categories
type FactCheckRating = 'true' | 'mostly_true' | 'mixed' | 'mostly_false' | 'false' | 'unrated';

export class FactCheckerFetcher implements SourceFetcher {
  private lastRequestTime = 0;
  private readonly minRequestInterval = 500;

  canHandle(sourceType: string, url: string): boolean {
    return (
      url.includes('snopes.com') ||
      url.includes('politifact.com') ||
      url.includes('fullfact.org') ||
      sourceType === 'fact_checker'
    );
  }

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
  ): Promise<FetchedContent> {
    const items: FetchedItem[] = [];

    // Determine which fact-checker based on URL, or fetch from all
    const factChecker = this.identifyFactChecker(source.url);

    if (factChecker) {
      const fcItems = await this.fetchFromFactChecker(factChecker, options, source);
      items.push(...fcItems);
    } else {
      // Fetch from all fact-checkers
      for (const fc of FACT_CHECKERS) {
        const fcItems = await this.fetchFromFactChecker(fc, options, source);
        items.push(...fcItems);
      }
    }

    // Sort by date
    items.sort((a, b) => {
      const dateA = a.publishedAt?.getTime() || 0;
      const dateB = b.publishedAt?.getTime() || 0;
      return dateB - dateA;
    });

    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      items: items.slice(0, options.maxItems),
      fetchedAt: new Date(),
      credibility: source.credibility,
    };
  }

  private identifyFactChecker(url: string): FactCheckerConfig | null {
    for (const fc of FACT_CHECKERS) {
      if (url.includes(new URL(fc.baseUrl).hostname)) {
        return fc;
      }
    }
    return null;
  }

  private async fetchFromFactChecker(
    fc: FactCheckerConfig,
    options: FetchOptions,
    source: { id: string; name: string; url: string; credibility: number }
  ): Promise<FetchedItem[]> {
    try {
      await this.respectRateLimit();

      const response = await fetch(fc.rssUrl, {
        headers: { 'User-Agent': 'Orbit-Discovery/1.0' },
      });

      if (!response.ok) {
        console.error(`[FactChecker] Failed to fetch from ${fc.name}: ${response.status}`);
        return [];
      }

      const xml = await response.text();
      return this.parseRSSFeed(xml, fc, options, source);
    } catch (error) {
      console.error(`[FactChecker] Error fetching from ${fc.name}:`, error);
      return [];
    }
  }

  private parseRSSFeed(
    xml: string,
    fc: FactCheckerConfig,
    options: FetchOptions,
    source: { id: string; name: string; url: string; credibility: number }
  ): FetchedItem[] {
    const items: FetchedItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
      const item = match[1];

      const title = this.extractTag(item, 'title') || '';
      const link = this.extractTag(item, 'link') || '';
      const description = this.extractTag(item, 'description') || '';
      const pubDate = this.extractTag(item, 'pubDate');
      const creator = this.extractTag(item, 'dc:creator');
      const categories = this.extractAllTags(item, 'category');

      // Filter by keywords if provided
      if (options.keywords.length > 0) {
        const text = `${title} ${description}`.toLowerCase();
        const hasKeyword = options.keywords.some((k) => text.includes(k.toLowerCase()));
        if (!hasKeyword) continue;
      }

      // Extract rating from title/description/categories
      const rating = this.extractRating(title, description, categories, fc);

      // Determine claim type
      const claimType = this.detectClaimType(title, description, categories);

      items.push({
        id: link,
        title: this.stripHtml(title),
        summary: this.stripHtml(description).slice(0, 500),
        content: this.stripHtml(description),
        url: link,
        publishedAt: pubDate ? new Date(pubDate) : null,
        authors: creator ? [creator] : [fc.name],
        categories: [fc.name, 'Fact Check', ...categories.slice(0, 2)],
        metadata: {
          factChecker: fc.name,
          rating,
          ratingNormalized: this.normalizeRating(rating),
          claimType,
          isIFCNCertified: fc.isIFCNCertified,
          dataSource: fc.name,
          contentType: 'fact_check',
          methodologyRating: 'verified', // IFCN standards
        },
        popularity: {
          // Fact checks often go viral
          trendingScore: rating === 'false' ? 0.8 : 0.5,
        },
      });
    }

    return items;
  }

  private extractRating(
    title: string,
    description: string,
    categories: string[],
    fc: FactCheckerConfig
  ): string {
    const text = `${title} ${description}`.toLowerCase();
    const cats = categories.map((c) => c.toLowerCase());

    // Snopes ratings
    if (fc.name === 'Snopes') {
      if (text.includes('true') && !text.includes('false') && !text.includes('mostly')) return 'True';
      if (text.includes('false') && !text.includes('true')) return 'False';
      if (text.includes('mostly true')) return 'Mostly True';
      if (text.includes('mostly false')) return 'Mostly False';
      if (text.includes('mixture') || text.includes('mixed')) return 'Mixture';
      if (text.includes('unproven')) return 'Unproven';
      if (text.includes('outdated')) return 'Outdated';
    }

    // PolitiFact Truth-O-Meter
    if (fc.name === 'PolitiFact') {
      if (cats.includes('true') || text.includes('rates true')) return 'True';
      if (cats.includes('mostly true') || text.includes('mostly true')) return 'Mostly True';
      if (cats.includes('half true') || text.includes('half true')) return 'Half True';
      if (cats.includes('mostly false') || text.includes('mostly false')) return 'Mostly False';
      if (cats.includes('false') || text.includes('rates false')) return 'False';
      if (cats.includes('pants on fire') || text.includes('pants on fire')) return 'Pants on Fire';
    }

    // Full Fact (UK) - typically more nuanced
    if (fc.name === 'Full Fact') {
      if (text.includes('correct') && !text.includes('incorrect')) return 'Correct';
      if (text.includes('incorrect') || text.includes('wrong')) return 'Incorrect';
      if (text.includes('misleading')) return 'Misleading';
      if (text.includes('lacks context')) return 'Lacks Context';
    }

    return 'Unrated';
  }

  private normalizeRating(rating: string): FactCheckRating {
    const r = rating.toLowerCase();

    if (['true', 'correct'].includes(r)) return 'true';
    if (['mostly true'].includes(r)) return 'mostly_true';
    if (['mixture', 'mixed', 'half true', 'misleading', 'lacks context'].includes(r)) return 'mixed';
    if (['mostly false'].includes(r)) return 'mostly_false';
    if (['false', 'incorrect', 'pants on fire', 'wrong'].includes(r)) return 'false';

    return 'unrated';
  }

  private detectClaimType(title: string, description: string, categories: string[]): string {
    const text = `${title} ${description}`.toLowerCase();
    const cats = categories.map((c) => c.toLowerCase());

    if (cats.some((c) => c.includes('politic')) || text.includes('politician')) return 'political';
    if (cats.some((c) => c.includes('health')) || text.includes('health') || text.includes('covid')) return 'health';
    if (cats.some((c) => c.includes('science')) || text.includes('scientific')) return 'science';
    if (text.includes('viral') || text.includes('social media')) return 'viral_claim';
    if (text.includes('quote') || text.includes('said')) return 'quote_verification';
    if (text.includes('statistic') || text.includes('data')) return 'statistical';

    return 'general';
  }

  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestInterval) {
      await new Promise((resolve) => setTimeout(resolve, this.minRequestInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private extractTag(xml: string, tag: string): string | null {
    const escapedTag = tag.replace(':', '\\:');
    const regex = new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)</${escapedTag}>`, 'i');
    const match = xml.match(regex);
    if (!match) return null;
    return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  }

  private extractAllTags(xml: string, tag: string): string[] {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const value = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
      if (value) matches.push(value);
    }
    return matches;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
