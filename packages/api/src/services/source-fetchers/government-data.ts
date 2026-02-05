/**
 * Government Open Data Fetcher
 *
 * Aggregates structured data from official government data portals:
 * - data.gov (US Federal)
 * - Eurostat (EU statistics)
 * - UN Data (United Nations)
 *
 * Features:
 * - Official statistics with high credibility
 * - Structured datasets with metadata
 * - Regular update schedules
 */

import type { SourceFetcher, FetchedContent, FetchedItem, FetchOptions } from './index.js';

interface DataPortalConfig {
  name: string;
  apiBase: string;
  searchEndpoint: string;
  credibilityBoost: number;
  coverage: string; // geographic coverage
}

const DATA_PORTALS: DataPortalConfig[] = [
  {
    name: 'data.gov',
    apiBase: 'https://catalog.data.gov/api/3',
    searchEndpoint: '/action/package_search',
    credibilityBoost: 0.1,
    coverage: 'US Federal',
  },
  {
    name: 'Eurostat',
    apiBase: 'https://ec.europa.eu/eurostat/api/dissemination',
    searchEndpoint: '/sdmx/2.1/dataflow/ESTAT',
    credibilityBoost: 0.1,
    coverage: 'European Union',
  },
];

// Domain to data.gov topic mappings
const DOMAIN_TO_TOPICS: Record<string, string[]> = {
  'health': ['health', 'Health'],
  'economics': ['finance', 'Finance', 'business', 'Business'],
  'climate': ['climate', 'Climate', 'environment', 'Environment'],
  'education': ['education', 'Education'],
  'agriculture': ['agriculture', 'Agriculture'],
  'energy': ['energy', 'Energy'],
  'transportation': ['transportation', 'Transportation'],
  'science': ['science', 'Science', 'research', 'Research'],
};

interface DataGovResult {
  results: Array<{
    id: string;
    name: string;
    title: string;
    notes?: string;
    organization?: { title: string };
    metadata_created: string;
    metadata_modified: string;
    resources?: Array<{
      format: string;
      url: string;
      name: string;
    }>;
    tags?: Array<{ name: string }>;
    extras?: Array<{ key: string; value: string }>;
  }>;
  count: number;
}

export class GovernmentDataFetcher implements SourceFetcher {
  private lastRequestTime = 0;
  private readonly minRequestInterval = 500;

