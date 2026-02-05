/**
 * Semantic Scholar API Enricher
 *
 * Enriches academic papers with citation data from Semantic Scholar.
 * API docs: https://api.semanticscholar.org/api-docs/
 *
 * Rate limits (unauthenticated):
 * - 100 requests per 5 minutes
 * - Batch endpoint: up to 500 papers per request
 */

import type { FetchedItem } from './index.js';

const S2_API_BASE = 'https://api.semanticscholar.org/graph/v1';

interface S2PaperResponse {
  paperId: string;
  title: string;
  citationCount: number;
  influentialCitationCount: number;
  referenceCount: number;
  publicationDate: string | null;
  fieldsOfStudy: string[] | null;
  isOpenAccess: boolean;
  openAccessPdf: { url: string } | null;
}

interface S2BatchResponse {
  [index: number]: S2PaperResponse | null;
}

export class SemanticScholarEnricher {
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly maxRequestsPerWindow = 90; // Leave some buffer
  private readonly windowMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Enrich a single paper with citation data
   */
  async enrichPaper(item: FetchedItem): Promise<FetchedItem> {
    const arxivId = this.extractArxivId(item);
    if (!arxivId) {
      return item;
    }

    await this.respectRateLimit();

    try {
      const response = await fetch(
        `${S2_API_BASE}/paper/arXiv:${arxivId}?fields=citationCount,influentialCitationCount,referenceCount,publicationDate,fieldsOfStudy,isOpenAccess,openAccessPdf`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          // Paper not in Semantic Scholar yet (common for very new papers)
          return item;
        }
        console.warn(`[S2] API error for ${arxivId}: ${response.status}`);
        return item;
      }

      const data = await response.json() as S2PaperResponse;
      return this.applyEnrichment(item, data);
    } catch (error) {
      console.error(`[S2] Failed to enrich ${arxivId}:`, error);
      return item;
    }
  }

  /**
   * Batch enrich multiple papers (more efficient)
   * Uses the batch endpoint to reduce API calls
   */
  async enrichPapers(items: FetchedItem[]): Promise<FetchedItem[]> {
    // Extract arXiv IDs
    const arxivIds = items.map(item => this.extractArxivId(item));
    const validIndices = arxivIds
      .map((id, idx) => (id ? idx : -1))
      .filter(idx => idx !== -1);

    if (validIndices.length === 0) {
      return items;
    }

    await this.respectRateLimit();

    try {
      // Semantic Scholar batch endpoint accepts up to 500 IDs
      const idsToFetch = validIndices
        .map(idx => `arXiv:${arxivIds[idx]}`)
        .slice(0, 500);

      const response = await fetch(
        `${S2_API_BASE}/paper/batch?fields=citationCount,influentialCitationCount,referenceCount,publicationDate,fieldsOfStudy,isOpenAccess`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ ids: idsToFetch }),
        }
      );

      if (!response.ok) {
        console.warn(`[S2] Batch API error: ${response.status}`);
        return items;
      }

      const results = await response.json() as (S2PaperResponse | null)[];

      // Apply enrichments
      const enrichedItems = [...items];
      results.forEach((result, batchIdx) => {
        if (result) {
          const originalIdx = validIndices[batchIdx];
          enrichedItems[originalIdx] = this.applyEnrichment(items[originalIdx], result);
        }
      });

      console.log(`[S2] Enriched ${results.filter(r => r).length}/${idsToFetch.length} papers`);
      return enrichedItems;
    } catch (error) {
      console.error('[S2] Batch enrichment failed:', error);
      return items;
    }
  }

  /**
   * Compute a relevance score based on recency and citations
   */
  computeRelevanceScore(item: FetchedItem, keywords: string[]): number {
    let score = 0;

    // Recency score (0-0.4): exponential decay over 90 days
    if (item.publishedAt) {
      const daysSincePublished = (Date.now() - item.publishedAt.getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.exp(-daysSincePublished / 30) * 0.4; // Half-life of 30 days
      score += recencyScore;
    }

    // Citation score (0-0.3): logarithmic scale
    const citations = item.popularity?.citationCount ?? 0;
    if (citations > 0) {
      // log10(citations + 1) / log10(1001) gives 0-1 scale for 0-1000 citations
      const citationScore = Math.min(1, Math.log10(citations + 1) / 3) * 0.3;
      score += citationScore;
    }

    // Influential citation bonus (0-0.1)
    const influential = item.popularity?.influentialCitationCount ?? 0;
    if (influential > 0) {
      const influentialScore = Math.min(1, influential / 10) * 0.1;
      score += influentialScore;
    }

    // Keyword match score (0-0.2)
    if (keywords.length > 0) {
      const titleLower = item.title.toLowerCase();
      const summaryLower = item.summary.toLowerCase();
      const matchCount = keywords.filter(
        k => titleLower.includes(k.toLowerCase()) || summaryLower.includes(k.toLowerCase())
      ).length;
      const keywordScore = (matchCount / keywords.length) * 0.2;
      score += keywordScore;
    }

    return Math.min(1, score);
  }

  /**
   * Compute a trending score that favors recent papers with growing attention
   */
  computeTrendingScore(item: FetchedItem): number {
    const citations = item.popularity?.citationCount ?? 0;
    const publishedAt = item.publishedAt;

    if (!publishedAt) {
      return 0;
    }

    const daysSincePublished = Math.max(1, (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24));

    // Citations per day (velocity)
    const citationsPerDay = citations / daysSincePublished;

    // Trending = velocity * recency_boost
    // Papers < 30 days old get full boost, then decays
    const recencyBoost = Math.exp(-daysSincePublished / 60);

    // Normalize to 0-1 (assuming 1 citation/day is very high for recent papers)
    const trendingScore = Math.min(1, citationsPerDay * recencyBoost * 2);

    return trendingScore;
  }

  private extractArxivId(item: FetchedItem): string | null {
    // Check metadata first
    if (item.metadata?.arxivId) {
      return String(item.metadata.arxivId);
    }

    // Extract from URL
    const urlMatch = item.url.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Extract from ID
    const idMatch = item.id.match(/(\d+\.\d+)/);
    if (idMatch) {
      return idMatch[1];
    }

    return null;
  }

  private applyEnrichment(item: FetchedItem, data: S2PaperResponse): FetchedItem {
    const trendingScore = this.computeTrendingScoreFromData(item, data);

    return {
      ...item,
      popularity: {
        ...item.popularity,
        citationCount: data.citationCount,
        influentialCitationCount: data.influentialCitationCount,
        referenceCount: data.referenceCount,
        trendingScore,
      },
      metadata: {
        ...item.metadata,
        s2PaperId: data.paperId,
        fieldsOfStudy: data.fieldsOfStudy,
        isOpenAccess: data.isOpenAccess,
      },
    };
  }

  private computeTrendingScoreFromData(item: FetchedItem, data: S2PaperResponse): number {
    const publishedAt = data.publicationDate
      ? new Date(data.publicationDate)
      : item.publishedAt;

    if (!publishedAt) return 0;

    const daysSincePublished = Math.max(1, (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24));
    const citationsPerDay = data.citationCount / daysSincePublished;
    const recencyBoost = Math.exp(-daysSincePublished / 60);

    return Math.min(1, citationsPerDay * recencyBoost * 2);
  }

  private async respectRateLimit(): Promise<void> {
    const now = Date.now();

    // Reset window if needed
    if (now - this.windowStart > this.windowMs) {
      this.windowStart = now;
      this.requestCount = 0;
    }

    // Wait if at limit
    if (this.requestCount >= this.maxRequestsPerWindow) {
      const waitTime = this.windowMs - (now - this.windowStart);
      console.log(`[S2] Rate limit reached, waiting ${Math.round(waitTime / 1000)}s`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.windowStart = Date.now();
      this.requestCount = 0;
    }

    this.requestCount++;
  }
}

// Singleton instance
let enricher: SemanticScholarEnricher | null = null;

export function getSemanticScholarEnricher(): SemanticScholarEnricher {
  if (!enricher) {
    enricher = new SemanticScholarEnricher();
  }
  return enricher;
}
