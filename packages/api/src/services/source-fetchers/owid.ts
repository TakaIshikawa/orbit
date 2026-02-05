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
  published?: Date | null;
  authors?: string[];
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
    const items: FetchedItem[] = [];
    const topics = this.getRelevantTopics(options.domains, options.keywords);

    // 1. Fetch RECENT articles from Atom feed - prioritize these
    console.log(`[OWID] Fetching recent articles from Atom feed...`);
    const latestArticles = await this.fetchLatestArticles(topics, options.maxItems);

    for (const article of latestArticles) {
      try {
        const content = await this.fetchArticleContent(article, 'current');
        if (content) {
          items.push(content);
        }
      } catch (error) {
        console.error(`[OWID] Failed to fetch latest article ${article.url}:`, error);
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    console.log(`[OWID] Fetched ${items.length} recent articles`);

    // 2. Only fetch foundational pages if we got very few recent articles
    if (items.length < 2) {
      console.log(`[OWID] Few recent articles found, adding foundational pages...`);
      const topicArticles = await this.fetchTopicArticles(topics, Math.max(2, options.maxItems - items.length));
      for (const article of topicArticles) {
        try {
          const content = await this.fetchArticleContent(article, 'foundational');
          if (content) {
            items.push(content);
          }
        } catch (error) {
          console.error(`[OWID] Failed to fetch topic article ${article.url}:`, error);
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
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

  private async fetchLatestArticles(topics: string[], maxItems: number): Promise<OWIDArticle[]> {
    const articles: OWIDArticle[] = [];

    try {
      // Fetch the Atom feed - much more reliable than HTML scraping
      console.log(`[OWID] Fetching Atom feed for latest articles...`);
      const response = await fetch('https://ourworldindata.org/atom.xml', {
        headers: { 'User-Agent': 'Orbit-Discovery/1.0 (Research Tool)' },
      });

      if (!response.ok) {
        console.error(`[OWID] Failed to fetch Atom feed: ${response.status}`);
        return [];
      }

      const xml = await response.text();

      // Parse Atom feed entries
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
      let match;

      while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1];

        // Extract title
        const titleMatch = entry.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ||
                          entry.match(/<title>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        // Extract URL
        const linkMatch = entry.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/) ||
                         entry.match(/<id>(https:\/\/ourworldindata\.org\/[^<]+)<\/id>/i);
        const url = linkMatch ? linkMatch[1] : '';

        // Extract published date
        const publishedMatch = entry.match(/<published>([^<]+)<\/published>/i);
        const published = publishedMatch ? new Date(publishedMatch[1]) : null;

        // Extract summary
        const summaryMatch = entry.match(/<summary><!\[CDATA\[([\s\S]*?)\]\]><\/summary>/i) ||
                            entry.match(/<summary>([\s\S]*?)<\/summary>/i);
        let excerpt = summaryMatch ? summaryMatch[1] : '';
        // Clean HTML from excerpt
        excerpt = excerpt.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();

        // Extract authors
        const authorMatches = entry.matchAll(/<author><name>([^<]+)<\/name><\/author>/gi);
        const authors = Array.from(authorMatches).map(m => m[1]);

        if (title && url && url.includes('ourworldindata.org')) {
          const slug = url.replace('https://ourworldindata.org/', '');
          articles.push({
            title,
            url,
            slug,
            excerpt,
            published,
            authors,
          });
        }
      }

      console.log(`[OWID] Parsed ${articles.length} articles from Atom feed`);

      // Score articles by topic relevance (but don't exclude non-matches)
      const scored = articles.map((article) => {
        const articleText = `${article.slug} ${article.title} ${article.excerpt || ''}`.toLowerCase();
        let score = 0;

        for (const topic of topics) {
          const topicLower = topic.toLowerCase();
          // Exact word match
          if (articleText.includes(topicLower)) {
            score += 2;
          }
          // Partial match (e.g., "climate" matches "climate-change")
          const topicWords = topicLower.split(/[-_\s]+/);
          for (const word of topicWords) {
            if (word.length > 3 && articleText.includes(word)) {
              score += 1;
            }
          }
        }

        return { article, score };
      });

      // Sort by score (highest first), then by date (most recent first)
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Both have same score, prefer more recent
        const dateA = a.article.published?.getTime() || 0;
        const dateB = b.article.published?.getTime() || 0;
        return dateB - dateA;
      });

      // Take top articles - include some non-matching recent ones if needed
      const topRelevant = scored.filter(s => s.score > 0).slice(0, Math.ceil(maxItems * 0.7));
      const recentFiller = scored.filter(s => s.score === 0).slice(0, Math.ceil(maxItems * 0.3));
      const result = [...topRelevant.map(s => s.article), ...recentFiller.map(s => s.article)].slice(0, maxItems);

      console.log(`[OWID] Found ${topRelevant.length} topic-relevant + ${recentFiller.length} recent articles`);
      return result;

    } catch (error) {
      console.error('[OWID] Error fetching Atom feed:', error);
      return [];
    }
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

  private async fetchTopicArticles(topics: string[], maxItems: number): Promise<OWIDArticle[]> {
    // Foundational topic pages - domain grounding
    const articles: OWIDArticle[] = [];

    // Known OWID topic pages for common domains
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

  private async fetchArticleContent(
    article: OWIDArticle,
    granularity: 'current' | 'foundational' = 'current'
  ): Promise<FetchedItem | null> {
    try {
      console.log(`[OWID] Fetching (${granularity}): ${article.url}`);

      const response = await fetch(article.url, {
        headers: {
          'User-Agent': 'Orbit-Discovery/1.0 (Research Tool)',
        },
      });

      if (!response.ok) {
        // If we can't fetch the page but have feed data, use that
        if (article.excerpt) {
          return {
            id: article.slug,
            title: article.title,
            summary: article.excerpt,
            content: article.excerpt,
            url: article.url,
            publishedAt: article.published || null,
            authors: article.authors || ['Our World in Data'],
            categories: article.slug.split('-'),
            metadata: {
              source: 'ourworldindata.org',
              dataAvailable: true,
              license: 'CC-BY',
              granularity,
              weight: granularity === 'current' ? 1.0 : 0.6,
              fromFeedOnly: true,
            },
          };
        }
        return null;
      }

      const html = await response.text();

      // Extract key information from the HTML
      const title = this.extractMetaContent(html, 'og:title') || article.title;
      const description = this.extractMetaContent(html, 'og:description') || article.excerpt || '';
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
        publishedAt: publishedTime ? new Date(publishedTime) : article.published || null,
        authors: article.authors || ['Our World in Data'],
        categories: article.slug.split('-'),
        metadata: {
          source: 'ourworldindata.org',
          dataAvailable: true,
          license: 'CC-BY',
          granularity, // 'current' = recent articles, 'foundational' = topic pages
          weight: granularity === 'current' ? 1.0 : 0.6, // Current trends weighted higher
        },
      };
    } catch (error) {
      console.error(`[OWID] Error fetching ${article.url}:`, error);
      // Fallback to feed data if available
      if (article.excerpt) {
        return {
          id: article.slug,
          title: article.title,
          summary: article.excerpt,
          content: article.excerpt,
          url: article.url,
          publishedAt: article.published || null,
          authors: article.authors || ['Our World in Data'],
          categories: article.slug.split('-'),
          metadata: {
            source: 'ourworldindata.org',
            dataAvailable: true,
            license: 'CC-BY',
            granularity,
            weight: granularity === 'current' ? 1.0 : 0.6,
            fromFeedOnly: true,
          },
        };
      }
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
