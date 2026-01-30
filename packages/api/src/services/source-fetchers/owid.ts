/**
 * Our World in Data (OWID) Fetcher
 *
 * OWID provides open data under CC-BY license.
 * Data available at: https://github.com/owid/owid-datasets
 * API for charts: https://ourworldindata.org/
 *
 * This fetcher uses their GitHub API to find relevant datasets
 * and their website to fetch article summaries.
 */

import type { SourceFetcher, FetchedContent, FetchedItem, FetchOptions } from './index.js';

const OWID_GITHUB_API = 'https://api.github.com/repos/owid/owid-datasets/contents/datasets';
const OWID_ARTICLES_API = 'https://ourworldindata.org/sitemap.xml';

// Topic mappings for OWID
const DOMAIN_TO_OWID_TOPICS: Record<string, string[]> = {
  'climate': ['co2', 'climate', 'energy', 'emissions', 'temperature', 'renewable'],
  'health': ['health', 'disease', 'mortality', 'life-expectancy', 'covid', 'vaccination'],
  'economics': ['gdp', 'poverty', 'income', 'inequality', 'trade', 'employment'],
  'technology': ['internet', 'technology', 'innovation', 'automation'],
  'population': ['population', 'fertility', 'migration', 'urbanization'],
  'education': ['education', 'literacy', 'school'],
  'food': ['food', 'agriculture', 'hunger', 'nutrition'],
  'energy': ['energy', 'electricity', 'fossil', 'renewable', 'nuclear'],
  'environment': ['environment', 'biodiversity', 'deforestation', 'pollution'],
};

interface OWIDArticle {
  title: string;
  url: string;
  slug: string;
  excerpt?: string;
}

export class OWIDFetcher implements SourceFetcher {
  private articleCache: OWIDArticle[] | null = null;
  private lastCacheTime = 0;
  private readonly cacheExpiry = 3600000; // 1 hour

