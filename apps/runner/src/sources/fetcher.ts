import { SourceFetchLogRepository, type Database } from "@orbit/db";

export interface SourceConfig {
  name?: string;
  url: string;
  type: "research" | "news" | "report" | "observation";
  domains?: string[];
  selector?: string; // CSS selector for content extraction
  debiasedTier?: 1 | 2 | 3; // 1 = highest debiased, 3 = moderate (use with awareness)
}

export interface FetchContext {
  jobId?: string;
  agentId?: string;
}

export async function fetchSource(source: SourceConfig): Promise<string> {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; OrbitBot/1.0; +https://github.com/orbit)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = await response.json();
    return JSON.stringify(json, null, 2);
  }

  if (contentType.includes("text/html")) {
    const html = await response.text();
    return extractTextFromHtml(html, source.selector);
  }

  // Plain text or other
  return response.text();
}

function extractTextFromHtml(html: string, selector?: string): string {
  // Simple HTML to text conversion
  // Remove script and style tags
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "");

  // Extract main content if selector hints at article
  if (selector) {
    const articleMatch = text.match(new RegExp(`<${selector}[^>]*>([\\s\\S]*?)<\\/${selector}>`, "i"));
    if (articleMatch) {
      text = articleMatch[1];
    }
  } else {
    // Try common content selectors
    const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (articleMatch) {
      text = articleMatch[1];
    } else if (mainMatch) {
      text = mainMatch[1];
    }
  }

  // Convert to plain text
  text = text
    // Replace block elements with newlines
    .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, "\n")
    // Remove remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode common entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Limit length
  if (text.length > 50000) {
    text = text.slice(0, 50000) + "\n\n[Content truncated...]";
  }

  return text;
}

export async function fetchMultipleSources(sources: SourceConfig[]): Promise<Array<{
  source: SourceConfig;
  content: string;
  error?: string;
}>> {
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const content = await fetchSource(source);
      return { source, content };
    })
  );

  return results.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      source: sources[i],
      content: "",
      error: result.reason instanceof Error ? result.reason.message : "Unknown error",
    };
  });
}

/**
 * Fetch a source with logging to track fetch health
 */
export async function fetchSourceWithLogging(
  source: SourceConfig,
  db: Database,
  context: FetchContext = {}
): Promise<{ content: string; responseTimeMs: number }> {
  const fetchLogRepo = new SourceFetchLogRepository(db);
  const startTime = Date.now();

  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OrbitBot/1.0; +https://github.com/orbit)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      // Log HTTP error
      await fetchLogRepo.logFetch(source.url, "http_error", {
        httpStatusCode: response.status,
        responseTimeMs,
        error: `HTTP ${response.status}: ${response.statusText}`,
        errorType: "http_error",
        jobId: context.jobId,
        agentId: context.agentId,
      });
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    let content: string;

    if (contentType.includes("application/json")) {
      const json = await response.json();
      content = JSON.stringify(json, null, 2);
    } else if (contentType.includes("text/html")) {
      const html = await response.text();
      content = extractTextFromHtml(html, source.selector);
    } else {
      content = await response.text();
    }

    // Log success
    await fetchLogRepo.logFetch(source.url, "success", {
      httpStatusCode: response.status,
      responseTimeMs,
      contentLength: content.length,
      jobId: context.jobId,
      agentId: context.agentId,
    });

    return { content, responseTimeMs };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Determine error type
    let status: "timeout" | "http_error" | "network_error" | "blocked" | "rate_limited" = "network_error";
    let errorType = "unknown";

    if (errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT")) {
      status = "timeout";
      errorType = "timeout";
    } else if (errorMessage.includes("HTTP 429") || errorMessage.includes("rate limit")) {
      status = "rate_limited";
      errorType = "rate_limited";
    } else if (errorMessage.includes("HTTP 403") || errorMessage.includes("blocked") || errorMessage.includes("forbidden")) {
      status = "blocked";
      errorType = "blocked";
    } else if (errorMessage.startsWith("HTTP")) {
      status = "http_error";
      errorType = "http_error";
    }

    // Log error
    await fetchLogRepo.logFetch(source.url, status, {
      responseTimeMs,
      error: errorMessage,
      errorType,
      jobId: context.jobId,
      agentId: context.agentId,
    });

    throw error;
  }
}

/**
 * Fetch multiple sources with logging
 */
export async function fetchMultipleSourcesWithLogging(
  sources: SourceConfig[],
  db: Database,
  context: FetchContext = {}
): Promise<Array<{
  source: SourceConfig;
  content: string;
  responseTimeMs?: number;
  error?: string;
}>> {
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const { content, responseTimeMs } = await fetchSourceWithLogging(source, db, context);
      return { source, content, responseTimeMs };
    })
  );

  return results.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      source: sources[i],
      content: "",
      error: result.reason instanceof Error ? result.reason.message : "Unknown error",
    };
  });
}
