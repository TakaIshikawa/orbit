/**
 * PubMed/NCBI Fetcher
 *
 * Primary source for biomedical literature via NCBI E-utilities API.
 * API docs: https://www.ncbi.nlm.nih.gov/books/NBK25500/
 *
 * Features:
 * - 35+ million citations from MEDLINE and life science journals
 * - Free access with API key (higher rate limits)
 * - Structured abstracts and MeSH terms
 */

import type { SourceFetcher, FetchedContent, FetchedItem, FetchOptions } from './index.js';

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

// Domain to MeSH term mappings for targeted searches
const DOMAIN_TO_MESH: Record<string, string[]> = {
  'health': ['Public Health', 'Health Services', 'Healthcare'],
  'disease': ['Communicable Diseases', 'Chronic Disease', 'Epidemiology'],
  'mental_health': ['Mental Disorders', 'Psychology', 'Psychiatry'],
  'nutrition': ['Nutrition', 'Diet', 'Obesity'],
  'aging': ['Aging', 'Geriatrics', 'Life Expectancy'],
  'climate': ['Climate Change', 'Environmental Health', 'Air Pollution'],
  'genetics': ['Genetics', 'Genomics', 'Gene Expression'],
};

interface PubMedArticle {
  uid: string;
  title: string;
  authors: Array<{ name: string }>;
  source: string; // Journal
  pubdate: string;
  epubdate?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  articleids?: Array<{ idtype: string; value: string }>;
  abstract?: string;
  fulljournalname?: string;
}

interface ESearchResult {
  esearchresult: {
    count: string;
    idlist: string[];
  };
}

interface ESummaryResult {
  result: {
    uids: string[];
    [uid: string]: PubMedArticle | string[];
  };
}

export class PubMedFetcher implements SourceFetcher {
  private lastRequestTime = 0;
  private readonly minRequestInterval = 334; // ~3 requests/second without API key

  canHandle(sourceType: string, url: string): boolean {
    return url.includes('pubmed') || url.includes('ncbi.nlm.nih.gov');
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

    // Build search query
    const query = this.buildSearchQuery(options.keywords, options.domains);

    try {
      // Step 1: Search for article IDs
      const ids = await this.searchArticles(query, options.maxItems);
      if (ids.length === 0) {
        return this.emptyResult(source);
      }

      // Step 2: Fetch article summaries
      const articles = await this.fetchSummaries(ids);

      for (const article of articles) {
        items.push(this.convertToFetchedItem(article, source));
      }
    } catch (error) {
      console.error('[PubMed] Fetch error:', error);
    }

    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      items,
      fetchedAt: new Date(),
      credibility: source.credibility,
    };
  }

  private buildSearchQuery(keywords: string[], domains: string[]): string {
    const parts: string[] = [];

    // Add keywords
    if (keywords.length > 0) {
      parts.push(`(${keywords.join(' OR ')})`);
    }

    // Add MeSH terms for domains
    const meshTerms: string[] = [];
    for (const domain of domains) {
      const terms = DOMAIN_TO_MESH[domain.toLowerCase()];
      if (terms) {
        meshTerms.push(...terms.map((t) => `"${t}"[MeSH Terms]`));
      }
    }
    if (meshTerms.length > 0) {
      parts.push(`(${meshTerms.join(' OR ')})`);
    }

    // Default to recent reviews if no specific query
    if (parts.length === 0) {
      return 'systematic review[pt] AND ("last 1 year"[dp])';
    }

    // Add recency filter and prefer reviews
    return `${parts.join(' AND ')} AND ("last 2 years"[dp])`;
  }

  private async searchArticles(query: string, maxResults: number): Promise<string[]> {
    await this.respectRateLimit();

    const params = new URLSearchParams({
      db: 'pubmed',
      term: query,
      retmax: String(Math.min(maxResults, 100)),
      retmode: 'json',
      sort: 'relevance',
    });

    const response = await fetch(`${EUTILS_BASE}/esearch.fcgi?${params}`);
    if (!response.ok) return [];

    const data = await response.json() as ESearchResult;
    return data.esearchresult?.idlist || [];
  }

  private async fetchSummaries(ids: string[]): Promise<PubMedArticle[]> {
    if (ids.length === 0) return [];

    await this.respectRateLimit();

    const params = new URLSearchParams({
      db: 'pubmed',
      id: ids.join(','),
      retmode: 'json',
    });

    const response = await fetch(`${EUTILS_BASE}/esummary.fcgi?${params}`);
    if (!response.ok) return [];

    const data = await response.json() as ESummaryResult;
    const articles: PubMedArticle[] = [];

    for (const uid of data.result?.uids || []) {
      const article = data.result[uid];
      if (article && typeof article !== 'string' && !Array.isArray(article)) {
        articles.push(article as PubMedArticle);
      }
    }

    return articles;
  }

  private convertToFetchedItem(
    article: PubMedArticle,
    source: { id: string; name: string; url: string; credibility: number }
  ): FetchedItem {
    const pmid = article.uid;
    const doi = article.articleids?.find((a) => a.idtype === 'doi')?.value;

    const authors = article.authors?.map((a) => a.name) || [];
    const pubDate = article.epubdate || article.pubdate;

    const journalInfo = [
      article.fulljournalname || article.source,
      article.volume && `Vol. ${article.volume}`,
      article.issue && `Issue ${article.issue}`,
      article.pages,
    ].filter(Boolean).join(', ');

    return {
      id: `pmid_${pmid}`,
      title: article.title,
      summary: `${article.title}. Published in ${journalInfo}. ${pubDate}.`,
      content: article.abstract || `${article.title}. ${journalInfo}`,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      publishedAt: this.parseDate(pubDate),
      authors,
      categories: ['PubMed', article.source],
      metadata: {
        pmid,
        doi,
        journal: article.fulljournalname || article.source,
        volume: article.volume,
        issue: article.issue,
        pages: article.pages,
        dataSource: 'PubMed/NCBI',
        isPeerReviewed: true,
        contentType: 'research_article',
      },
      popularity: {
        // PubMed doesn't provide citation counts directly
        // Would need Semantic Scholar enrichment
        citationCount: undefined,
      },
    };
  }

  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    try {
      // PubMed dates can be "YYYY Mon DD", "YYYY Mon", or "YYYY"
      const parsed = new Date(dateStr);
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  }

  private emptyResult(source: { id: string; name: string; url: string; credibility: number }): FetchedContent {
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      items: [],
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
}
