/**
 * arXiv API Fetcher
 *
 * Uses the official arXiv API: https://arxiv.org/help/api
 * Rate limit: 1 request per 3 seconds
 *
 * API is free and requires no authentication.
 */

import type { SourceFetcher, FetchedContent, FetchedItem, FetchOptions } from './index.js';

const ARXIV_API_BASE = 'https://export.arxiv.org/api/query';

// arXiv category mappings for common domains
const DOMAIN_TO_ARXIV_CATEGORIES: Record<string, string[]> = {
  'ai': ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV', 'stat.ML'],
  'machine-learning': ['cs.LG', 'stat.ML'],
  'climate': ['physics.ao-ph', 'physics.geo-ph', 'q-bio.PE'],
  'economics': ['econ.GN', 'q-fin.EC', 'q-fin.GN'],
  'health': ['q-bio.QM', 'q-bio.PE', 'cs.CY'],
  'policy': ['cs.CY', 'econ.GN', 'physics.soc-ph'],
  'technology': ['cs.AI', 'cs.SE', 'cs.CR', 'cs.DC'],
  'security': ['cs.CR', 'cs.AI'],
  'biology': ['q-bio.GN', 'q-bio.PE', 'q-bio.QM'],
  'physics': ['physics.gen-ph', 'physics.soc-ph'],
  'mathematics': ['math.OC', 'math.ST', 'stat.TH'],
};

export class ArxivFetcher implements SourceFetcher {
  private lastRequestTime = 0;
  private readonly minRequestInterval = 3000; // 3 seconds per arXiv guidelines

  canHandle(sourceType: string, url: string): boolean {
    // Handle both 'research' and 'preprint' source types for arXiv
    return (sourceType === 'research' || sourceType === 'preprint') && url.includes('arxiv.org');
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
    await this.respectRateLimit();

    // Build search query
    const searchTerms = this.buildSearchQuery(options);
    const categories = this.getCategories(options.domains);

    // Construct API URL
    const params = new URLSearchParams({
      search_query: searchTerms,
      start: '0',
      max_results: String(Math.min(options.maxItems, 50)), // arXiv max is 50 per request
      sortBy: 'submittedDate',
      sortOrder: 'descending',
    });

    const apiUrl = `${ARXIV_API_BASE}?${params.toString()}`;
    console.log(`[arXiv] Fetching: ${apiUrl}`);

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`arXiv API error: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const items = this.parseAtomFeed(xml);

    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      items,
      fetchedAt: new Date(),
      credibility: source.credibility,
    };
  }

  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestInterval) {
      await new Promise((resolve) => setTimeout(resolve, this.minRequestInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private buildSearchQuery(options: FetchOptions): string {
    const parts: string[] = [];

    // Add keyword search
    if (options.keywords.length > 0) {
      const keywordQuery = options.keywords
        .map((k) => `all:"${k}"`)
        .join(' OR ');
      parts.push(`(${keywordQuery})`);
    }

    // Add category filter
    const categories = this.getCategories(options.domains);
    if (categories.length > 0) {
      const catQuery = categories.map((c) => `cat:${c}`).join(' OR ');
      parts.push(`(${catQuery})`);
    }

    // If no keywords or domains, default to recent AI papers
    if (parts.length === 0) {
      parts.push('(cat:cs.AI OR cat:cs.LG)');
    }

    return parts.join(' AND ');
  }

  private getCategories(domains: string[]): string[] {
    const categories = new Set<string>();
    for (const domain of domains) {
      const cats = DOMAIN_TO_ARXIV_CATEGORIES[domain.toLowerCase()];
      if (cats) {
        cats.forEach((c) => categories.add(c));
      }
    }
    return Array.from(categories);
  }

  private parseAtomFeed(xml: string): FetchedItem[] {
    const items: FetchedItem[] = [];

    // Simple XML parsing for Atom feed
    // In production, use a proper XML parser
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];

      const id = this.extractTag(entry, 'id') || '';
      const title = this.extractTag(entry, 'title')?.replace(/\s+/g, ' ').trim() || '';
      const summary = this.extractTag(entry, 'summary')?.replace(/\s+/g, ' ').trim() || '';
      const published = this.extractTag(entry, 'published');
      const updated = this.extractTag(entry, 'updated');

      // Extract authors
      const authors: string[] = [];
      const authorRegex = /<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g;
      let authorMatch;
      while ((authorMatch = authorRegex.exec(entry)) !== null) {
        authors.push(authorMatch[1].trim());
      }

      // Extract categories
      const categories: string[] = [];
      const catRegex = /<category[^>]*term="([^"]+)"/g;
      let catMatch;
      while ((catMatch = catRegex.exec(entry)) !== null) {
        categories.push(catMatch[1]);
      }

      // Extract PDF link
      const pdfLinkMatch = entry.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/);
      const pdfUrl = pdfLinkMatch ? pdfLinkMatch[1] : '';

      // Extract abstract page link
      const absLinkMatch = entry.match(/<link[^>]*type="text\/html"[^>]*href="([^"]+)"/);
      const absUrl = absLinkMatch ? absLinkMatch[1] : id;

      items.push({
        id: id.replace('http://arxiv.org/abs/', ''),
        title,
        summary,
        content: summary, // arXiv API only provides abstract, not full text
        url: absUrl,
        publishedAt: published ? new Date(published) : null,
        authors,
        categories,
        metadata: {
          pdfUrl,
          updated: updated ? new Date(updated) : null,
          arxivId: id.replace('http://arxiv.org/abs/', ''),
        },
      });
    }

    return items;
  }

  private extractTag(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
    const match = xml.match(regex);
    return match ? match[1] : null;
  }
}