  canHandle(sourceType: string, url: string): boolean {
    return url.includes('ourworldindata.org');
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
    // Get relevant topics based on domains and keywords
    const topics = this.getRelevantTopics(options.domains, options.keywords);

    // Fetch articles matching topics
    const articles = await this.fetchArticles(topics, options.maxItems);

    // Fetch content for each article
    const items: FetchedItem[] = [];
    for (const article of articles.slice(0, options.maxItems)) {
      try {
        const content = await this.fetchArticleContent(article);
        if (content) {
          items.push(content);
        }
      } catch (error) {
        console.error(`[OWID] Failed to fetch article ${article.url}:`, error);
      }

      // Rate limiting - be polite
      await new Promise((resolve) => setTimeout(resolve, 500));
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

  private getRelevantTopics(domains: string[], keywords: string[]): string[] {
    const topics = new Set<string>();

    // Add topics from domain mappings
    for (const domain of domains) {
      const mappedTopics = DOMAIN_TO_OWID_TOPICS[domain.toLowerCase()];
      if (mappedTopics) {
        mappedTopics.forEach((t) => topics.add(t));
      }
    }

    // Add keywords as potential topics
    keywords.forEach((k) => topics.add(k.toLowerCase()));

    // Default to some common topics if none specified
    if (topics.size === 0) {
      ['climate', 'health', 'technology'].forEach((t) => topics.add(t));
    }

    return Array.from(topics);
  }

  private async fetchArticles(topics: string[], maxItems: number): Promise<OWIDArticle[]> {
    // OWID has a well-structured URL pattern for articles
    // We'll construct URLs based on known topic patterns
    const articles: OWIDArticle[] = [];

    // Known OWID article patterns for common topics
    const knownArticles: OWIDArticle[] = [
      // Climate
      { title: 'CO2 and Greenhouse Gas Emissions', url: 'https://ourworldindata.org/co2-and-greenhouse-gas-emissions', slug: 'co2-and-greenhouse-gas-emissions' },
      { title: 'Climate Change', url: 'https://ourworldindata.org/climate-change', slug: 'climate-change' },
      { title: 'Energy', url: 'https://ourworldindata.org/energy', slug: 'energy' },
      { title: 'Renewable Energy', url: 'https://ourworldindata.org/renewable-energy', slug: 'renewable-energy' },
      // Health
      { title: 'Global Health', url: 'https://ourworldindata.org/health-meta', slug: 'health-meta' },
      { title: 'Life Expectancy', url: 'https://ourworldindata.org/life-expectancy', slug: 'life-expectancy' },
      { title: 'Causes of Death', url: 'https://ourworldindata.org/causes-of-death', slug: 'causes-of-death' },
      { title: 'COVID-19', url: 'https://ourworldindata.org/coronavirus', slug: 'coronavirus' },
      // Economics
      { title: 'Global Economic Inequality', url: 'https://ourworldindata.org/global-economic-inequality', slug: 'global-economic-inequality' },
      { title: 'Poverty', url: 'https://ourworldindata.org/poverty', slug: 'poverty' },
      { title: 'Economic Growth', url: 'https://ourworldindata.org/economic-growth', slug: 'economic-growth' },
      // Technology
      { title: 'Internet', url: 'https://ourworldindata.org/internet', slug: 'internet' },
      { title: 'Artificial Intelligence', url: 'https://ourworldindata.org/artificial-intelligence', slug: 'artificial-intelligence' },
      { title: 'Technology Adoption', url: 'https://ourworldindata.org/technology-adoption', slug: 'technology-adoption' },
      // Population
      { title: 'World Population Growth', url: 'https://ourworldindata.org/world-population-growth', slug: 'world-population-growth' },
      { title: 'Urbanization', url: 'https://ourworldindata.org/urbanization', slug: 'urbanization' },
      // Food
      { title: 'Hunger and Undernourishment', url: 'https://ourworldindata.org/hunger-and-undernourishment', slug: 'hunger-and-undernourishment' },
      { title: 'Food Supply', url: 'https://ourworldindata.org/food-supply', slug: 'food-supply' },
      // Environment
      { title: 'Biodiversity', url: 'https://ourworldindata.org/biodiversity', slug: 'biodiversity' },
      { title: 'Deforestation', url: 'https://ourworldindata.org/deforestation', slug: 'deforestation' },
      { title: 'Air Pollution', url: 'https://ourworldindata.org/air-pollution', slug: 'air-pollution' },
    ];

    // Filter articles by topic relevance
    for (const article of knownArticles) {
      const articleTopics = article.slug.toLowerCase().split('-');
      const isRelevant = topics.some((topic) =>
        articleTopics.some((at) => at.includes(topic) || topic.includes(at))
      );
      if (isRelevant) {
        articles.push(article);
      }
    }

    // If no matches, return some defaults
    if (articles.length === 0) {
      return knownArticles.slice(0, maxItems);
    }

    return articles.slice(0, maxItems);
  }

  private async fetchArticleContent(article: OWIDArticle): Promise<FetchedItem | null> {
    try {
      console.log(`[OWID] Fetching: ${article.url}`);

      const response = await fetch(article.url, {
        headers: {
          'User-Agent': 'Orbit-Discovery/1.0 (Research Tool)',
        },
      });

      if (!response.ok) {
        return null;
      }

      const html = await response.text();

      // Extract key information from the HTML
      const title = this.extractMetaContent(html, 'og:title') || article.title;
      const description = this.extractMetaContent(html, 'og:description') || '';
      const publishedTime = this.extractMetaContent(html, 'article:published_time');

      // Extract article excerpt/summary
      // OWID articles have a structured format with key insights
      const keyInsights = this.extractKeyInsights(html);
      const articleSummary = this.extractArticleSummary(html);

      const content = [
        description,
        keyInsights ? `Key Insights:\n${keyInsights}` : '',
        articleSummary ? `Summary:\n${articleSummary}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      return {
        id: article.slug,
        title,
        summary: description,
        content: content || description,
        url: article.url,
        publishedAt: publishedTime ? new Date(publishedTime) : null,
        authors: ['Our World in Data'],
        categories: article.slug.split('-'),
        metadata: {
          source: 'ourworldindata.org',
          dataAvailable: true,
          license: 'CC-BY',
        },
      };
    } catch (error) {
      console.error(`[OWID] Error fetching ${article.url}:`, error);
      return null;
    }
  }

  private extractMetaContent(html: string, property: string): string | null {
    const regex = new RegExp(`<meta[^>]*property="${property}"[^>]*content="([^"]*)"`, 'i');
    const match = html.match(regex);
    if (match) return match[1];

    // Try name attribute
    const nameRegex = new RegExp(`<meta[^>]*name="${property}"[^>]*content="([^"]*)"`, 'i');
    const nameMatch = html.match(nameRegex);
    return nameMatch ? nameMatch[1] : null;
  }

  private extractKeyInsights(html: string): string | null {
    // OWID often has a "Key insights" or summary section
    const insightsMatch = html.match(/<div[^>]*class="[^"]*key-insights[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (insightsMatch) {
      return this.stripHtml(insightsMatch[1]).slice(0, 1000);
    }

    // Try to find bullet points in the intro
    const listMatch = html.match(/<article[^>]*>([\s\S]*?)<ul[^>]*>([\s\S]*?)<\/ul>/i);
    if (listMatch) {
      const listItems = listMatch[2].match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
      if (listItems) {
        return listItems
          .slice(0, 5)
          .map((li) => '• ' + this.stripHtml(li))
          .join('\n');
      }
    }

    return null;
  }

  private extractArticleSummary(html: string): string | null {
    // Try to extract the first few paragraphs
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      const paragraphs = articleMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      if (paragraphs) {
        return paragraphs
          .slice(0, 3)
          .map((p) => this.stripHtml(p))
          .filter((p) => p.length > 50)
          .join('\n\n')
          .slice(0, 1500);
      }
    }
    return null;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
