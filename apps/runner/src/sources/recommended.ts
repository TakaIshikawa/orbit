/**
 * Recommended Sources
 *
 * Curated lists prioritizing:
 * - Factual accuracy & methodological transparency
 * - Public accessibility (no paywall)
 * - Independence from commercial/political manipulation
 */

import type { SourceConfig } from "./fetcher.js";

/**
 * DEFAULT SOURCES: Public + High Credibility
 * These can be scraped freely without paywall or registration
 */
export const PUBLIC_HIGH_CREDIBILITY_SOURCES: SourceConfig[] = [
  // === GOVERNMENT DATA (Public, Very High Credibility) ===
  {
    name: "US Census Bureau",
    url: "https://www.census.gov/newsroom/press-releases.html",
    type: "research",
    domains: ["demographics", "economics", "society"],
  },
  {
    name: "Bureau of Labor Statistics",
    url: "https://www.bls.gov/news.release/",
    type: "research",
    domains: ["economics", "labor", "employment"],
  },
  {
    name: "CDC Data & Statistics",
    url: "https://www.cdc.gov/nchs/data_access/ftp_data.htm",
    type: "research",
    domains: ["health", "public-health", "demographics"],
  },
  {
    name: "Kaiser Family Foundation",
    url: "https://www.kff.org/",
    type: "research",
    domains: ["health", "healthcare", "policy", "public-health"],
  },
  {
    name: "Health Affairs",
    url: "https://www.healthaffairs.org/",
    type: "research",
    domains: ["health", "healthcare", "policy", "economics"],
  },

  // === INTERNATIONAL DATA (Public, High Credibility) ===
  {
    name: "World Bank Open Data",
    url: "https://data.worldbank.org/",
    type: "research",
    domains: ["economics", "development", "global"],
  },
  {
    name: "OECD Data",
    url: "https://data.oecd.org/",
    type: "research",
    domains: ["economics", "policy", "governance"],
  },

  // === RESEARCH ORGANIZATIONS (Public, High Credibility) ===
  {
    name: "Our World in Data",
    url: "https://ourworldindata.org/",
    type: "research",
    domains: ["health", "environment", "society", "economics", "technology"],
  },
  {
    name: "Gapminder",
    url: "https://www.gapminder.org/data/",
    type: "research",
    domains: ["global", "development", "health", "economics"],
  },
  {
    name: "Pew Research Center",
    url: "https://www.pewresearch.org/",
    type: "research",
    domains: ["society", "demographics", "politics", "technology"],
  },

  // === ACADEMIC PREPRINTS (Public, High Credibility) ===
  {
    name: "arXiv - Computer Science",
    url: "https://arxiv.org/list/cs/recent",
    type: "research",
    domains: ["technology", "ai", "computer-science"],
  },
  {
    name: "arXiv - Economics",
    url: "https://arxiv.org/list/econ/recent",
    type: "research",
    domains: ["economics", "policy"],
  },

  // === WIRE SERVICES (Public, High Credibility) ===
  {
    name: "AP News",
    url: "https://apnews.com/",
    type: "news",
    domains: ["global", "politics", "society"],
  },
  {
    name: "BBC News",
    url: "https://www.bbc.com/news",
    type: "news",
    domains: ["global", "politics", "society", "technology"],
  },

  // === THINK TANKS (Public, Moderate Credibility - watch for bias) ===
  {
    name: "Brookings Institution",
    url: "https://www.brookings.edu/",
    type: "research",
    domains: ["policy", "economics", "governance"],
  },
  {
    name: "Urban Institute",
    url: "https://www.urban.org/",
    type: "research",
    domains: ["policy", "economics", "housing", "health"],
  },
];

/**
 * FREEMIUM SOURCES: Some content free, some paywalled
 * May have limited article access
 */
export const FREEMIUM_SOURCES: SourceConfig[] = [
  {
    name: "Reuters",
    url: "https://www.reuters.com/",
    type: "news",
    domains: ["global", "economics", "politics", "technology"],
  },
  {
    name: "NBER Working Papers",
    url: "https://www.nber.org/papers",
    type: "research",
    domains: ["economics", "policy", "finance"],
  },
  {
    name: "SSRN",
    url: "https://www.ssrn.com/",
    type: "research",
    domains: ["economics", "law", "policy", "social-science"],
  },
  {
    name: "RAND Corporation",
    url: "https://www.rand.org/",
    type: "research",
    domains: ["policy", "security", "health", "technology"],
  },
  {
    name: "Ars Technica",
    url: "https://arstechnica.com/",
    type: "news",
    domains: ["technology", "science", "policy"],
  },
];

/**
 * PAYWALLED SOURCES: Require subscription
 * Only use if you have access
 */
export const PAYWALLED_SOURCES: SourceConfig[] = [
  {
    name: "Nature",
    url: "https://www.nature.com/",
    type: "research",
    domains: ["science", "health", "technology", "environment"],
  },
  {
    name: "The Economist",
    url: "https://www.economist.com/",
    type: "news",
    domains: ["economics", "politics", "global", "technology"],
  },
  {
    name: "Financial Times",
    url: "https://www.ft.com/",
    type: "news",
    domains: ["economics", "finance", "politics", "technology"],
  },
  {
    name: "Wall Street Journal",
    url: "https://www.wsj.com/",
    type: "news",
    domains: ["economics", "finance", "politics", "technology"],
  },
  {
    name: "New York Times",
    url: "https://www.nytimes.com/",
    type: "news",
    domains: ["politics", "society", "technology", "global"],
  },
];

/**
 * LOW CREDIBILITY SOURCES: Use with caution
 * May be useful for tracking narratives, not for facts
 */
