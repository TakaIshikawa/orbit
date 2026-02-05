/**
 * World Bank Open Data API Fetcher
 *
 * Primary source for global development indicators.
 * API docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
 *
 * Features:
 * - 16,000+ development indicators
 * - 200+ countries, 50+ years of data
 * - Free, no authentication required
 * - Rate limit: ~30 requests/second (generous)
 */

import type { SourceFetcher, FetchedContent, FetchedItem, FetchOptions } from './index.js';

const WB_API_BASE = 'https://api.worldbank.org/v2';

// Domain to World Bank topic mappings
const DOMAIN_TO_WB_TOPICS: Record<string, string[]> = {
  'economics': ['3', '21'], // Economy & Growth, Trade
  'health': ['8'], // Health
  'education': ['4'], // Education
  'climate': ['6', '19'], // Environment, Climate Change
  'poverty': ['11'], // Poverty
  'infrastructure': ['9', '16'], // Infrastructure, Urban Development
  'agriculture': ['1'], // Agriculture & Rural Development
  'energy': ['5'], // Energy & Mining
  'finance': ['7'], // Financial Sector
  'governance': ['13'], // Public Sector
};

// Key indicators by domain (most useful for discovery)
const KEY_INDICATORS: Record<string, string[]> = {
  'economics': [
    'NY.GDP.MKTP.KD.ZG', // GDP growth
    'NY.GDP.PCAP.KD', // GDP per capita
    'FP.CPI.TOTL.ZG', // Inflation
    'SL.UEM.TOTL.ZS', // Unemployment
  ],
  'health': [
    'SP.DYN.LE00.IN', // Life expectancy
    'SH.DYN.MORT', // Child mortality
    'SH.XPD.CHEX.GD.ZS', // Health expenditure % GDP
    'SH.MED.PHYS.ZS', // Physicians per 1000
  ],
  'climate': [
    'EN.ATM.CO2E.PC', // CO2 emissions per capita
    'EG.USE.PCAP.KG.OE', // Energy use per capita
    'AG.LND.FRST.ZS', // Forest area %
  ],
  'poverty': [
    'SI.POV.DDAY', // Poverty headcount $2.15/day
    'SI.POV.GINI', // Gini index
    'SI.DST.FRST.10', // Income share bottom 10%
  ],
  'education': [
    'SE.ADT.LITR.ZS', // Literacy rate
    'SE.PRM.ENRR', // Primary enrollment
    'SE.XPD.TOTL.GD.ZS', // Education expenditure % GDP
  ],
};

interface WBIndicator {
  id: string;
  name: string;
  sourceNote: string;
  sourceOrganization: string;
  topics: { id: string; value: string }[];
}

interface WBDataPoint {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  date: string;
  value: number | null;
}

export class WorldBankFetcher implements SourceFetcher {
  private lastRequestTime = 0;
  private readonly minRequestInterval = 100; // 100ms between requests