  canHandle(sourceType: string, url: string): boolean {
    return (
      url.includes('data.gov') ||
      url.includes('eurostat') ||
      url.includes('data.un.org') ||
      sourceType === 'government_data'
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

    // Identify which portal based on URL
    if (source.url.includes('data.gov')) {
      const dataGovItems = await this.fetchFromDataGov(options, source);
      items.push(...dataGovItems);
    } else if (source.url.includes('eurostat')) {
      const eurostatItems = await this.fetchFromEurostat(options, source);
      items.push(...eurostatItems);
    } else if (source.url.includes('data.un.org')) {
      const unItems = await this.fetchFromUNData(options, source);
      items.push(...unItems);
    } else {
      // Fetch from data.gov by default
      const dataGovItems = await this.fetchFromDataGov(options, source);
      items.push(...dataGovItems);
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

  private async fetchFromDataGov(
    options: FetchOptions,
    source: { id: string; name: string; url: string; credibility: number }
  ): Promise<FetchedItem[]> {
    const items: FetchedItem[] = [];

    try {
      await this.respectRateLimit();

      // Build search query
      const query = this.buildDataGovQuery(options.keywords, options.domains);
      const params = new URLSearchParams({
        q: query,
        rows: String(Math.min(options.maxItems, 50)),
        sort: 'metadata_modified desc',
      });

      const url = `https://catalog.data.gov/api/3/action/package_search?${params}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`[GovernmentData] data.gov API error: ${response.status}`);
        return [];
      }

      const data = await response.json() as { result: DataGovResult };
      const results = data.result?.results || [];

      for (const dataset of results) {
        items.push(this.convertDataGovToItem(dataset, source));
      }
    } catch (error) {
      console.error('[GovernmentData] data.gov fetch error:', error);
    }

    return items;
  }

  private buildDataGovQuery(keywords: string[], domains: string[]): string {
    const parts: string[] = [];

    if (keywords.length > 0) {
      parts.push(keywords.join(' OR '));
    }

    // Add topic filters
    const topics: string[] = [];
    for (const domain of domains) {
      const domainTopics = DOMAIN_TO_TOPICS[domain.toLowerCase()];
      if (domainTopics) {
        topics.push(...domainTopics);
      }
    }
    if (topics.length > 0) {
      parts.push(`(${topics.map((t) => `tags:"${t}"`).join(' OR ')})`);
    }

    return parts.join(' AND ') || '*:*';
  }

  private convertDataGovToItem(
    dataset: DataGovResult['results'][0],
    source: { id: string; name: string; url: string; credibility: number }
  ): FetchedItem {
    const publisher = dataset.organization?.title || 'US Federal Government';
    const tags = dataset.tags?.map((t) => t.name) || [];
    const formats = dataset.resources?.map((r) => r.format).filter(Boolean) || [];

    // Find temporal coverage from extras
    const temporalCoverage = dataset.extras?.find((e) => e.key === 'temporal')?.value;

    return {
      id: `datagov_${dataset.id}`,
      title: dataset.title,
      summary: (dataset.notes || dataset.title).slice(0, 500),
      content: dataset.notes || dataset.title,
      url: `https://catalog.data.gov/dataset/${dataset.name}`,
      publishedAt: new Date(dataset.metadata_modified || dataset.metadata_created),
      authors: [publisher],
      categories: ['data.gov', ...tags.slice(0, 3)],
      metadata: {
        datasetId: dataset.id,
        publisher,
        formats,
        temporalCoverage,
        resourceCount: dataset.resources?.length || 0,
        dataSource: 'data.gov',
        contentType: 'dataset',
        isOfficialStatistic: true,
        geographicCoverage: 'United States',
      },
      popularity: {
        // Government data doesn't have traditional citations
        citationCount: undefined,
      },
    };
  }

  private async fetchFromEurostat(
    options: FetchOptions,
    source: { id: string; name: string; url: string; credibility: number }
  ): Promise<FetchedItem[]> {
    const items: FetchedItem[] = [];

    try {
      await this.respectRateLimit();

      // Eurostat uses SDMX API - fetch table of contents
      const tocUrl = 'https://ec.europa.eu/eurostat/api/dissemination/catalogue/toc?lang=EN&format=JSON';
      const response = await fetch(tocUrl);

      if (!response.ok) {
        console.error(`[GovernmentData] Eurostat API error: ${response.status}`);
        return [];
      }

      const data = await response.json() as {
        items?: Array<{
          code: string;
          title: string;
          shortDescription?: string;
          lastUpdate?: string;
          dataStart?: string;
          dataEnd?: string;
        }>;
      };

      const datasets = data.items || [];

      // Filter by keywords and domains
      const filtered = datasets.filter((d) => {
        const text = `${d.title} ${d.shortDescription || ''}`.toLowerCase();

        if (options.keywords.length > 0) {
          const hasKeyword = options.keywords.some((k) => text.includes(k.toLowerCase()));
          if (!hasKeyword) return false;
        }

        return true;
      });

      // Take most recent
      for (const dataset of filtered.slice(0, options.maxItems)) {
        items.push({
          id: `eurostat_${dataset.code}`,
          title: dataset.title,
          summary: dataset.shortDescription || dataset.title,
          content: dataset.shortDescription || dataset.title,
          url: `https://ec.europa.eu/eurostat/databrowser/view/${dataset.code}/default/table`,
          publishedAt: dataset.lastUpdate ? new Date(dataset.lastUpdate) : null,
          authors: ['Eurostat'],
          categories: ['Eurostat', 'EU Statistics'],
          metadata: {
            datasetCode: dataset.code,
            dataSource: 'Eurostat',
            contentType: 'dataset',
            isOfficialStatistic: true,
            geographicCoverage: 'European Union',
            temporalCoverage: dataset.dataStart && dataset.dataEnd
              ? `${dataset.dataStart} - ${dataset.dataEnd}`
              : undefined,
          },
        });
      }
    } catch (error) {
      console.error('[GovernmentData] Eurostat fetch error:', error);
    }

    return items;
  }

  private async fetchFromUNData(
    options: FetchOptions,
    source: { id: string; name: string; url: string; credibility: number }
  ): Promise<FetchedItem[]> {
    const items: FetchedItem[] = [];

    try {
      await this.respectRateLimit();

      // UN Data RSS feed
      const rssUrl = 'https://data.un.org/Handlers/RSSHandler.ashx';
      const response = await fetch(rssUrl, {
        headers: { 'User-Agent': 'Orbit-Discovery/1.0' },
      });

      if (!response.ok) {
        console.error(`[GovernmentData] UN Data RSS error: ${response.status}`);
        return [];
      }

      const xml = await response.text();
      const parsedItems = this.parseRSSFeed(xml, options, source);
      items.push(...parsedItems);
    } catch (error) {
      console.error('[GovernmentData] UN Data fetch error:', error);
    }

    return items;
  }

  private parseRSSFeed(
    xml: string,
    options: FetchOptions,
    source: { id: string; name: string; url: string; credibility: number }
  ): FetchedItem[] {
    const items: FetchedItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < options.maxItems) {
      const item = match[1];

      const title = this.extractTag(item, 'title') || '';
      const link = this.extractTag(item, 'link') || '';
      const description = this.extractTag(item, 'description') || '';
      const pubDate = this.extractTag(item, 'pubDate');

      // Filter by keywords
      if (options.keywords.length > 0) {
        const text = `${title} ${description}`.toLowerCase();
        const hasKeyword = options.keywords.some((k) => text.includes(k.toLowerCase()));
        if (!hasKeyword) continue;
      }

      items.push({
        id: link || `undata_${Date.now()}_${items.length}`,
        title: this.stripHtml(title),
        summary: this.stripHtml(description).slice(0, 500),
        content: this.stripHtml(description),
        url: link,
        publishedAt: pubDate ? new Date(pubDate) : null,
        authors: ['United Nations'],
        categories: ['UN Data', 'International Statistics'],
        metadata: {
          dataSource: 'UN Data',
          contentType: 'dataset',
          isOfficialStatistic: true,
          geographicCoverage: 'Global',
        },
      });
    }

    return items;
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
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
