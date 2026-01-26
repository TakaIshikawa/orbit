/**
 * Source Accessibility Profiles
 *
 * Tracks which sources can be freely accessed vs requiring:
 * - Paywall/subscription
 * - Registration/account
 * - API keys
 * - Rate limits
 */

import type { AccessibilityProfile } from "./credibility.js";

export const ACCESSIBILITY_PROFILES: Record<string, AccessibilityProfile> = {
  // ============================================
  // FULLY PUBLIC - No restrictions
  // ============================================
  "arxiv.org": {
    access: "public",
    rateLimit: "moderate",
    apiAvailable: true,
    robotsAllowed: true,
  },
  "ourworldindata.org": {
    access: "public",
    rateLimit: "none",
    apiAvailable: true,
    robotsAllowed: true,
    notes: "Excellent data API, GitHub repos available",
  },
  "gapminder.org": {
    access: "public",
    rateLimit: "none",
    apiAvailable: true,
    robotsAllowed: true,
  },
  "data.worldbank.org": {
    access: "public",
    rateLimit: "low",
    apiAvailable: true,
    robotsAllowed: true,
  },
  "data.oecd.org": {
    access: "public",
    rateLimit: "low",
    apiAvailable: true,
    robotsAllowed: true,
  },
  "fred.stlouisfed.org": {
    access: "public",
    rateLimit: "moderate",
    apiAvailable: true,
    robotsAllowed: true,
    notes: "Free API with registration",
  },
  "census.gov": {
    access: "public",
    rateLimit: "low",
    apiAvailable: true,
    robotsAllowed: true,
  },
  "bls.gov": {
    access: "public",
    rateLimit: "low",
    apiAvailable: true,
    robotsAllowed: true,
  },
  "data.gov": {
    access: "public",
    rateLimit: "low",
    apiAvailable: true,
    robotsAllowed: true,
  },
  "cdc.gov": {
    access: "public",
    rateLimit: "low",
    robotsAllowed: true,
  },
  "who.int": {
    access: "public",
    rateLimit: "low",
    robotsAllowed: true,
  },
  "apnews.com": {
    access: "public",
    rateLimit: "moderate",
    robotsAllowed: true,
  },
  "reuters.com": {
    access: "freemium",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Some articles free, premium content paywalled",
  },
  "bbc.com": {
    access: "public",
    rateLimit: "moderate",
    robotsAllowed: true,
  },
  "wikipedia.org": {
    access: "public",
    rateLimit: "moderate",
    apiAvailable: true,
    robotsAllowed: true,
  },
  "pubmed.ncbi.nlm.nih.gov": {
    access: "public",
    rateLimit: "moderate",
    apiAvailable: true,
    robotsAllowed: true,
    notes: "Abstracts free, some full text available",
  },

  // ============================================
  // FREEMIUM - Limited free access
  // ============================================
  "nber.org": {
    access: "freemium",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Working papers free, some require subscription",
  },
  "ssrn.com": {
    access: "freemium",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Most papers free, some restricted",
  },
  "brookings.edu": {
    access: "public",
    rateLimit: "low",
    robotsAllowed: true,
  },
  "urban.org": {
    access: "public",
    rateLimit: "low",
    robotsAllowed: true,
  },
  "pewresearch.org": {
    access: "public",
    rateLimit: "low",
    robotsAllowed: true,
  },
  "rand.org": {
    access: "freemium",
    rateLimit: "low",
    robotsAllowed: true,
    notes: "Many reports free, some require purchase",
  },

  // ============================================
  // REGISTRATION REQUIRED
  // ============================================
  "scholar.google.com": {
    access: "public",
    rateLimit: "strict",
    robotsAllowed: false,
    notes: "Heavy rate limiting and CAPTCHA",
  },

  // ============================================
  // PAYWALL - Subscription required
  // ============================================
  "nature.com": {
    access: "paywall",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Some open access, most require subscription",
  },
  "sciencedirect.com": {
    access: "paywall",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Academic subscription required",
  },
  "jstor.org": {
    access: "paywall",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Some free articles, most require subscription",
  },
  "nytimes.com": {
    access: "paywall",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Limited free articles per month",
  },
  "washingtonpost.com": {
    access: "paywall",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Limited free articles per month",
  },
  "wsj.com": {
    access: "paywall",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Strict paywall",
  },
  "economist.com": {
    access: "paywall",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Limited free articles",
  },
  "ft.com": {
    access: "paywall",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Strict paywall",
  },

  // ============================================
  // TECH NEWS - Generally accessible
  // ============================================
  "techcrunch.com": {
    access: "public",
    rateLimit: "moderate",
    robotsAllowed: true,
  },
  "theverge.com": {
    access: "public",
    rateLimit: "moderate",
    robotsAllowed: true,
  },
  "arstechnica.com": {
    access: "freemium",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Some premium content",
  },
  "wired.com": {
    access: "freemium",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Limited free articles",
  },
  "news.ycombinator.com": {
    access: "public",
    rateLimit: "moderate",
    apiAvailable: true,
    robotsAllowed: true,
  },

  // ============================================
  // USER-GENERATED - Public but variable quality
  // ============================================
  "medium.com": {
    access: "freemium",
    rateLimit: "moderate",
    robotsAllowed: true,
    notes: "Limited free articles, membership for full access",
  },
  "substack.com": {
    access: "freemium",
    rateLimit: "low",
    robotsAllowed: true,
    notes: "Depends on individual author settings",
  },
};

export function getAccessibility(url: string): AccessibilityProfile {
  const domain = extractDomain(url);
  return ACCESSIBILITY_PROFILES[domain] || {
    access: "public",
    rateLimit: "moderate",
    notes: "Unknown - access not verified",
  };
}

export function isPubliclyAccessible(url: string): boolean {
  const profile = getAccessibility(url);
  return profile.access === "public" || profile.access === "freemium";
}

export function isFullyPublic(url: string): boolean {
  const profile = getAccessibility(url);
  return profile.access === "public";
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Get sources that are both high credibility AND publicly accessible
export function getPublicHighCredibilitySources(): string[] {
  return [
    // Government Data (public, high credibility)
    "census.gov",
    "bls.gov",
    "fred.stlouisfed.org",
    "data.gov",
    "cdc.gov",

    // International Data (public, high credibility)
    "data.worldbank.org",
    "data.oecd.org",
    "who.int",

    // Research Organizations (public, high credibility)
    "ourworldindata.org",
    "gapminder.org",
    "pewresearch.org",

    // Academic Preprints (public, good credibility)
    "arxiv.org",

    // Wire Services (public/freemium, high credibility)
    "apnews.com",
    "bbc.com",

    // Think Tanks (public, moderate credibility - use with awareness)
    "brookings.edu",
    "urban.org",
  ];
}
