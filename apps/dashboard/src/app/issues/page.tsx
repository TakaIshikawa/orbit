"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, type Issue } from "@/lib/api";

export default function IssuesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["issues"],
    queryFn: () => api.getIssues(),
  });

  // Fetch briefs to determine which issues have briefs
  const { data: briefsData } = useQuery({
    queryKey: ["briefs"],
    queryFn: () => api.getBriefs(),
  });

  // Fetch solutions to determine which issues have solutions
  const { data: solutionsData } = useQuery({
    queryKey: ["solutions"],
    queryFn: () => api.getSolutions(),
  });

  // Create a set of issue IDs that have briefs
  const issuesWithBriefs = React.useMemo(() => {
    if (!briefsData?.data) return new Set<string>();
    return new Set(briefsData.data.map((b) => b.issueId));
  }, [briefsData]);

  // Create a map of issue IDs to solution counts
  const solutionCountByIssue = React.useMemo(() => {
    if (!solutionsData?.data) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const s of solutionsData.data) {
      if (s.issueId) {
        counts.set(s.issueId, (counts.get(s.issueId) || 0) + 1);
      }
    }
    return counts;
  }, [solutionsData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Issues & Briefs</h1>
          <p className="text-gray-400">Systemic issues prioritized by IUTLN scoring</p>
        </div>
        <button className="bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors">
          New Issue
        </button>
      </div>

      <IUTLNLegend />

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

      {data && data.data.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">No issues tracked yet</p>
          <p className="text-sm text-gray-500">Create an issue from detected patterns</p>
        </div>
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="text-sm text-gray-500">
            {data.meta.total} issues found
            {briefsData && ` · ${issuesWithBriefs.size} with briefs`}
            {solutionsData && ` · ${solutionsData.data.length} solutions`}
          </div>
          <div className="space-y-4">
            {data.data.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                hasBrief={issuesWithBriefs.has(issue.id)}
                solutionCount={solutionCountByIssue.get(issue.id) || 0}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IssueCard({ issue, hasBrief, solutionCount }: { issue: Issue; hasBrief: boolean; solutionCount: number }) {
  const statusColors: Record<string, string> = {
    identified: "bg-gray-700 text-gray-300",
    investigating: "bg-blue-900/50 text-blue-300",
    modeling: "bg-purple-900/50 text-purple-300",
    planning: "bg-yellow-900/50 text-yellow-300",
    executing: "bg-orange-900/50 text-orange-300",
    resolved: "bg-green-900/50 text-green-300",
    wont_fix: "bg-red-900/50 text-red-300",
  };

  const scoreColor = (score: number) => {
    if (score >= 0.7) return "text-red-400";
    if (score >= 0.4) return "text-yellow-400";
    return "text-green-400";
  };

  return (
    <Link href={`/issues/${issue.id}`} className="block border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded ${statusColors[issue.issueStatus] || statusColors.identified}`}>
            {issue.issueStatus.replace("_", " ")}
          </span>
          <span className="text-xs text-gray-500">{issue.timeHorizon}</span>
          {hasBrief && (
            <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-1 rounded">
              Brief
            </span>
          )}
        </div>
        <div className={`text-lg font-bold ${scoreColor(issue.compositeScore)}`}>
          {(issue.compositeScore * 100).toFixed(0)}
        </div>
      </div>

      <h3 className="font-semibold text-lg">{issue.title}</h3>
      <p className="text-gray-400 text-sm mt-1 line-clamp-2">{issue.summary}</p>

      <div className="mt-4 grid grid-cols-5 gap-2 text-center">
        <ScoreBar label="I" value={issue.scoreImpact} />
        <ScoreBar label="U" value={issue.scoreUrgency} />
        <ScoreBar label="T" value={issue.scoreTractability} />
        <ScoreBar label="L" value={issue.scoreLegitimacy} />
        <ScoreBar label="N" value={issue.scoreNeglectedness} />
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <div className="flex gap-2">
          {issue.affectedDomains.slice(0, 3).map((domain) => (
            <span key={domain} className="bg-gray-800/50 px-2 py-0.5 rounded">
              {domain}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span>{issue.patternIds.length} patterns</span>
          {solutionCount > 0 && <span>{solutionCount} solutions</span>}
          {!hasBrief && <span className="text-gray-600">No brief yet</span>}
        </div>
      </div>
    </Link>
  );
}

const SCORE_DEFINITIONS: Record<string, { full: string; description: string; interpretation: string }> = {
  I: {
    full: "Impact",
    description: "Scale and severity of harm caused by this issue",
    interpretation: "High = affects many people or causes severe harm",
  },
  U: {
    full: "Urgency",
    description: "Time sensitivity and rate of deterioration",
    interpretation: "High = getting worse quickly, needs immediate action",
  },
  T: {
    full: "Tractability",
    description: "Feasibility of making meaningful progress",
    interpretation: "High = clear path to improvement exists",
  },
  L: {
    full: "Legitimacy",
    description: "Public/institutional recognition and support",
    interpretation: "High = widely recognized, has stakeholder buy-in",
  },
  N: {
    full: "Neglectedness",
    description: "How underserved the issue is by existing efforts",
    interpretation: "High = few others working on it, high marginal value",
  },
};

function IUTLNLegend() {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-400 hover:bg-gray-800/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-blue-400">?</span>
          IUTLN Scoring Framework
        </span>
        <span className="text-xs">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-800">
          <p className="text-xs text-gray-500 pt-3">
            Issues are scored on 5 dimensions (0-100%). Higher composite scores indicate higher priority.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {Object.entries(SCORE_DEFINITIONS).map(([key, def]) => (
              <div key={key} className="bg-gray-800/30 rounded p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-white">{key}</span>
                  <span className="text-sm text-gray-300">{def.full}</span>
                </div>
                <p className="text-xs text-gray-500">{def.description}</p>
                <p className="text-xs text-gray-600 mt-1 italic">{def.interpretation}</p>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 pt-2 border-t border-gray-800">
            <span className="font-medium text-gray-400">Color scale:</span>{" "}
            <span className="text-green-400">Low (0-40%)</span> &middot;{" "}
            <span className="text-yellow-400">Medium (40-70%)</span> &middot;{" "}
            <span className="text-red-400">High (70-100%)</span>
          </div>
        </div>
      )}
    </div>
  );
}

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
          <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs w-48 shadow-lg">
            <div className="font-medium text-white mb-1">{def.full}</div>
            <div className="text-gray-400">{def.description}</div>
            <div className="text-gray-500 mt-1">{(value * 100).toFixed(0)}%</div>
          </div>
        </div>
      )}
    </div>
  );
}
