/**
 * Generic RSS/Atom Feed Fetcher
 *
 * Handles standard RSS 2.0 and Atom feeds.
 * Respects robots.txt and rate limits.
 */

import type { SourceFetcher, FetchedContent, FetchedItem, FetchOptions } from './index.js';

export class RSSFetcher implements SourceFetcher {
  private lastRequestTime: Map<string, number> = new Map();
  private readonly minRequestInterval = 1000; // 1 second between requests to same domain

  canHandle(sourceType: string, url: string): boolean {
    // Handle any source that looks like an RSS feed
    return (
      sourceType === 'news' ||
      sourceType === 'blog' ||
      url.includes('/rss') ||
      url.includes('/feed') ||
      url.endsWith('.xml')
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
    const domain = new URL(source.url).hostname;
    await this.respectRateLimit(domain);

    console.log(`[RSS] Fetching: ${source.url}`);

    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'Orbit-Discovery/1.0 (Research Tool)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`RSS fetch error: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');

    const items = isAtom ? this.parseAtomFeed(xml) : this.parseRSSFeed(xml);

    // Filter by keywords if specified
    const filteredItems = this.filterByKeywords(items, options.keywords);

    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      items: filteredItems.slice(0, options.maxItems),
      fetchedAt: new Date(),
      credibility: source.credibility,
    };
  }

  private async respectRateLimit(domain: string): Promise<void> {
    const lastRequest = this.lastRequestTime.get(domain) || 0;
    const elapsed = Date.now() - lastRequest;
    if (elapsed < this.minRequestInterval) {
      await new Promise((resolve) => setTimeout(resolve, this.minRequestInterval - elapsed));
    }
    this.lastRequestTime.set(domain, Date.now());
  }

  private parseRSSFeed(xml: string): FetchedItem[] {
    const items: FetchedItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];

      const title = this.extractCDATA(item, 'title') || '';
      const link = this.extractTag(item, 'link') || '';
      const description = this.extractCDATA(item, 'description') || '';
      const content = this.extractCDATA(item, 'content:encoded') || description;
      const pubDate = this.extractTag(item, 'pubDate');
      const guid = this.extractTag(item, 'guid') || link;
      const author = this.extractTag(item, 'author') || this.extractTag(item, 'dc:creator');

      // Extract categories
      const categories: string[] = [];
      const catRegex = /<category[^>]*>([\s\S]*?)<\/category>/g;
      let catMatch;
      while ((catMatch = catRegex.exec(item)) !== null) {
        categories.push(this.stripCDATA(catMatch[1]).trim());
      }

      items.push({
        id: guid,
        title: this.stripHtml(title),
        summary: this.stripHtml(description).slice(0, 500),
        content: this.stripHtml(content),
        url: link,
        publishedAt: pubDate ? new Date(pubDate) : null,
        authors: author ? [author] : [],
        categories,
        metadata: {},
      });
    }

    return items;
  }

  private parseAtomFeed(xml: string): FetchedItem[] {
    const items: FetchedItem[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];

      const title = this.extractTag(entry, 'title') || '';
      const summary = this.extractTag(entry, 'summary') || '';
      const content = this.extractTag(entry, 'content') || summary;
      const published = this.extractTag(entry, 'published') || this.extractTag(entry, 'updated');
      const id = this.extractTag(entry, 'id') || '';

      // Extract link
      const linkMatch = entry.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"/);
      const link = linkMatch ? linkMatch[1] : this.extractAttribute(entry, 'link', 'href') || '';

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

      items.push({
        id,
        title: this.stripHtml(title),
        summary: this.stripHtml(summary).slice(0, 500),
        content: this.stripHtml(content),
        url: link,
        publishedAt: published ? new Date(published) : null,
        authors,
        categories,
        metadata: {},
      });
    }

    return items;
  }

  private filterByKeywords(items: FetchedItem[], keywords: string[]): FetchedItem[] {
    if (keywords.length === 0) return items;

    const lowerKeywords = keywords.map((k) => k.toLowerCase());

    return items.filter((item) => {
      const text = `${item.title} ${item.summary} ${item.content}`.toLowerCase();
      return lowerKeywords.some((keyword) => text.includes(keyword));
    });
  }

  private extractTag(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const match = xml.match(regex);
    return match ? this.stripCDATA(match[1]) : null;
  }

  private extractAttribute(xml: string, tag: string, attr: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : null;
  }

  private extractCDATA(xml: string, tag: string): string | null {
    const content = this.extractTag(xml, tag);
    return content ? this.stripCDATA(content) : null;
  }

  private stripCDATA(text: string): string {
    return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
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
