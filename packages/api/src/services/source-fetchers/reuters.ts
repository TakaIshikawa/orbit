/**
 * Reuters News Fetcher
 *
 * Premier wire service with global reach and fact-checking unit.
 * Uses Reuters RSS feeds and API where available.
 *
 * Features:
 * - Global news coverage from 200+ locations
 * - Reuters Fact Check unit
 * - Breaking news and in-depth analysis
 * - High journalistic standards
 */

import type { SourceFetcher, FetchedContent, FetchedItem, FetchOptions } from './index.js';

// Reuters RSS feed URLs by topic
const REUTERS_FEEDS: Record<string, string> = {
  'world': 'https://www.reuters.com/rssfeed/worldnews',
  'business': 'https://www.reuters.com/rssfeed/businessnews',
  'technology': 'https://www.reuters.com/rssfeed/technologynews',
  'health': 'https://www.reuters.com/rssfeed/healthnews',
  'environment': 'https://www.reuters.com/rssfeed/environment',
  'science': 'https://www.reuters.com/rssfeed/sciencenews',
  'politics': 'https://www.reuters.com/rssfeed/politicsnews',
  'factcheck': 'https://www.reuters.com/rssfeed/reuters-fact-check',
};

// Domain to Reuters section mapping
const DOMAIN_TO_FEEDS: Record<string, string[]> = {
  'economics': ['business', 'world'],
  'health': ['health', 'science'],
  'climate': ['environment', 'science'],
  'technology': ['technology', 'science'],
  'governance': ['politics', 'world'],
  'policy': ['politics', 'world', 'business'],
  'conflict': ['world', 'politics'],
  'science': ['science', 'technology', 'health'],
};

export class ReutersFetcher implements SourceFetcher {
  private lastRequestTime = 0;
  private readonly minRequestInterval = 300; // 300ms between requests