  canHandle(sourceType: string, url: string): boolean {
    return url.includes('worldbank.org') || url.includes('data.worldbank.org');
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

    // Get relevant indicators for the domains
    const indicators = this.getIndicatorsForDomains(options.domains);

    // Fetch recent data for each indicator
    for (const indicatorId of indicators.slice(0, 10)) {
      try {
        await this.respectRateLimit();

        // Get indicator metadata
        const metadata = await this.fetchIndicatorMetadata(indicatorId);
        if (!metadata) continue;

        // Get recent global/regional data
        const dataPoints = await this.fetchRecentData(indicatorId, options.keywords);

        if (dataPoints.length === 0) continue;

        // Create a summary item from the data
        const item = this.createItemFromData(metadata, dataPoints, source);
        items.push(item);

      } catch (error) {
        console.error(`[WorldBank] Failed to fetch indicator ${indicatorId}:`, error);
      }
    }

    // Also fetch recent World Bank blogs/reports if keywords provided
    if (options.keywords.length > 0) {
      const blogItems = await this.fetchBlogPosts(options.keywords, source);
      items.push(...blogItems);
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

  private getIndicatorsForDomains(domains: string[]): string[] {
    const indicators = new Set<string>();

    for (const domain of domains) {
      const domainIndicators = KEY_INDICATORS[domain.toLowerCase()];
      if (domainIndicators) {
        domainIndicators.forEach((i) => indicators.add(i));
      }
    }

    // Default to economics indicators if no match
    if (indicators.size === 0) {
      KEY_INDICATORS['economics'].forEach((i) => indicators.add(i));
    }

    return Array.from(indicators);
  }

  private async fetchIndicatorMetadata(indicatorId: string): Promise<WBIndicator | null> {
    const url = `${WB_API_BASE}/indicator/${indicatorId}?format=json`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json() as [unknown, WBIndicator[]];
      if (!data[1] || data[1].length === 0) return null;

      return data[1][0];
    } catch {
      return null;
    }
  }

  private async fetchRecentData(
    indicatorId: string,
    keywords: string[]
  ): Promise<WBDataPoint[]> {
    // Fetch world aggregate and major regions for recent years
    const regions = ['WLD', '1W']; // World, World (IDA & IBRD)
    const currentYear = new Date().getFullYear();
    const dateRange = `${currentYear - 5}:${currentYear}`;

    const url = `${WB_API_BASE}/country/${regions.join(';')}/indicator/${indicatorId}?format=json&date=${dateRange}&per_page=50`;

    try {
      const response = await fetch(url);
      if (!response.ok) return [];

      const data = await response.json() as [unknown, WBDataPoint[] | null];
      if (!data[1]) return [];

      return data[1].filter((d) => d.value !== null);
    } catch {
      return [];
    }
  }

  private createItemFromData(
    metadata: WBIndicator,
    dataPoints: WBDataPoint[],
    source: { id: string; name: string; url: string; credibility: number }
  ): FetchedItem {
    // Get most recent value
    const sorted = dataPoints.sort((a, b) => parseInt(b.date) - parseInt(a.date));
    const latest = sorted[0];
    const previous = sorted.find((d) => parseInt(d.date) < parseInt(latest.date));

    // Calculate change if possible
    let changeText = '';
    if (previous && latest.value && previous.value) {
      const change = ((latest.value - previous.value) / previous.value) * 100;
      changeText = ` (${change > 0 ? '+' : ''}${change.toFixed(1)}% from ${previous.date})`;
    }

    const summary = `${metadata.name}: ${latest.value?.toFixed(2) || 'N/A'} in ${latest.date}${changeText}. ${metadata.sourceNote?.slice(0, 300) || ''}`;

    return {
      id: `wb_${metadata.id}_${latest.date}`,
      title: `${metadata.name} - World Bank Data`,
      summary,
      content: `${summary}\n\nSource: ${metadata.sourceOrganization || 'World Bank'}\n\nMethodology: ${metadata.sourceNote || 'See World Bank data documentation.'}`,
      url: `https://data.worldbank.org/indicator/${metadata.id}`,
      publishedAt: new Date(`${latest.date}-01-01`),
      authors: ['World Bank'],
      categories: metadata.topics?.map((t) => t.value) || [],
      metadata: {
        indicatorId: metadata.id,
        latestValue: latest.value,
        latestYear: latest.date,
        previousValue: previous?.value,
        previousYear: previous?.date,
        dataSource: 'World Bank Open Data API',
        isOfficialStatistic: true,
      },
      popularity: {
        // World Bank data is highly cited
        citationCount: 100, // Placeholder - WB indicators are widely used
      },
    };
  }

  private async fetchBlogPosts(
    keywords: string[],
    source: { id: string; name: string; url: string; credibility: number }
  ): Promise<FetchedItem[]> {
    // World Bank blogs RSS feed
    const rssUrl = 'https://blogs.worldbank.org/rss.xml';

    try {
      await this.respectRateLimit();
      const response = await fetch(rssUrl, {
        headers: { 'User-Agent': 'Orbit-Discovery/1.0' },
      });

      if (!response.ok) return [];

      const xml = await response.text();
      const items: FetchedItem[] = [];

      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;

      while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
        const item = match[1];

        const title = this.extractTag(item, 'title') || '';
        const link = this.extractTag(item, 'link') || '';
        const description = this.extractTag(item, 'description') || '';
        const pubDate = this.extractTag(item, 'pubDate');

        // Filter by keywords
        const text = `${title} ${description}`.toLowerCase();
        const hasKeyword = keywords.some((k) => text.includes(k.toLowerCase()));
        if (!hasKeyword && keywords.length > 0) continue;

        items.push({
          id: link,
          title: this.stripHtml(title),
          summary: this.stripHtml(description).slice(0, 500),
          content: this.stripHtml(description),
          url: link,
          publishedAt: pubDate ? new Date(pubDate) : null,
          authors: ['World Bank'],
          categories: ['World Bank Blog'],
          metadata: {
            contentType: 'blog',
            dataSource: 'World Bank Blogs',
          },
        });
      }

      return items;
    } catch {
      return [];
    }
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
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
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
      .replace(/\s+/g, ' ')
      .trim();
  }
}