export const LOW_CREDIBILITY_SOURCES: SourceConfig[] = [
  {
    name: "Hacker News",
    url: "https://news.ycombinator.com/",
    type: "news",
    domains: ["technology", "startups"],
  },
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/",
    type: "news",
    domains: ["technology", "startups", "vc"],
  },
];

// Default export: public + high credibility only
export const RECOMMENDED_SOURCES = PUBLIC_HIGH_CREDIBILITY_SOURCES;

// Combined list of all accessible sources (public + freemium)
export const ALL_ACCESSIBLE_SOURCES = [
  ...PUBLIC_HIGH_CREDIBILITY_SOURCES,
  ...FREEMIUM_SOURCES,
];

/**
 * MOST DEBIASED SOURCES
 *
 * These sources are ranked by anti-bias metrics, prioritizing:
 * - Independence from commercial/political pressure
 * - Transparency about methodology and funding
 * - Perspective diversity and geographic neutrality
 * - Resistance to selection bias
 *
 * Use these for maximum accuracy in identifying true systemic issues.
 */
export const MOST_DEBIASED_SOURCES: SourceConfig[] = [
  // Tier 1: Highest debiased scores (0.75+)
  {
    name: "arXiv",
    url: "https://arxiv.org/",
    type: "research",
    domains: ["technology", "ai", "computer-science", "economics", "physics"],
    debiasedTier: 1,
  },
  {
    name: "Our World in Data",
    url: "https://ourworldindata.org/",
    type: "research",
    domains: ["health", "environment", "society", "economics", "technology"],
    debiasedTier: 1,
  },
  {
    name: "Gapminder",
    url: "https://www.gapminder.org/data/",
    type: "research",
    domains: ["global", "development", "health", "economics"],
    debiasedTier: 1,
  },
  {
    name: "PubMed",
    url: "https://pubmed.ncbi.nlm.nih.gov/",
    type: "research",
    domains: ["health", "medicine", "biology"],
    debiasedTier: 1,
  },
  {
    name: "Google Scholar",
    url: "https://scholar.google.com/",
    type: "research",
    domains: ["all"],
    debiasedTier: 1,
  },

  // Tier 2: High debiased scores (0.65-0.75)
  {
    name: "SSRN",
    url: "https://www.ssrn.com/",
    type: "research",
    domains: ["economics", "law", "policy", "social-science"],
    debiasedTier: 2,
  },
  {
    name: "JSTOR",
    url: "https://www.jstor.org/",
    type: "research",
    domains: ["humanities", "social-science", "history"],
    debiasedTier: 2,
  },
  {
    name: "Pew Research Center",
    url: "https://www.pewresearch.org/",
    type: "research",
    domains: ["society", "demographics", "politics", "technology"],
    debiasedTier: 2,
  },
  {
    name: "Wikipedia",
    url: "https://en.wikipedia.org/",
    type: "research",
    domains: ["all"],
    debiasedTier: 2,
  },
  {
    name: "AP News",
    url: "https://apnews.com/",
    type: "news",
    domains: ["global", "politics", "society"],
    debiasedTier: 2,
  },

  // Tier 3: Moderate debiased scores (0.55-0.65) - use with awareness
  {
    name: "Bureau of Labor Statistics",
    url: "https://www.bls.gov/",
    type: "research",
    domains: ["economics", "labor", "employment"],
    debiasedTier: 3,
  },
  {
    name: "FRED Economic Data",
    url: "https://fred.stlouisfed.org/",
    type: "research",
    domains: ["economics", "finance"],
    debiasedTier: 3,
  },
  {
    name: "World Bank Data",
    url: "https://data.worldbank.org/",
    type: "research",
    domains: ["economics", "development", "global"],
    debiasedTier: 3,
  },
  {
    name: "Reuters",
    url: "https://www.reuters.com/",
    type: "news",
    domains: ["global", "economics", "politics", "technology"],
    debiasedTier: 3,
  },
];

/**
 * Get sources filtered by debiased tier
 */
export function getSourcesByDebiasedTier(maxTier: 1 | 2 | 3 = 2): SourceConfig[] {
  return MOST_DEBIASED_SOURCES.filter(s => (s.debiasedTier ?? 3) <= maxTier);
}

// Sources to avoid or treat with heavy skepticism
export const LOW_CREDIBILITY_PATTERNS = [
  // Engagement-optimized platforms
  /medium\.com/,
  /substack\.com/,  // Unless specific trusted author
  /twitter\.com/,
  /x\.com/,
  /facebook\.com/,
  /reddit\.com/,
  /linkedin\.com/,

  // Content farms
  /buzzfeed\./,
  /huffpost\./,

  // Known misinformation vectors
  /infowars\./,
  /breitbart\./,
  /naturalnews\./,

  // PR/Marketing disguised as news
  /prnewswire\./,
  /businesswire\./,
  /globenewswire\./,
];

export function isLowCredibilitySource(url: string): boolean {
  return LOW_CREDIBILITY_PATTERNS.some(pattern => pattern.test(url));
}

// Categories of bias to track
export const BIAS_CATEGORIES = {
  commercial: {
    description: "Revenue/profit motivated reporting",
    examples: ["advertising pressure", "sponsor relationships", "engagement optimization"],
  },
  political: {
    description: "Partisan or governmental influence",
    examples: ["party alignment", "government funding", "regulatory capture"],
  },
  ideological: {
    description: "Worldview-driven interpretation",
    examples: ["think tank advocacy", "activist framing", "movement alignment"],
  },
  institutional: {
    description: "Organizational self-interest",
    examples: ["funding source bias", "industry relationships", "career incentives"],
  },
  selection: {
    description: "Choosing what to report/study",
    examples: ["publication bias", "newsworthy bias", "availability bias"],
  },
};
