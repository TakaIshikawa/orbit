"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, type Pattern } from "@/lib/api";

type SortOption = "confidence_desc" | "confidence_asc" | "recency" | "title";

export default function PatternsPage() {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recency");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["patterns"],
    queryFn: () => api.getPatterns({ limit: 100 }),
  });

  // Get unique pattern types and domains for filters
  const { patternTypes, domains, filteredPatterns } = useMemo(() => {
    const patterns = data?.data || [];
    const types = new Set<string>();
    const doms = new Set<string>();

    patterns.forEach((p) => {
      types.add(p.patternType);
      p.domains.forEach((d) => doms.add(d));
    });

    // Filter patterns
    let filtered = patterns;

    if (typeFilter !== "all") {
      filtered = filtered.filter((p) => p.patternType === typeFilter);
    }

    if (domainFilter !== "all") {
      filtered = filtered.filter((p) => p.domains.includes(domainFilter));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query)
      );
    }

    // Sort patterns
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "confidence_desc":
          return b.confidence - a.confidence;
        case "confidence_asc":
          return a.confidence - b.confidence;
        case "title":
          return a.title.localeCompare(b.title);
        case "recency":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return {
      patternTypes: Array.from(types).sort(),
      domains: Array.from(doms).sort(),
      filteredPatterns: filtered,
    };
  }, [data, typeFilter, domainFilter, sortBy, searchQuery]);

  // Confidence distribution stats
  const confidenceStats = useMemo(() => {
    const patterns = filteredPatterns;
    if (patterns.length === 0) return null;

    const high = patterns.filter((p) => p.confidence >= 0.7).length;
    const medium = patterns.filter((p) => p.confidence >= 0.4 && p.confidence < 0.7).length;
    const low = patterns.filter((p) => p.confidence < 0.4).length;
    const avg = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;

    return { high, medium, low, avg, total: patterns.length };
  }, [filteredPatterns]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Patterns</h1>
          <p className="text-gray-400">Detected systemic patterns from sources</p>
        </div>
        <button className="bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors">
          New Pattern
        </button>
      </div>

      {/* Confidence Stats */}
      {confidenceStats && (
        <div className="grid grid-cols-5 gap-4">
          <div className="border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Total</div>
            <div className="text-2xl font-bold">{confidenceStats.total}</div>
          </div>
          <div className="border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">High Confidence</div>
            <div className="text-2xl font-bold text-green-400">{confidenceStats.high}</div>
          </div>
          <div className="border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Medium</div>
            <div className="text-2xl font-bold text-yellow-400">{confidenceStats.medium}</div>
          </div>
          <div className="border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Low</div>
            <div className="text-2xl font-bold text-red-400">{confidenceStats.low}</div>
          </div>
          <div className="border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Average</div>
            <div className="text-2xl font-bold">{(confidenceStats.avg * 100).toFixed(0)}%</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search patterns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Type:</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Types</option>
            {patternTypes.map((type) => (
              <option key={type} value={type}>
                {formatPatternType(type)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Domain:</label>
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Domains</option>
            {domains.map((domain) => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Sort:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="recency">Most Recent</option>
            <option value="confidence_desc">Highest Confidence</option>
            <option value="confidence_asc">Lowest Confidence</option>
            <option value="title">Title A-Z</option>
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-gray-400">Loading patterns...</div>
        </div>
      )}

      {error && (
        <div className="text-red-400 border border-red-800 rounded-lg p-4">
          <p className="font-medium">Error loading patterns</p>
          <p className="text-sm mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          <p className="text-sm text-gray-500 mt-2">Make sure the API is running on port 3001</p>
        </div>
      )}

      {data && filteredPatterns.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">
            {searchQuery || typeFilter !== "all" || domainFilter !== "all"
              ? "No patterns match your filters"
              : "No patterns detected yet"}
          </p>
          {!searchQuery && typeFilter === "all" && domainFilter === "all" && (
            <p className="text-sm text-gray-500">Run the Scout agent to discover patterns</p>
          )}
        </div>
      )}

      {data && filteredPatterns.length > 0 && (
        <>
          <div className="text-sm text-gray-500">
            Showing {filteredPatterns.length} of {data.meta.total} patterns
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPatterns.map((pattern) => (
              <PatternCard key={pattern.id} pattern={pattern} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatPatternType(type: string): string {
  const labels: Record<string, string> = {
    policy_gap: "Policy Gap",
    structural_inefficiency: "Structural Inefficiency",
    feedback_loop: "Feedback Loop",
    information_asymmetry: "Information Asymmetry",
    coordination_failure: "Coordination Failure",
    other: "Other",
  };
  return labels[type] || type.replace(/_/g, " ");
}

function PatternCard({ pattern }: { pattern: Pattern }) {
  const typeColors: Record<string, string> = {
    policy_gap: "bg-red-900/50 text-red-300",
    structural_inefficiency: "bg-orange-900/50 text-orange-300",
    feedback_loop: "bg-purple-900/50 text-purple-300",
    information_asymmetry: "bg-blue-900/50 text-blue-300",
    coordination_failure: "bg-yellow-900/50 text-yellow-300",
    other: "bg-gray-800 text-gray-300",
  };

  const confidenceColor =
    pattern.confidence >= 0.7 ? "text-green-400" :
    pattern.confidence >= 0.4 ? "text-yellow-400" : "text-red-400";

  const confidenceBg =
    pattern.confidence >= 0.7 ? "bg-green-900/20" :
    pattern.confidence >= 0.4 ? "bg-yellow-900/20" : "bg-red-900/20";

  return (
    <Link
      href={`/patterns/${pattern.id}`}
      className="block border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <span className={`text-xs px-2 py-1 rounded ${typeColors[pattern.patternType] || typeColors.other}`}>
          {formatPatternType(pattern.patternType)}
        </span>
        <div className={`text-right px-2 py-1 rounded ${confidenceBg}`}>
          <span className={`text-sm font-bold ${confidenceColor}`}>
            {(pattern.confidence * 100).toFixed(0)}%
          </span>
          <span className="text-xs text-gray-500 ml-1">confidence</span>
        </div>
      </div>
      <h3 className="font-semibold">{pattern.title}</h3>
      <p className="text-gray-400 text-sm mt-1 line-clamp-2">{pattern.description}</p>
      <div className="flex gap-2 mt-3 flex-wrap">
        {pattern.domains.slice(0, 3).map((domain) => (
          <span key={domain} className="text-xs text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded">
            {domain}
          </span>
        ))}
        {pattern.domains.length > 3 && (
          <span className="text-xs text-gray-600">+{pattern.domains.length - 3}</span>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
        <span>{new Date(pattern.createdAt).toLocaleDateString()}</span>
        <div className="flex items-center gap-2">
          <span className="capitalize">{pattern.status}</span>
          {pattern.sources.length > 0 && (
            <span className="text-blue-400">{pattern.sources.length} sources</span>
          )}
        </div>
      </div>
    </Link>
  );
}