  canHandle(sourceType: string, url: string): boolean {
    return url.includes('reuters.com');
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

    // Get relevant feeds for the domains
    const feedUrls = this.getFeedsForDomains(options.domains);

    // Always include fact-check feed for credibility
    if (!feedUrls.includes(REUTERS_FEEDS['factcheck'])) {
      feedUrls.push(REUTERS_FEEDS['factcheck']);
    }

    // Fetch from each feed
    for (const feedUrl of feedUrls.slice(0, 4)) {
      try {
        await this.respectRateLimit();
        const feedItems = await this.fetchRSSFeed(feedUrl, options, source);
        items.push(...feedItems);
      } catch (error) {
        console.error(`[Reuters] Failed to fetch feed ${feedUrl}:`, error);
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const uniqueItems = items.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

    // Sort by date
    uniqueItems.sort((a, b) => {
      const dateA = a.publishedAt?.getTime() || 0;
      const dateB = b.publishedAt?.getTime() || 0;
      return dateB - dateA;
    });

    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      items: uniqueItems.slice(0, options.maxItems),
      fetchedAt: new Date(),
      credibility: source.credibility,
    };
  }

  private getFeedsForDomains(domains: string[]): string[] {
    const feeds = new Set<string>();

    for (const domain of domains) {
      const domainFeeds = DOMAIN_TO_FEEDS[domain.toLowerCase()];
      if (domainFeeds) {
        for (const feedName of domainFeeds) {
          const feedUrl = REUTERS_FEEDS[feedName];
          if (feedUrl) feeds.add(feedUrl);
        }
      }
    }

    // Default to world news if no match
    if (feeds.size === 0) {
      feeds.add(REUTERS_FEEDS['world']);
      feeds.add(REUTERS_FEEDS['business']);
    }

    return Array.from(feeds);
  }

  private async fetchRSSFeed(
    feedUrl: string,
    options: FetchOptions,
    source: { id: string; name: string; url: string; credibility: number }
  ): Promise<FetchedItem[]> {
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Orbit-Discovery/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Reuters feed: ${response.status}`);
    }

    const xml = await response.text();
    return this.parseRSSFeed(xml, options, source, feedUrl);
  }

  private parseRSSFeed(
    xml: string,
    options: FetchOptions,
    source: { id: string; name: string; url: string; credibility: number },
    feedUrl: string
  ): FetchedItem[] {
    const items: FetchedItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    const isFactCheck = feedUrl.includes('fact-check');
    const feedSection = this.detectFeedSection(feedUrl);

    while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
      const item = match[1];

      const title = this.extractTag(item, 'title') || '';
      const link = this.extractTag(item, 'link') || '';
      const description = this.extractTag(item, 'description') || '';
      const pubDate = this.extractTag(item, 'pubDate');
      const guid = this.extractTag(item, 'guid') || link;
      const creator = this.extractTag(item, 'dc:creator');

      // Filter by keywords if provided
      if (options.keywords.length > 0) {
        const text = `${title} ${description}`.toLowerCase();
        const hasKeyword = options.keywords.some((k) => text.includes(k.toLowerCase()));
        if (!hasKeyword) continue;
      }

      // Detect article type
      const articleType = this.detectArticleType(title, description, isFactCheck);

      // Calculate recency score
      const publishedAt = pubDate ? new Date(pubDate) : null;
      const recencyScore = this.calculateRecencyScore(publishedAt);

      items.push({
        id: guid,
        title: this.stripHtml(title),
        summary: this.stripHtml(description).slice(0, 500),
        content: this.stripHtml(description),
        url: link,
        publishedAt,
        authors: creator ? [creator] : ['Reuters'],
        categories: [feedSection, articleType, isFactCheck ? 'Fact Check' : 'News'].filter(Boolean),
        metadata: {
          feedSection,
          articleType,
          isFactCheck,
          isWireService: true,
          dataSource: 'Reuters',
          journalisticStandards: 'high',
          editorialProcess: 'professional',
        },
        popularity: {
          // Reuters is widely syndicated
          trendingScore: recencyScore,
        },
        relevanceScore: recencyScore,
      });
    }

    return items;
  }

  private detectFeedSection(feedUrl: string): string {
    for (const [section, url] of Object.entries(REUTERS_FEEDS)) {
      if (feedUrl === url) {
        return section.charAt(0).toUpperCase() + section.slice(1);
      }
    }
    return 'General';
  }

  private detectArticleType(title: string, description: string, isFactCheck: boolean): string {
    const text = `${title} ${description}`.toLowerCase();

    if (isFactCheck) {
      if (text.includes('false') || text.includes('misleading')) return 'Debunk';
      if (text.includes('true') || text.includes('correct')) return 'Verification';
      return 'Fact Check';
    }

    if (text.includes('analysis') || text.includes('insight')) return 'Analysis';
    if (text.includes('exclusive') || text.includes('sources say')) return 'Exclusive';
    if (text.includes('update') || text.includes('breaking')) return 'Breaking';
    if (text.includes('interview') || text.includes('says')) return 'Interview';
    if (text.includes('opinion') || text.includes('commentary')) return 'Opinion';

    return 'News';
  }

  private calculateRecencyScore(publishedAt: Date | null): number {
    if (!publishedAt) return 0.5;

    const now = new Date();
    const hoursSince = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);

    // Exponential decay: full score for <1 hour, half at 24 hours, quarter at 72 hours
    if (hoursSince <= 1) return 1.0;
    if (hoursSince <= 24) return 0.9 - (hoursSince / 24) * 0.4;
    if (hoursSince <= 72) return 0.5 - ((hoursSince - 24) / 48) * 0.25;
    if (hoursSince <= 168) return 0.25 - ((hoursSince - 72) / 96) * 0.15;

    return 0.1;
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
    // Handle namespaced tags like dc:creator
    const escapedTag = tag.replace(':', '\\:');
    const regex = new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)</${escapedTag}>`, 'i');
    const match = xml.match(regex);
    if (!match) return null;
    return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
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
