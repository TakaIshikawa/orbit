"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, type Issue } from "@/lib/api";

type SortOption = "actionability" | "urgency" | "neglectedness" | "composite";

export default function IssuesPage() {
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("actionability");

  const { data, isLoading, error } = useQuery({
    queryKey: ["issues"],
    queryFn: () => api.getIssues({ limit: 100 }),
  });

  // Fetch solutions to determine which issues have solutions and their feasibility
  const { data: solutionsData } = useQuery({
    queryKey: ["solutions"],
    queryFn: () => api.getSolutions({ limit: 100 }),
  });

  // Fetch verifications for evidence strength
  const { data: verificationsData } = useQuery({
    queryKey: ["verifications"],
    queryFn: () => api.getVerifications({ limit: 100 }),
  });

  // Extract unique domains from all issues
  const allDomains = useMemo(() => {
    if (!data?.data) return [];
    const domains = new Set<string>();
    for (const issue of data.data) {
      for (const domain of issue.affectedDomains) {
        domains.add(domain);
      }
    }
    return Array.from(domains).sort();
  }, [data]);

  // Create a map of issue IDs to solution info
  const solutionInfoByIssue = useMemo(() => {
    if (!solutionsData?.data) return new Map<string, { count: number; hasFeasible: boolean }>();
    const info = new Map<string, { count: number; hasFeasible: boolean }>();
    for (const s of solutionsData.data) {
      if (s.issueId) {
        const existing = info.get(s.issueId) || { count: 0, hasFeasible: false };
        existing.count++;
        if ((s.feasibilityScore ?? 0) >= 0.6) {
          existing.hasFeasible = true;
        }
        info.set(s.issueId, existing);
      }
    }
    return info;
  }, [solutionsData]);

  // Create a map of issue IDs to verification info
  const verificationInfoByIssue = useMemo(() => {
    if (!verificationsData?.data) return new Map<string, { total: number; verified: number }>();
    const info = new Map<string, { total: number; verified: number }>();
    for (const v of verificationsData.data) {
      // Verifications are linked through patterns which are linked to issues
      // For simplicity, we'll use sourceId if it's an issue
      if (v.sourceType === "issue") {
        const existing = info.get(v.sourceId) || { total: 0, verified: 0 };
        existing.total++;
        if (v.status === "corroborated" || v.status === "partially_supported") {
          existing.verified++;
        }
        info.set(v.sourceId, existing);
      }
    }
    return info;
  }, [verificationsData]);

  // Compute actionability and filter/sort issues
  const processedIssues = useMemo(() => {
    if (!data?.data) return [];

    return data.data
      .map((issue) => {
        const solutionInfo = solutionInfoByIssue.get(issue.id) || { count: 0, hasFeasible: false };
        const verificationInfo = verificationInfoByIssue.get(issue.id) || { total: 0, verified: 0 };

        // Compute actionability
        const actionability = (
          (issue.scoreTractability ?? 0.5) * 0.4 +
          (solutionInfo.hasFeasible ? 0.3 : 0) +
          (issue.scoreUrgency ?? 0.5) * 0.2 +
          (issue.scoreNeglectedness ?? 0.5) * 0.1
        );

        // Evidence strength
        const evidenceStrength = verificationInfo.total > 0
          ? verificationInfo.verified / verificationInfo.total
          : null;

        return {
          ...issue,
          actionability,
          solutionCount: solutionInfo.count,
          hasFeasibleSolution: solutionInfo.hasFeasible,
          evidenceStrength,
          verifiedClaims: verificationInfo.verified,
          totalClaims: verificationInfo.total,
        };
      })
      .filter((issue) => {
        if (selectedDomain === "all") return true;
        return issue.affectedDomains.includes(selectedDomain);
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "actionability":
            return b.actionability - a.actionability;
          case "urgency":
            return (b.scoreUrgency ?? 0) - (a.scoreUrgency ?? 0);
          case "neglectedness":
            return (b.scoreNeglectedness ?? 0) - (a.scoreNeglectedness ?? 0);
          case "composite":
          default:
            return b.compositeScore - a.compositeScore;
        }
      });
  }, [data, selectedDomain, sortBy, solutionInfoByIssue, verificationInfoByIssue]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Issues</h1>
          <p className="text-gray-400">Browse and act on systemic issues</p>
        </div>
      </div>

      {/* Filters and Sort */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Domain Filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Domain:</label>
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Domains</option>
            {allDomains.map((domain) => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>
        </div>

        {/* Sort Options */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Sort by:</label>
          <div className="flex gap-1">
            {[
              { id: "actionability", label: "Most Actionable" },
              { id: "urgency", label: "Most Urgent" },
              { id: "neglectedness", label: "Most Neglected" },
              { id: "composite", label: "Composite Score" },
            ].map((option) => (
              <button
                key={option.id}
                onClick={() => setSortBy(option.id as SortOption)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  sortBy === option.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-gray-400">Loading issues...</div>
        </div>
      )}

      {error && (
        <div className="text-red-400 border border-red-800 rounded-lg p-4">
          <p className="font-medium">Error loading issues</p>
          <p className="text-sm mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      )}

      {data && processedIssues.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">
            {selectedDomain !== "all" ? "No issues in this domain" : "No issues tracked yet"}
          </p>
          <p className="text-sm text-gray-500">
            {selectedDomain !== "all"
              ? "Try selecting a different domain"
              : "Run the discovery pipeline to find issues"}
          </p>
        </div>
      )}

      {processedIssues.length > 0 && (
        <>
          <div className="text-sm text-gray-500">
            {processedIssues.length} issue{processedIssues.length !== 1 ? "s" : ""}
            {selectedDomain !== "all" && ` in ${selectedDomain}`}
          </div>
          <div className="space-y-4">
            {processedIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface ProcessedIssue extends Issue {
  actionability: number;
  solutionCount: number;
  hasFeasibleSolution: boolean;
  evidenceStrength: number | null;
  verifiedClaims: number;
  totalClaims: number;
}

function IssueCard({ issue }: { issue: ProcessedIssue }) {
  // Determine simple status for display
  const simpleStatus = issue.simpleStatus || (
    issue.solutionCount > 0 && issue.hasFeasibleSolution ? "being_worked" :
    issue.scoreUrgency > 0.6 ? "needs_attention" : "watching"
  );

  const statusConfig: Record<string, { label: string; color: string }> = {
    needs_attention: { label: "Needs Attention", color: "bg-red-900/50 text-red-300 border-red-800" },
    being_worked: { label: "Being Worked", color: "bg-yellow-900/50 text-yellow-300 border-yellow-800" },
    blocked: { label: "Blocked", color: "bg-orange-900/50 text-orange-300 border-orange-800" },
    watching: { label: "Watching", color: "bg-blue-900/50 text-blue-300 border-blue-800" },
    resolved: { label: "Resolved", color: "bg-green-900/50 text-green-300 border-green-800" },
  };

  const status = statusConfig[simpleStatus] || statusConfig.watching;

  // Priority color based on composite score
  const priorityColor = issue.compositeScore >= 0.7 ? "border-l-red-500" :
    issue.compositeScore >= 0.4 ? "border-l-yellow-500" : "border-l-green-500";

  return (
    <Link
      href={`/issues/${issue.id}`}
      className={`block border border-gray-800 border-l-4 ${priorityColor} rounded-lg p-4 hover:border-gray-700 hover:bg-gray-900/30 transition-colors`}
    >
      {/* Top Row: Status + Key Number + Priority */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded border ${status.color}`}>
            {status.label}
          </span>
          {issue.keyNumber && (
            <span className="text-sm font-medium text-white bg-gray-800 px-2 py-0.5 rounded">
              {issue.keyNumber}
            </span>
          )}
        </div>
        <div className={`text-xl font-bold ${
          issue.compositeScore >= 0.7 ? "text-red-400" :
          issue.compositeScore >= 0.4 ? "text-yellow-400" : "text-green-400"
        }`}>
          {(issue.compositeScore * 100).toFixed(0)}
        </div>
      </div>

      {/* Headline or Title */}
      <h3 className="font-semibold text-lg mb-1">
        {issue.headline || issue.title}
      </h3>

      {/* Why Now or Summary (shortened) */}
      <p className="text-gray-400 text-sm line-clamp-2">
        {issue.whyNow || issue.summary}
      </p>

      {/* Simple Indicators Row */}
      <div className="mt-4 flex items-center justify-between">
        {/* Visual score indicators (simplified) */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5" title="Urgency">
            <span className={`w-2 h-2 rounded-full ${
              issue.scoreUrgency >= 0.7 ? "bg-red-500" :
              issue.scoreUrgency >= 0.4 ? "bg-yellow-500" : "bg-green-500"
            }`} />
            <span className="text-gray-500">Urgent</span>
          </div>
          <div className="flex items-center gap-1.5" title="Tractability">
            <span className={`w-2 h-2 rounded-full ${
              issue.scoreTractability >= 0.7 ? "bg-green-500" :
              issue.scoreTractability >= 0.4 ? "bg-yellow-500" : "bg-red-500"
            }`} />
            <span className="text-gray-500">Tractable</span>
          </div>
          <div className="flex items-center gap-1.5" title="Neglectedness">
            <span className={`w-2 h-2 rounded-full ${
              issue.scoreNeglectedness >= 0.7 ? "bg-red-500" :
              issue.scoreNeglectedness >= 0.4 ? "bg-yellow-500" : "bg-green-500"
            }`} />
            <span className="text-gray-500">Neglected</span>
          </div>
        </div>

        {/* Activity indicator */}
        <div className="flex items-center gap-3 text-xs">
          {issue.solutionCount > 0 && (
            <span className={`flex items-center gap-1 ${issue.hasFeasibleSolution ? "text-green-400" : "text-gray-400"}`}>
              {issue.solutionCount} solution{issue.solutionCount !== 1 ? "s" : ""}
              {issue.hasFeasibleSolution && <span>✓</span>}
            </span>
          )}
          {issue.solutionCount === 0 && (
            <span className="text-gray-600">No solutions yet</span>
          )}
        </div>
      </div>

      {/* Domains (compact) */}
      <div className="mt-3 flex gap-1.5 flex-wrap">
        {issue.affectedDomains.slice(0, 3).map((domain) => (
          <span key={domain} className="text-xs bg-gray-800/50 px-2 py-0.5 rounded text-gray-500">
            {domain}
          </span>
        ))}
        {issue.affectedDomains.length > 3 && (
          <span className="text-xs text-gray-600">+{issue.affectedDomains.length - 3}</span>
        )}
      </div>
    </Link>
  );
}

const SCORE_DEFINITIONS: Record<string, { full: string; description: string }> = {
  I: { full: "Impact", description: "Scale and severity of harm" },
  U: { full: "Urgency", description: "Time sensitivity" },
  T: { full: "Tractability", description: "Feasibility of progress" },
  L: { full: "Legitimacy", description: "Recognition and support" },
  N: { full: "Neglectedness", description: "How underserved" },
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const height = Math.max(4, value * 32);
  const color =
    value >= 0.7 ? "bg-red-500" : value >= 0.4 ? "bg-yellow-500" : "bg-green-500";
  const def = SCORE_DEFINITIONS[label];

  return (
    <div className="flex flex-col items-center group relative">
      <div className="h-8 w-4 bg-gray-800 rounded relative overflow-hidden">
        <div
          className={`absolute bottom-0 w-full ${color} rounded-t transition-all`}
          style={{ height: `${height}px` }}
        />
      </div>
      <span className="text-xs text-gray-500 mt-1">{label}</span>
      {def && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
          <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs w-40 shadow-lg">
            <div className="font-medium text-white mb-1">{def.full}</div>
            <div className="text-gray-400">{def.description}</div>
            <div className="text-gray-500 mt-1">{(value * 100).toFixed(0)}%</div>
          </div>
        </div>
      )}
    </div>
  );
}
