/**
 * NBER Working Papers Fetcher
 *
 * National Bureau of Economic Research - premier source for economics research.
 * Uses RSS feeds for working papers.
 *
 * Features:
 * - Working papers from top economists
 * - Pre-publication research (6-12 months before journals)
 * - Strong methodology standards
 */

import type { SourceFetcher, FetchedContent, FetchedItem, FetchOptions } from './index.js';

// NBER program codes by domain
const DOMAIN_TO_PROGRAMS: Record<string, string[]> = {
  'economics': ['EFG', 'ME', 'PR'],  // Economic Fluctuations, Monetary Economics, Productivity
  'health': ['HC', 'AG'],             // Health Care, Aging
  'labor': ['LS', 'ED'],              // Labor Studies, Education
  'development': ['DEV'],             // Development Economics
  'environment': ['EEE'],             // Environment and Energy
  'finance': ['CF', 'AP'],            // Corporate Finance, Asset Pricing
  'trade': ['ITI'],                   // International Trade
  'policy': ['PE', 'POL'],            // Public Economics, Political Economy
};

export class NBERFetcher implements SourceFetcher {
  private lastRequestTime = 0;
  private readonly minRequestInterval = 500;

  canHandle(sourceType: string, url: string): boolean {
    return url.includes('nber.org');
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

    // Fetch from NBER new working papers RSS
    const rssUrl = 'https://www.nber.org/rss/new.xml';

    try {
      await this.respectRateLimit();
      const response = await fetch(rssUrl, {
        headers: { 'User-Agent': 'Orbit-Discovery/1.0' },
      });

      if (!response.ok) {
        throw new Error(`NBER RSS fetch failed: ${response.status}`);
      }

      const xml = await response.text();
      const parsedItems = this.parseRSSFeed(xml, options, source);
      items.push(...parsedItems);
    } catch (error) {
      console.error('[NBER] Fetch error:', error);
    }

    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      items: items.slice(0, options.maxItems),
      fetchedAt: new Date(),
      credibility: source.credibility,
    };
  }

  private parseRSSFeed(
    xml: string,
    options: FetchOptions,
    source: { id: string; name: string; url: string; credibility: number }
  ): FetchedItem[] {
    const items: FetchedItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 30) {
      const item = match[1];

      const title = this.extractTag(item, 'title') || '';
      const link = this.extractTag(item, 'link') || '';
      const description = this.extractTag(item, 'description') || '';
      const pubDate = this.extractTag(item, 'pubDate');
      const creator = this.extractTag(item, 'dc:creator');

      // Extract NBER paper number from URL
      const paperMatch = link.match(/papers\/w(\d+)/);
      const paperId = paperMatch ? paperMatch[1] : null;

      // Filter by keywords if provided
      if (options.keywords.length > 0) {
        const text = `${title} ${description}`.toLowerCase();
        const hasKeyword = options.keywords.some((k) => text.includes(k.toLowerCase()));
        if (!hasKeyword) continue;
      }

      // Filter by domain relevance
      if (options.domains.length > 0) {
        const text = `${title} ${description}`.toLowerCase();
        const relevantTerms = this.getDomainTerms(options.domains);
        const isRelevant = relevantTerms.some((term) => text.includes(term.toLowerCase()));
        if (!isRelevant) continue;
      }

      // Extract authors from description or creator
      const authors = this.extractAuthors(description, creator);

      items.push({
        id: paperId ? `nber_w${paperId}` : link,
        title: this.stripHtml(title),
        summary: this.stripHtml(description).slice(0, 500),
        content: this.stripHtml(description),
        url: link,
        publishedAt: pubDate ? new Date(pubDate) : null,
        authors,
        categories: ['NBER Working Paper', 'Economics'],
        metadata: {
          paperId: paperId ? `w${paperId}` : null,
          contentType: 'working_paper',
          dataSource: 'NBER',
          isPeerReviewed: false, // Working papers aren't peer-reviewed yet
          isPreprint: true,
          methodologyRating: 'high', // NBER has rigorous standards
        },
        popularity: {
          // NBER papers are typically well-cited
          citationCount: 20, // Conservative estimate for new papers
        },
      });
    }

    return items;
  }

  private getDomainTerms(domains: string[]): string[] {
    const termMap: Record<string, string[]> = {
      'economics': ['economic', 'gdp', 'growth', 'inflation', 'recession', 'monetary'],
      'health': ['health', 'healthcare', 'medical', 'mortality', 'insurance'],
      'labor': ['labor', 'employment', 'wage', 'unemployment', 'worker'],
      'education': ['education', 'school', 'student', 'learning', 'college'],
      'development': ['development', 'poverty', 'aid', 'developing'],
      'environment': ['climate', 'environment', 'energy', 'carbon', 'pollution'],
      'finance': ['finance', 'banking', 'credit', 'stock', 'investment'],
      'trade': ['trade', 'tariff', 'export', 'import', 'globalization'],
      'policy': ['policy', 'government', 'tax', 'regulation', 'fiscal'],
    };

    const terms: string[] = [];
    for (const domain of domains) {
      const domainTerms = termMap[domain.toLowerCase()];
      if (domainTerms) {
        terms.push(...domainTerms);
      }
    }

    return terms.length > 0 ? terms : ['economic'];
  }

  private extractAuthors(description: string, creator: string | null): string[] {
    if (creator) {
      return creator.split(/,|and/).map((a) => a.trim()).filter(Boolean);
    }

    // Try to extract from description (NBER format often has "by Author1, Author2")
    const byMatch = description.match(/by\s+([^.]+)/i);
    if (byMatch) {
      return byMatch[1].split(/,|and/).map((a) => a.trim()).filter(Boolean);
    }

    return ['NBER'];
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
