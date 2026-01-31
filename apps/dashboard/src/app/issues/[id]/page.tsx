"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, type Solution, type Verification, type Issue, type SimpleStatus, type Outcome } from "@/lib/api";
import { IssueRelationshipGraph } from "@/components/issue-relationship-graph";
import { OutcomeRecordingModal } from "@/components/outcome-recording-modal";

// Placeholder user ID - in production this would come from auth
const CURRENT_USER_ID = "user_default";

// Simple status display config
const simpleStatusConfig: Record<SimpleStatus, { label: string; color: string; icon: string }> = {
  needs_attention: { label: "Needs Attention", color: "bg-red-900/50 text-red-300 border-red-700", icon: "!" },
  being_worked: { label: "Being Worked", color: "bg-yellow-900/50 text-yellow-300 border-yellow-700", icon: "~" },
  blocked: { label: "Blocked", color: "bg-orange-900/50 text-orange-300 border-orange-700", icon: "x" },
  watching: { label: "Watching", color: "bg-blue-900/50 text-blue-300 border-blue-700", icon: "o" },
  resolved: { label: "Resolved", color: "bg-green-900/50 text-green-300 border-green-700", icon: "+" },
};

type Tab = "problem" | "evidence" | "actions" | "efforts" | "outcomes";

export default function IssueDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const queryClient = useQueryClient();

  // Get initial tab from URL or default to "problem"
  const initialTab = (searchParams.get("tab") as Tab) || "problem";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Sync tab with URL
  useEffect(() => {
    const tabFromUrl = searchParams.get("tab") as Tab;
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams, activeTab]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["issue", id],
    queryFn: () => api.getIssue(id),
  });

  const { data: briefData } = useQuery({
    queryKey: ["brief-by-issue", id],
    queryFn: () => api.getBriefByIssue(id).catch(() => null),
    enabled: !!id,
  });

  const briefId = briefData?.data?.id;
  const { data: situationData } = useQuery({
    queryKey: ["situation-by-brief", briefId],
    queryFn: () => api.getSituationByBrief(briefId!).catch(() => null),
    enabled: !!briefId,
  });

  const { data: solutionsData, isLoading: solutionsLoading } = useQuery({
    queryKey: ["solutions-by-issue", id],
    queryFn: () => api.getSolutionsByIssue(id).catch(() => ({ data: [], meta: { total: 0, limit: 20, offset: 0 } })),
    enabled: !!id,
  });

  const { data: verificationsData, isLoading: verificationsLoading } = useQuery({
    queryKey: ["verifications-by-issue", id],
    queryFn: () => api.getVerificationsByIssue(id).catch(() => ({ data: [], meta: { total: 0, issueId: id, patternCount: 0, hasBrief: false } })),
    enabled: !!id,
  });

  const assignMutation = useMutation({
    mutationFn: ({ solutionId, userId }: { solutionId: string; userId: string }) =>
      api.assignSolution(solutionId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["solutions-by-issue", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ solutionId, status }: { solutionId: string; status: "proposed" | "approved" | "in_progress" | "completed" | "abandoned" }) =>
      api.updateSolutionStatus(solutionId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["solutions-by-issue", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
    },
  });

  const summarizeMutation = useMutation({
    mutationFn: () => api.summarizeIssue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", id] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (reason?: string) => api.archiveIssue(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", id] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => api.unarchiveIssue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", id] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Loading issue...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-red-400 border border-red-800 rounded-lg p-4">
        <p className="font-medium">Error loading issue</p>
        <p className="text-sm mt-1">{error instanceof Error ? error.message : "Issue not found"}</p>
        <Link href="/issues" className="text-blue-400 text-sm mt-2 inline-block hover:underline">
          Back to issues
        </Link>
      </div>
    );
  }

  const issue = data.data;
  const brief = briefData?.data;
  const situation = situationData?.data;
  const solutions = solutionsData?.data ?? [];
  const verifications = verificationsData?.data ?? [];

  // Separate solutions by status
  const proposedSolutions = solutions.filter(s => s.solutionStatus === "proposed" || s.solutionStatus === "approved");
  const inProgressSolutions = solutions.filter(s => s.solutionStatus === "in_progress");
  const completedSolutions = solutions.filter(s => s.solutionStatus === "completed");

  // Compute actionability
  const hasFeasibleSolution = solutions.some(s => (s.feasibilityScore ?? 0) >= 0.6);
  const actionability = (
    (issue.scoreTractability ?? 0.5) * 0.4 +
    (hasFeasibleSolution ? 0.3 : 0) +
    (issue.scoreUrgency ?? 0.5) * 0.2 +
    (issue.scoreNeglectedness ?? 0.5) * 0.1
  );

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "problem", label: "The Problem" },
    { id: "evidence", label: "The Evidence", count: verifications.length },
    { id: "actions", label: "What Can Be Done", count: proposedSolutions.length },
    { id: "efforts", label: "Active Efforts", count: inProgressSolutions.length },
    { id: "outcomes", label: "Outcomes", count: completedSolutions.length },
  ];

  // Determine simple status for display
  const displayStatus = issue.simpleStatus || (
    inProgressSolutions.length > 0 ? "being_worked" :
    issue.scoreUrgency > 0.6 ? "needs_attention" : "watching"
  );
  const statusInfo = simpleStatusConfig[displayStatus as SimpleStatus] || simpleStatusConfig.watching;

  // Has condensed summary?
  const hasCondensedSummary = !!issue.headline;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Archive Banner */}
      {issue.isArchived && (
        <div className="flex items-center justify-between bg-gray-800/50 border border-gray-700 rounded-lg p-3">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <div>
              <span className="text-gray-300">This issue is archived</span>
              {issue.archiveReason && (
                <span className="text-gray-500 ml-2">- {issue.archiveReason}</span>
              )}
              {issue.archivedAt && (
                <span className="text-xs text-gray-500 ml-2">
                  ({new Date(issue.archivedAt).toLocaleDateString()})
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => unarchiveMutation.mutate()}
            disabled={unarchiveMutation.isPending}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {unarchiveMutation.isPending ? "..." : "Unarchive"}
          </button>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-gray-500">
          <Link href="/issues" className="hover:text-white">Issues</Link>
          <span>/</span>
          <span className="text-gray-300">{issue.id}</span>
        </div>
        <div className="flex items-center gap-2">
          {!issue.isArchived && (
            <button
              onClick={() => archiveMutation.mutate(undefined)}
              disabled={archiveMutation.isPending}
              className="text-xs px-3 py-1 bg-gray-800 text-gray-400 rounded hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50"
              title="Archive this issue"
            >
              {archiveMutation.isPending ? "..." : "Archive"}
            </button>
          )}
          {!hasCondensedSummary && (
            <button
              onClick={() => summarizeMutation.mutate()}
              disabled={summarizeMutation.isPending}
              className="text-xs px-3 py-1 bg-gray-800 text-gray-400 rounded hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50"
            >
              {summarizeMutation.isPending ? "Generating..." : "Generate Summary"}
            </button>
          )}
        </div>
      </div>

      {/* Layer 1: Glanceable Header */}
      <div className="border border-gray-800 rounded-lg p-6 bg-gradient-to-r from-gray-900 to-gray-900/50">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            {/* Status + Key Number Row */}
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-xs px-2.5 py-1 rounded border ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
              {issue.keyNumber && (
                <span className="text-sm font-semibold text-white bg-gray-800 px-3 py-1 rounded">
                  {issue.keyNumber}
                </span>
              )}
              {inProgressSolutions.length > 0 && (
                <span className="text-xs text-gray-400">
                  {inProgressSolutions.length} {inProgressSolutions.length === 1 ? "person" : "people"} working
                </span>
              )}
            </div>

            {/* Headline */}
            <h1 className="text-2xl font-bold mb-2">
              {issue.headline || issue.title}
            </h1>

            {/* Why Now */}
            {issue.whyNow && (
              <p className="text-gray-300 text-sm mb-3">
                {issue.whyNow}
              </p>
            )}

            {/* Domains */}
            <div className="flex flex-wrap gap-2">
              {issue.affectedDomains.slice(0, 4).map((domain) => (
                <span key={domain} className="text-xs bg-gray-800/50 px-2 py-0.5 rounded text-gray-400">
                  {domain}
                </span>
              ))}
              {issue.affectedDomains.length > 4 && (
                <span className="text-xs text-gray-500">+{issue.affectedDomains.length - 4}</span>
              )}
            </div>
          </div>

          {/* Right side: Quick Actions */}
          <div className="flex flex-col items-end gap-3">
            {/* Priority indicator */}
            <div className="text-right">
              <div className={`text-3xl font-bold ${
                issue.compositeScore >= 0.7 ? "text-red-400" :
                issue.compositeScore >= 0.4 ? "text-yellow-400" : "text-green-400"
              }`}>
                {(issue.compositeScore * 100).toFixed(0)}
              </div>
              <div className="text-xs text-gray-500">priority</div>
            </div>

            {/* Quick action button */}
            {proposedSolutions.length > 0 && inProgressSolutions.length === 0 && (
              <button
                onClick={() => setActiveTab("actions")}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Take Action
              </button>
            )}
            {inProgressSolutions.length > 0 && (
              <button
                onClick={() => setActiveTab("efforts")}
                className="px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 transition-colors"
              >
                View Progress
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Layer 2: Summary (if no condensed headline, show original summary) */}
      {!issue.headline && (
        <p className="text-gray-400">{issue.summary}</p>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-white hover:border-gray-600"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 text-xs bg-gray-700 px-1.5 py-0.5 rounded">{tab.count}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "problem" && (
          <TheProblemTab issue={issue} brief={brief} situation={situation} />
        )}
        {activeTab === "evidence" && (
          <TheEvidenceTab verifications={verifications} isLoading={verificationsLoading} />
        )}
        {activeTab === "actions" && (
          <WhatCanBeDoneTab
            solutions={proposedSolutions}
            isLoading={solutionsLoading}
            onAssign={(solutionId) => assignMutation.mutate({ solutionId, userId: CURRENT_USER_ID })}
            isAssigning={assignMutation.isPending}
          />
        )}
        {activeTab === "efforts" && (
          <ActiveEffortsTab
            solutions={inProgressSolutions}
            isLoading={solutionsLoading}
            onComplete={(solutionId) => updateStatusMutation.mutate({ solutionId, status: "completed" })}
            isUpdating={updateStatusMutation.isPending}
          />
        )}
        {activeTab === "outcomes" && (
          <OutcomesTab solutions={completedSolutions} isLoading={solutionsLoading} />
        )}
      </div>

      {/* Metadata */}
      <div className="border border-gray-800 rounded-lg p-4">
        <h2 className="font-semibold mb-3">Metadata</h2>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <dt className="text-gray-500">Issue ID</dt>
          <dd className="font-mono">{issue.id}</dd>
          <dt className="text-gray-500">Version</dt>
          <dd>{issue.version}</dd>
          <dt className="text-gray-500">Author</dt>
          <dd className="font-mono">{issue.author}</dd>
          <dt className="text-gray-500">Created</dt>
          <dd>{new Date(issue.createdAt).toLocaleString()}</dd>
        </dl>
      </div>
    </div>
  );
}

/* ==================== The Problem Tab ==================== */

interface IssueDetail {
  id: string;
  title: string;
  summary: string;
  headline?: string | null;
  whyNow?: string | null;
  keyNumber?: string | null;
  simpleStatus?: SimpleStatus | null;
  issueStatus: string;
  compositeScore: number;
  scoreImpact: number;
  scoreUrgency: number;
  scoreTractability: number;
  scoreLegitimacy: number;
  scoreNeglectedness: number;
  affectedDomains: string[];
  timeHorizon: string;
  upstreamIssues: string[];
  downstreamIssues: string[];
  relatedIssues: string[];
  patternIds: string[];
  rootCauses: string[];
  leveragePoints: string[];
  version: number;
  author: string;
  createdAt: string;
  contentHash: string;
  // Archive fields
  isArchived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;
}

interface Brief {
  id: string;
  issueId: string;
  goals: Array<{ description: string; priority: string; successCriteria?: string }>;
  constraints: Array<{ type: string; description: string; hard: boolean; workaround?: string }>;
  uncertainties: Array<{ area: string; description: string; impact: string; resolutionApproach?: string }>;
  actionSpace: Array<{ category: string; actions: string[]; feasibility: string; timeframe: string }>;
  requiredEvidence: Array<{ question: string; evidenceType: string; sources: string[]; priority: string }>;
  version: number;
  author: string;
  createdAt: string;
  contentHash: string;
}

interface SituationModel {
  id: string;
  keyInsights: string[];
  recommendedLeveragePoints: string[];
  systemMap?: {
    actors: Array<{ id: string; name: string; role: string; interests: string[]; influence: number }>;
    relationships: Array<{ from: string; to: string; type: string }>;
    feedbackLoops: Array<{ description: string; reinforcing: boolean; nodes: string[] }>;
  };
}

function TheProblemTab({
  issue,
  brief,
  situation,
}: {
  issue: IssueDetail;
  brief?: Brief | null;
  situation?: SituationModel | null;
}) {
  const [showDeepDive, setShowDeepDive] = useState(false);

  // Create human-readable summary of why this matters
  const urgencyText = issue.scoreUrgency >= 0.7 ? "urgent" : issue.scoreUrgency >= 0.4 ? "moderately urgent" : "not immediately urgent";
  const tractabilityText = issue.scoreTractability >= 0.7 ? "highly tractable" : issue.scoreTractability >= 0.4 ? "moderately tractable" : "difficult to address";
  const neglectednessText = issue.scoreNeglectedness >= 0.7 ? "severely neglected" : issue.scoreNeglectedness >= 0.4 ? "somewhat neglected" : "receiving some attention";

  return (
    <div className="space-y-6">
      {/* Layer 2: Understandable Summary */}
      <div className="border border-gray-800 rounded-lg p-5">
        <h2 className="font-semibold mb-3 text-lg">Why This Matters</h2>
        <p className="text-gray-300 mb-4">
          This issue is <span className="text-white font-medium">{urgencyText}</span>,
          {" "}<span className="text-white font-medium">{tractabilityText}</span>,
          and <span className="text-white font-medium">{neglectednessText}</span>.
        </p>

        {/* Simple visual indicators */}
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${issue.scoreUrgency >= 0.7 ? "bg-red-500" : issue.scoreUrgency >= 0.4 ? "bg-yellow-500" : "bg-green-500"}`} />
            <span className="text-gray-400">Urgency</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${issue.scoreTractability >= 0.7 ? "bg-green-500" : issue.scoreTractability >= 0.4 ? "bg-yellow-500" : "bg-red-500"}`} />
            <span className="text-gray-400">Tractability</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${issue.scoreNeglectedness >= 0.7 ? "bg-red-500" : issue.scoreNeglectedness >= 0.4 ? "bg-yellow-500" : "bg-green-500"}`} />
            <span className="text-gray-400">Neglectedness</span>
          </div>
        </div>
      </div>

      {/* Root Causes */}
      {issue.rootCauses.length > 0 && (
        <div className="border border-red-900/50 rounded-lg p-4">
          <h2 className="font-semibold text-red-300 mb-3">Root Causes</h2>
          <ul className="space-y-2">
            {issue.rootCauses.map((cause, i) => (
              <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-red-400 mt-0.5">•</span>
                {cause}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key Insights from Situation Model */}
      {situation?.keyInsights && situation.keyInsights.length > 0 && (
        <div className="border border-purple-900/50 rounded-lg p-4">
          <h2 className="font-semibold text-purple-300 mb-3">Key Insights</h2>
          <ul className="space-y-2">
            {situation.keyInsights.map((insight, i) => (
              <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-yellow-400 mt-0.5">💡</span>
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Leverage Points */}
      {(issue.leveragePoints.length > 0 || (situation?.recommendedLeveragePoints && situation.recommendedLeveragePoints.length > 0)) && (
        <div className="border border-green-900/50 rounded-lg p-4">
          <h2 className="font-semibold text-green-300 mb-3">Leverage Points</h2>
          <ul className="space-y-2">
            {[...issue.leveragePoints, ...(situation?.recommendedLeveragePoints || [])].map((point, i) => (
              <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-green-400 mt-0.5">📍</span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Layer 3: Deep Dive (Collapsible) */}
      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowDeepDive(!showDeepDive)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-800/30 transition-colors"
        >
          <div>
            <h2 className="font-semibold">Deep Dive</h2>
            <p className="text-sm text-gray-500">Detailed scores, goals, constraints, and related issues</p>
          </div>
          <span className={`text-gray-400 transition-transform ${showDeepDive ? "rotate-180" : ""}`}>
            ▼
          </span>
        </button>

        {showDeepDive && (
          <div className="border-t border-gray-800 p-4 space-y-6 bg-gray-900/30">
            {/* Detailed IUTLN Scores */}
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-3">IUTLN Scores (detailed)</h3>
              <div className="grid grid-cols-5 gap-3">
                <ScoreCard label="Impact" abbr="I" value={issue.scoreImpact} description="Scale and severity of harm" />
                <ScoreCard label="Urgency" abbr="U" value={issue.scoreUrgency} description="Time sensitivity" />
                <ScoreCard label="Tractability" abbr="T" value={issue.scoreTractability} description="Feasibility of progress" />
                <ScoreCard label="Legitimacy" abbr="L" value={issue.scoreLegitimacy} description="Recognition and support" />
                <ScoreCard label="Neglectedness" abbr="N" value={issue.scoreNeglectedness} description="How underserved" />
              </div>
            </div>

            {/* Goals from Brief */}
            {brief?.goals && brief.goals.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3">Goals</h3>
                <div className="space-y-2">
                  {brief.goals.map((goal, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className={`text-xs px-2 py-0.5 rounded mt-0.5 ${
                        goal.priority === "must" ? "bg-red-900/50 text-red-300" :
                        goal.priority === "should" ? "bg-yellow-900/50 text-yellow-300" :
                        "bg-gray-700 text-gray-300"
                      }`}>{goal.priority}</span>
                      <div>
                        <p className="text-gray-200">{goal.description}</p>
                        {goal.successCriteria && (
                          <p className="text-gray-500 text-xs mt-1">Success: {goal.successCriteria}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Constraints from Brief */}
            {brief?.constraints && brief.constraints.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3">Constraints</h3>
                <div className="space-y-2">
                  {brief.constraints.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className={`text-xs px-2 py-0.5 rounded mt-0.5 ${
                        c.hard ? "bg-red-900/50 text-red-300" : "bg-gray-700 text-gray-300"
                      }`}>{c.type}</span>
                      <div className="flex-1">
                        <p className="text-gray-200">{c.description}</p>
                      </div>
                      {c.hard && <span className="text-red-400 text-xs">HARD</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Issues Graph */}
            {(issue.upstreamIssues.length > 0 || issue.downstreamIssues.length > 0 || issue.relatedIssues.length > 0) && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3">Related Issues</h3>
                <IssueRelationshipGraph
                  currentIssueId={issue.id}
                  upstreamIssues={issue.upstreamIssues}
                  downstreamIssues={issue.downstreamIssues}
                  relatedIssues={issue.relatedIssues}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================== The Evidence Tab ==================== */

function TheEvidenceTab({
  verifications,
  isLoading,
}: {
  verifications: Verification[];
  isLoading: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="animate-pulse text-gray-400">Loading evidence...</div>;
  }

  if (verifications.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="mb-2">No evidence verification data yet</p>
        <p className="text-sm">Run the verify pipeline to validate claims against sources</p>
      </div>
    );
  }

  const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    corroborated: { label: "Corroborated", color: "bg-green-900/50 text-green-300", icon: "✓" },
    contested: { label: "Contested", color: "bg-red-900/50 text-red-300", icon: "✗" },
    partially_supported: { label: "Partial", color: "bg-yellow-900/50 text-yellow-300", icon: "⚡" },
    unverified: { label: "Unverified", color: "bg-gray-700 text-gray-300", icon: "?" },
    pending: { label: "Pending", color: "bg-blue-900/50 text-blue-300", icon: "..." },
  };

  // Summary stats
  const corroborated = verifications.filter(v => v.status === "corroborated").length;
  const contested = verifications.filter(v => v.status === "contested").length;
  const partial = verifications.filter(v => v.status === "partially_supported").length;
  const unverified = verifications.filter(v => v.status === "unverified" || v.status === "pending").length;
  const avgConfidence = verifications.length > 0
    ? verifications.reduce((sum, v) => sum + v.adjustedConfidence, 0) / verifications.length
    : 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="border border-gray-800 rounded-lg p-3">
          <div className="text-xl font-bold text-green-400">{corroborated}</div>
          <div className="text-xs text-gray-500">Corroborated</div>
        </div>
        <div className="border border-gray-800 rounded-lg p-3">
          <div className="text-xl font-bold text-yellow-400">{partial}</div>
          <div className="text-xs text-gray-500">Partial</div>
        </div>
        <div className="border border-gray-800 rounded-lg p-3">
          <div className="text-xl font-bold text-red-400">{contested}</div>
          <div className="text-xs text-gray-500">Contested</div>
        </div>
        <div className="border border-gray-800 rounded-lg p-3">
          <div className="text-xl font-bold text-gray-400">{unverified}</div>
          <div className="text-xs text-gray-500">Unverified</div>
        </div>
        <div className="border border-gray-800 rounded-lg p-3">
          <div className="text-xl font-bold">{(avgConfidence * 100).toFixed(0)}%</div>
          <div className="text-xs text-gray-500">Avg Confidence</div>
        </div>
      </div>

      {/* Evidence Cards */}
      {verifications.map((verification) => {
        const isExpanded = expandedId === verification.id;
        const config = statusConfig[verification.status] || statusConfig.pending;
        const confidenceChange = verification.adjustedConfidence - verification.originalConfidence;
        const changeColor = confidenceChange > 0 ? "text-green-400" : confidenceChange < 0 ? "text-red-400" : "text-gray-400";

        return (
          <div key={verification.id} className="border border-gray-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : verification.id)}
              className="w-full p-4 text-left hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <span className={`text-xs px-2 py-1 rounded ${config.color}`}>
                  {config.icon} {config.label}
                </span>
                <span className={`text-sm ${changeColor}`}>
                  {(verification.adjustedConfidence * 100).toFixed(0)}% confidence
                </span>
              </div>
              <p className="text-gray-200 text-sm">{verification.claimStatement}</p>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-800 p-4 space-y-4 bg-gray-900/30">
                {verification.verificationNotes && (
                  <p className="text-sm text-gray-300">{verification.verificationNotes}</p>
                )}

                {verification.sourceAssessments.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Sources ({verification.sourceAssessments.length})</h4>
                    <div className="space-y-2">
                      {verification.sourceAssessments.map((source, i) => (
                        <div key={i} className="bg-gray-800/50 rounded p-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className={`${
                              source.alignment === "supports" ? "text-green-400" :
                              source.alignment === "contradicts" ? "text-red-400" :
                              "text-gray-400"
                            }`}>
                              {source.alignment === "supports" ? "✓" : source.alignment === "contradicts" ? "✗" : "–"} {source.name}
                            </span>
                            <span className="text-xs text-gray-500">{(source.credibility * 100).toFixed(0)}% credible</span>
                          </div>
                          {source.relevantExcerpt && source.relevantExcerpt !== "N/A" && (
                            <p className="text-xs text-gray-400 mt-1 italic">"{source.relevantExcerpt}"</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ==================== What Can Be Done Tab ==================== */

function WhatCanBeDoneTab({
  solutions,
  isLoading,
  onAssign,
  isAssigning,
}: {
  solutions: Solution[];
  isLoading: boolean;
  onAssign: (solutionId: string) => void;
  isAssigning: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="animate-pulse text-gray-400">Loading solutions...</div>;
  }

  if (solutions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="mb-2">No proposed solutions yet</p>
        <p className="text-sm">Run the plan pipeline to generate solution proposals</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {solutions.map((solution) => {
        const isExpanded = expandedId === solution.id;
        const feasibility = solution.feasibilityScore ?? 0;
        const impact = solution.impactScore ?? 0;

        return (
          <div key={solution.id} className="border border-gray-800 rounded-lg overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : solution.id)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-gray-700 px-2 py-0.5 rounded capitalize">
                      {solution.solutionType}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      feasibility >= 0.7 ? "bg-green-900/50 text-green-300" :
                      feasibility >= 0.4 ? "bg-yellow-900/50 text-yellow-300" :
                      "bg-red-900/50 text-red-300"
                    }`}>
                      {(feasibility * 100).toFixed(0)}% feasible
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      impact >= 0.7 ? "bg-green-900/50 text-green-300" :
                      impact >= 0.4 ? "bg-yellow-900/50 text-yellow-300" :
                      "bg-gray-700 text-gray-300"
                    }`}>
                      {(impact * 100).toFixed(0)}% impact
                    </span>
                  </div>
                  <h3 className="font-semibold text-lg">{solution.title}</h3>
                  <p className="text-gray-400 text-sm mt-1 line-clamp-2">{solution.summary}</p>
                </button>

                <button
                  onClick={() => onAssign(solution.id)}
                  disabled={isAssigning}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {isAssigning ? "..." : "I'll work on this"}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-gray-800 p-4 space-y-4 bg-gray-900/30">
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-1">Mechanism</h4>
                  <p className="text-sm text-gray-300">{solution.mechanism}</p>
                </div>

                {solution.targetLeveragePoints && solution.targetLeveragePoints.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Target Leverage Points</h4>
                    <ul className="space-y-1">
                      {solution.targetLeveragePoints.map((lp, i) => (
                        <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                          <span className="text-green-400">•</span> {lp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {solution.components.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Components</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {solution.components.map((comp, i) => (
                        <div key={i} className="bg-gray-800/50 rounded p-2">
                          <span className="text-sm font-medium">{comp.name}</span>
                          <p className="text-xs text-gray-500 mt-1">{comp.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {solution.risks.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Risks</h4>
                    <ul className="space-y-1">
                      {solution.risks.map((risk, i) => (
                        <li key={i} className="text-sm text-gray-300">
                          <span className={risk.impact === "high" ? "text-red-400" : "text-yellow-400"}>⚠</span> {risk.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ==================== Active Efforts Tab ==================== */

function ActiveEffortsTab({
  solutions,
  isLoading,
  onComplete,
  isUpdating,
}: {
  solutions: Solution[];
  isLoading: boolean;
  onComplete: (solutionId: string) => void;
  isUpdating: boolean;
}) {
  if (isLoading) {
    return <div className="animate-pulse text-gray-400">Loading efforts...</div>;
  }

  if (solutions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="mb-2">No active efforts</p>
        <p className="text-sm">Click "I'll work on this" on a solution to start tracking your work</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {solutions.map((solution) => {
        const daysSinceStarted = solution.assignedAt
          ? Math.floor((Date.now() - new Date(solution.assignedAt).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        return (
          <div key={solution.id} className="border border-yellow-900/50 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-yellow-900/50 text-yellow-300 px-2 py-0.5 rounded">
                    In Progress
                  </span>
                  <span className="text-xs bg-gray-700 px-2 py-0.5 rounded capitalize">
                    {solution.solutionType}
                  </span>
                  {solution.assignedTo && (
                    <span className="text-xs text-gray-500">
                      Assigned to: {solution.assignedTo}
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-lg">{solution.title}</h3>
                <p className="text-gray-400 text-sm mt-1">{solution.summary}</p>
                {daysSinceStarted !== null && (
                  <p className="text-xs text-gray-500 mt-2">
                    Started {daysSinceStarted === 0 ? "today" : daysSinceStarted === 1 ? "yesterday" : `${daysSinceStarted} days ago`}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => onComplete(solution.id)}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isUpdating ? "..." : "Mark Complete"}
                </button>
                <Link
                  href={`/my-work`}
                  className="px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors text-center"
                >
                  Update Progress
                </Link>
              </div>
            </div>

            {/* Execution Plan Preview */}
            {solution.executionPlan && solution.executionPlan.steps.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-800">
                <h4 className="text-sm font-medium text-gray-400 mb-2">Execution Plan</h4>
                <div className="flex gap-2 overflow-x-auto">
                  {solution.executionPlan.steps.map((step, i) => (
                    <div key={i} className="flex-shrink-0 bg-gray-800/50 rounded p-2 text-xs">
                      <span className="text-blue-400">Phase {step.phase}:</span> {step.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ==================== Outcomes Tab ==================== */

interface OutcomeModalState {
  isOpen: boolean;
  solutionId: string;
  solutionTitle: string;
}

function OutcomesTab({
  solutions,
  isLoading,
}: {
  solutions: Solution[];
  isLoading: boolean;
}) {
  const [modalState, setModalState] = useState<OutcomeModalState>({
    isOpen: false,
    solutionId: "",
    solutionTitle: "",
  });

  const openModal = (solutionId: string, solutionTitle: string) => {
    setModalState({ isOpen: true, solutionId, solutionTitle });
  };

  const closeModal = () => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  };

  if (isLoading) {
    return <div className="animate-pulse text-gray-400">Loading outcomes...</div>;
  }

  if (solutions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="mb-2">No completed solutions yet</p>
        <p className="text-sm">Complete a solution to see outcomes and effectiveness metrics</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {solutions.map((solution) => (
        <OutcomeSolutionCard
          key={solution.id}
          solution={solution}
          onRecordOutcome={() => openModal(solution.id, solution.title)}
        />
      ))}

      <OutcomeRecordingModal
        solutionId={modalState.solutionId}
        solutionTitle={modalState.solutionTitle}
        isOpen={modalState.isOpen}
        onClose={closeModal}
        defaultType="metric_measurement"
      />
    </div>
  );
}

function OutcomeSolutionCard({
  solution,
  onRecordOutcome,
}: {
  solution: Solution;
  onRecordOutcome: () => void;
}) {
  const { data: effectivenessData, isLoading } = useQuery({
    queryKey: ["solution-effectiveness", solution.id],
    queryFn: async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4921"}/solutions/${solution.id}/effectiveness`);
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
  });

  const { data: outcomesData } = useQuery({
    queryKey: ["solution-outcomes", solution.id],
    queryFn: () => api.getSolutionOutcomes(solution.id).catch(() => ({ data: [], meta: { total: 0, limit: 20, offset: 0 } })),
  });

  const effectiveness = effectivenessData?.data;
  const outcomes = outcomesData?.data ?? [];
  const effectivenessScore = effectiveness?.overallEffectivenessScore !== null && effectiveness?.overallEffectivenessScore !== undefined
    ? Math.round(effectiveness.overallEffectivenessScore * 100)
    : null;

  return (
    <div className="border border-green-900/50 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs bg-green-900/50 text-green-300 px-2 py-0.5 rounded">
              Completed
            </span>
            <span className="text-xs bg-gray-700 px-2 py-0.5 rounded capitalize">
              {solution.solutionType}
            </span>
          </div>
          <h3 className="font-semibold text-lg">{solution.title}</h3>
          <p className="text-gray-400 text-sm mt-1">{solution.summary}</p>
        </div>

        <div className="flex items-center gap-4">
          {isLoading ? (
            <div className="animate-pulse bg-gray-800 rounded-lg p-4 w-24 h-16" />
          ) : effectivenessScore !== null ? (
            <div className="text-right">
              <div className={`text-3xl font-bold ${
                effectivenessScore >= 70 ? "text-green-400" :
                effectivenessScore >= 40 ? "text-yellow-400" : "text-red-400"
              }`}>
                {effectivenessScore}%
              </div>
              <div className="text-xs text-gray-500">effectiveness</div>
            </div>
          ) : (
            <div className="text-xs text-gray-500">No metrics</div>
          )}
          <button
            onClick={onRecordOutcome}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            Record Outcome
          </button>
        </div>
      </div>

      {effectiveness && (
        <div className="mt-4 pt-4 border-t border-gray-800 grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-lg font-bold text-green-400">{effectiveness.metricsAchieved ?? 0}</div>
            <div className="text-xs text-gray-500">Achieved</div>
          </div>
          <div>
            <div className="text-lg font-bold text-yellow-400">{effectiveness.metricsPartial ?? 0}</div>
            <div className="text-xs text-gray-500">Partial</div>
          </div>
          <div>
            <div className="text-lg font-bold text-red-400">{effectiveness.metricsMissed ?? 0}</div>
            <div className="text-xs text-gray-500">Missed</div>
          </div>
          <div>
            <div className={`text-lg font-bold ${
              (effectiveness.impactVariance ?? 0) > 0 ? "text-green-400" :
              (effectiveness.impactVariance ?? 0) < 0 ? "text-red-400" : "text-gray-400"
            }`}>
              {effectiveness.impactVariance !== null
                ? `${effectiveness.impactVariance > 0 ? "+" : ""}${(effectiveness.impactVariance * 100).toFixed(0)}%`
                : "—"
              }
            </div>
            <div className="text-xs text-gray-500">vs Estimate</div>
          </div>
        </div>
      )}

      {/* Recorded Outcomes */}
      {outcomes.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <h4 className="text-sm font-medium text-gray-400 mb-2">Recorded Outcomes ({outcomes.length})</h4>
          <div className="space-y-2">
            {outcomes.slice(0, 3).map((outcome) => (
              <OutcomeRow key={outcome.id} outcome={outcome} />
            ))}
            {outcomes.length > 3 && (
              <p className="text-xs text-gray-500">+{outcomes.length - 3} more outcomes</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OutcomeRow({ outcome }: { outcome: Outcome }) {
  const typeLabels: Record<string, string> = {
    metric_measurement: "Metric",
    status_change: "Status",
    feedback: "Feedback",
    milestone: "Milestone",
  };

  const typeColors: Record<string, string> = {
    metric_measurement: "bg-blue-900/50 text-blue-300",
    status_change: "bg-yellow-900/50 text-yellow-300",
    feedback: "bg-purple-900/50 text-purple-300",
    milestone: "bg-green-900/50 text-green-300",
  };

  return (
    <div className="flex items-start gap-3 text-sm bg-gray-800/30 rounded p-2">
      <span className={`text-xs px-2 py-0.5 rounded ${typeColors[outcome.outcomeType] || "bg-gray-700 text-gray-300"}`}>
        {typeLabels[outcome.outcomeType] || outcome.outcomeType}
      </span>
      <div className="flex-1 min-w-0">
        {outcome.outcomeType === "metric_measurement" && outcome.metricName && (
          <div className="text-gray-200">
            <span className="font-medium">{outcome.metricName}:</span>{" "}
            {outcome.metricValue}
            {outcome.metricTarget && <span className="text-gray-500"> / {outcome.metricTarget} target</span>}
          </div>
        )}
        {outcome.outcomeType === "feedback" && outcome.feedbackText && (
          <div className="text-gray-200">{outcome.feedbackText}</div>
        )}
        {outcome.notes && (
          <div className="text-gray-400 text-xs mt-1">{outcome.notes}</div>
        )}
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">
        {new Date(outcome.createdAt).toLocaleDateString()}
      </span>
    </div>
  );
}

/* ==================== Shared Components ==================== */

function ScoreCard({
  label,
  abbr,
  value,
  description,
}: {
  label: string;
  abbr: string;
  value: number;
  description: string;
}) {
  const color = value >= 0.7 ? "text-red-400" : value >= 0.4 ? "text-yellow-400" : "text-green-400";
  const bgColor = value >= 0.7 ? "bg-red-900/20" : value >= 0.4 ? "bg-yellow-900/20" : "bg-green-900/20";

  return (
    <div className={`rounded-lg p-3 ${bgColor}`} title={description}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{(value * 100).toFixed(0)}%</div>
    </div>
  );
}
