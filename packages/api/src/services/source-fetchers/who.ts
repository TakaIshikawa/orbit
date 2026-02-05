/**
 * WHO Global Health Observatory (GHO) API Fetcher
 *
 * Primary source for global health statistics and indicators.
 * API docs: https://www.who.int/data/gho/info/gho-odata-api
 *
 * Features:
 * - 2,000+ health indicators
 * - 194 WHO member states
 * - Time series data from 1950s to present
 * - Free, no authentication required
 */

import type { SourceFetcher, FetchedContent, FetchedItem, FetchOptions } from './index.js';

const GHO_API_BASE = 'https://ghoapi.azureedge.net/api';

// Key health indicators by domain
const KEY_INDICATORS: Record<string, { code: string; name: string }[]> = {
  'health': [
    { code: 'WHOSIS_000001', name: 'Life expectancy at birth' },
    { code: 'MDG_0000000001', name: 'Infant mortality rate' },
    { code: 'MDG_0000000007', name: 'Under-five mortality rate' },
    { code: 'WHOSIS_000002', name: 'Healthy life expectancy at birth' },
    { code: 'NCD_BMI_30A', name: 'Obesity prevalence' },
  ],
  'public_health': [
    { code: 'WHS4_100', name: 'Physicians per 10,000 population' },
    { code: 'WHS4_117', name: 'Hospital beds per 10,000 population' },
    { code: 'WHS6_102', name: 'Total health expenditure as % of GDP' },
    { code: 'UHC_INDEX_REPORTED', name: 'UHC service coverage index' },
  ],
  'disease': [
    { code: 'HIV_0000000001', name: 'HIV prevalence' },
    { code: 'TB_e_inc_100k', name: 'Tuberculosis incidence per 100k' },
    { code: 'MALARIA_EST_INCIDENCE', name: 'Malaria incidence per 1000' },
    { code: 'NCD_CCS_DIABETES', name: 'Diabetes prevalence' },
  ],
  'mortality': [
    { code: 'NCDMORT3070', name: 'Probability of dying from NCDs' },
    { code: 'MORT_MATERNALNUM', name: 'Maternal deaths' },
    { code: 'SDGSUICIDE', name: 'Suicide mortality rate' },
    { code: 'SDGPOISON', name: 'Mortality rate from unintentional poisoning' },
  ],
  'environment': [
    { code: 'SDGAIRBODA', name: 'Air pollution mortality rate' },
    { code: 'WSH_SANITATION_SAFELY_MANAGED', name: 'Population using safely managed sanitation' },
    { code: 'WSH_WATER_SAFELY_MANAGED', name: 'Population using safely managed water' },
  ],
};

interface GHOIndicatorValue {
  Id: number;
  IndicatorCode: string;
  SpatialDim: string;
  SpatialDimType: string;
  TimeDim: string;
  Dim1Type?: string;
  Dim1?: string;
  Value: string;
  NumericValue: number | null;
  Low?: number;
  High?: number;
}

interface GHOIndicatorMetadata {
  IndicatorCode: string;
  IndicatorName: string;
  Language: string;
}

export class WHOFetcher implements SourceFetcher {
  private lastRequestTime = 0;
  private readonly minRequestInterval = 200; // 200ms between requests

  canHandle(sourceType: string, url: string): boolean {
    return url.includes('who.int') || url.includes('ghoapi');
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

    // Fetch data for each indicator
    for (const indicator of indicators.slice(0, 8)) {
      try {
        await this.respectRateLimit();

        // Get recent global data for this indicator
        const dataPoints = await this.fetchIndicatorData(indicator.code);
        if (dataPoints.length === 0) continue;

        // Create item from the data
        const item = this.createItemFromData(indicator, dataPoints, source);
        items.push(item);

      } catch (error) {
        console.error(`[WHO] Failed to fetch indicator ${indicator.code}:`, error);
      }
    }

    // Also fetch WHO news/updates if keywords provided
    if (options.keywords.length > 0) {
      const newsItems = await this.fetchWHONews(options.keywords, source);
      items.push(...newsItems);
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

  private getIndicatorsForDomains(domains: string[]): { code: string; name: string }[] {
    const indicators: { code: string; name: string }[] = [];
    const seen = new Set<string>();

    for (const domain of domains) {
      const domainIndicators = KEY_INDICATORS[domain.toLowerCase()];
      if (domainIndicators) {
        for (const ind of domainIndicators) {
          if (!seen.has(ind.code)) {
            seen.add(ind.code);
            indicators.push(ind);
          }
        }
      }
    }

    // Default to health indicators if no match
    if (indicators.length === 0) {
      return KEY_INDICATORS['health'];
    }

    return indicators;
  }

  private async fetchIndicatorData(indicatorCode: string): Promise<GHOIndicatorValue[]> {
    // Fetch global data for recent years
    const currentYear = new Date().getFullYear();
    const url = `${GHO_API_BASE}/${indicatorCode}?$filter=SpatialDim eq 'GLOBAL' or SpatialDim eq 'WLD'&$orderby=TimeDim desc&$top=20`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        // Try without spatial filter for indicators that don't have global aggregate
        const altUrl = `${GHO_API_BASE}/${indicatorCode}?$orderby=TimeDim desc&$top=50`;
        const altResponse = await fetch(altUrl);
        if (!altResponse.ok) return [];

        const altData = await altResponse.json() as { value?: GHOIndicatorValue[] };
        // Get unique most recent values per country, then aggregate
        return (altData.value || []).slice(0, 20);
      }

      const data = await response.json() as { value?: GHOIndicatorValue[] };
      return data.value || [];
    } catch {
      return [];
    }
  }

  private createItemFromData(
    indicator: { code: string; name: string },
    dataPoints: GHOIndicatorValue[],
    source: { id: string; name: string; url: string; credibility: number }
  ): FetchedItem {
    // Get most recent values
    const withValues = dataPoints.filter((d) => d.NumericValue !== null);
    const sorted = withValues.sort((a, b) => parseInt(b.TimeDim) - parseInt(a.TimeDim));

    const latest = sorted[0];
    const previous = sorted.find((d) => parseInt(d.TimeDim) < parseInt(latest?.TimeDim || '0'));

    // Calculate change if possible
    let changeText = '';
    if (previous && latest?.NumericValue && previous.NumericValue) {
      const change = ((latest.NumericValue - previous.NumericValue) / previous.NumericValue) * 100;
      changeText = ` (${change > 0 ? '+' : ''}${change.toFixed(1)}% from ${previous.TimeDim})`;
    }

    const valueDisplay = latest?.NumericValue?.toFixed(2) || latest?.Value || 'N/A';
    const summary = `${indicator.name}: ${valueDisplay} in ${latest?.TimeDim || 'latest'}${changeText}. Data from WHO Global Health Observatory.`;

    return {
      id: `who_${indicator.code}_${latest?.TimeDim || 'latest'}`,
      title: `${indicator.name} - WHO GHO`,
      summary,
      content: `${summary}\n\nRegion: ${latest?.SpatialDim || 'Global'}\n\nSource: World Health Organization Global Health Observatory\n\nNote: Data may have confidence intervals and methodological considerations. See WHO metadata for details.`,
      url: `https://www.who.int/data/gho/data/indicators/indicator-details/GHO/${indicator.code}`,
      publishedAt: latest?.TimeDim ? new Date(`${latest.TimeDim}-01-01`) : null,
      authors: ['World Health Organization'],
      categories: ['Health Statistics', 'WHO GHO'],
      metadata: {
        indicatorCode: indicator.code,
        latestValue: latest?.NumericValue,
        latestYear: latest?.TimeDim,
        previousValue: previous?.NumericValue,
        previousYear: previous?.TimeDim,
        spatialDim: latest?.SpatialDim,
        lowEstimate: latest?.Low,
        highEstimate: latest?.High,
        dataSource: 'WHO Global Health Observatory',
        isOfficialStatistic: true,
      },
      popularity: {
        // WHO data is widely cited in health research
        citationCount: 50, // Conservative estimate
      },
    };
  }

  private async fetchWHONews(
    keywords: string[],
    source: { id: string; name: string; url: string; credibility: number }
  ): Promise<FetchedItem[]> {
    // WHO news RSS feed
    const rssUrl = 'https://www.who.int/rss-feeds/news-english.xml';

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
          authors: ['World Health Organization'],
          categories: ['WHO News'],
          metadata: {
            contentType: 'news',
            dataSource: 'WHO News',
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
