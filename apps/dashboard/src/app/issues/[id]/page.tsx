"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, type Solution, type Verification } from "@/lib/api";
import { IssueRelationshipGraph } from "@/components/issue-relationship-graph";

type Tab = "overview" | "brief" | "situation" | "solutions" | "verifications";

export default function IssueDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const { data, isLoading, error } = useQuery({
    queryKey: ["issue", id],
    queryFn: () => api.getIssue(id),
  });

  const { data: briefData, isLoading: briefLoading } = useQuery({
    queryKey: ["brief-by-issue", id],
    queryFn: () => api.getBriefByIssue(id).catch(() => null),
    enabled: !!id,
  });

  const briefId = briefData?.data?.id;
  const { data: situationData, isLoading: situationLoading } = useQuery({
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

  const tabs: { id: Tab; label: string; available: boolean; count?: number }[] = [
    { id: "overview", label: "Overview", available: true },
    { id: "brief", label: "Problem Brief", available: !!brief },
    { id: "situation", label: "Situation Model", available: !!situation },
    { id: "solutions", label: "Solutions", available: solutions.length > 0, count: solutions.length },
    { id: "verifications", label: "Verifications", available: verifications.length > 0, count: verifications.length },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/issues" className="hover:text-white">Issues</Link>
        <span>/</span>
        <span className="text-gray-300">{issue.id}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-xs px-2 py-1 rounded ${statusColors[issue.issueStatus] || statusColors.identified}`}>
              {issue.issueStatus.replace("_", " ")}
            </span>
            <span className="text-xs text-gray-500">{issue.timeHorizon}</span>
            {brief && (
              <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-1 rounded">
                Has Brief
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold">{issue.title}</h1>
        </div>
        <div className={`text-3xl font-bold ${scoreColor(issue.compositeScore)}`}>
          {(issue.compositeScore * 100).toFixed(0)}
        </div>
      </div>

      <p className="text-gray-400">{issue.summary}</p>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => tab.available && setActiveTab(tab.id)}
              disabled={!tab.available}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400"
                  : tab.available
                  ? "border-transparent text-gray-400 hover:text-white hover:border-gray-600"
                  : "border-transparent text-gray-600 cursor-not-allowed"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 text-xs bg-gray-700 px-1.5 py-0.5 rounded">{tab.count}</span>
              )}
              {!tab.available && tab.id !== "overview" && (
                <span className="ml-2 text-xs text-gray-600">(not generated)</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "overview" && (
          <OverviewTab issue={issue} scoreColor={scoreColor} />
        )}
        {activeTab === "brief" && brief && (
          <BriefTab brief={brief} isLoading={briefLoading} />
        )}
        {activeTab === "situation" && situation && (
          <SituationTab situation={situation} isLoading={situationLoading} />
        )}
        {activeTab === "solutions" && solutions.length > 0 && (
          <SolutionsTab solutions={solutions} isLoading={solutionsLoading} />
        )}
        {activeTab === "verifications" && verifications.length > 0 && (
          <VerificationsTab verifications={verifications} isLoading={verificationsLoading} />
        )}
      </div>

      {/* Metadata - always visible */}
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
          {brief && (
            <>
              <dt className="text-gray-500">Brief ID</dt>
              <dd className="font-mono">{brief.id}</dd>
              <dt className="text-gray-500">Brief Version</dt>
              <dd>{brief.version}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}

/* ==================== Overview Tab ==================== */

interface Issue {
  id: string;
  title: string;
  summary: string;
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
}

function OverviewTab({ issue, scoreColor }: { issue: Issue; scoreColor: (score: number) => string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* IUTLN Scores */}
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-1">IUTLN Scores</h2>
          <p className="text-xs text-gray-500 mb-3">Hover over each score for interpretation.</p>
          <div className="space-y-3">
            <ScoreRow label="Impact" value={issue.scoreImpact} />
            <ScoreRow label="Urgency" value={issue.scoreUrgency} />
            <ScoreRow label="Tractability" value={issue.scoreTractability} />
            <ScoreRow label="Legitimacy" value={issue.scoreLegitimacy} />
            <ScoreRow label="Neglectedness" value={issue.scoreNeglectedness} />
          </div>
          <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
            <span className="text-green-400">0-40%</span> Low &middot;{" "}
            <span className="text-yellow-400">40-70%</span> Medium &middot;{" "}
            <span className="text-red-400">70-100%</span> High
          </div>
        </div>

        {/* Domains & Relationships */}
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Domains</h2>
          <div className="flex flex-wrap gap-2">
            {issue.affectedDomains.map((domain) => (
              <span key={domain} className="text-sm bg-gray-800 px-2 py-1 rounded">
                {domain}
              </span>
            ))}
          </div>

          <h2 className="font-semibold mt-4 mb-3">Related Issues</h2>
          <div className="space-y-2 text-sm">
            {issue.upstreamIssues.length > 0 && (
              <div>
                <span className="text-gray-500">Upstream:</span>{" "}
                {issue.upstreamIssues.map((id, i) => (
                  <span key={id}>
                    <Link href={`/issues/${id}`} className="text-blue-400 hover:underline">{id}</Link>
                    {i < issue.upstreamIssues.length - 1 && ", "}
                  </span>
                ))}
              </div>
            )}
            {issue.downstreamIssues.length > 0 && (
              <div>
                <span className="text-gray-500">Downstream:</span>{" "}
                {issue.downstreamIssues.map((id, i) => (
                  <span key={id}>
                    <Link href={`/issues/${id}`} className="text-blue-400 hover:underline">{id}</Link>
                    {i < issue.downstreamIssues.length - 1 && ", "}
                  </span>
                ))}
              </div>
            )}
            {issue.upstreamIssues.length === 0 && issue.downstreamIssues.length === 0 && (
              <span className="text-gray-500">No related issues</span>
            )}
          </div>

          <h2 className="font-semibold mt-4 mb-2">Linked Patterns</h2>
          <div className="text-sm text-gray-400">
            {issue.patternIds.length} pattern{issue.patternIds.length !== 1 && "s"}
          </div>
        </div>
      </div>

      {/* Root Causes */}
      {issue.rootCauses.length > 0 && (
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Root Causes</h2>
          <ul className="space-y-1">
            {issue.rootCauses.map((cause, i) => (
              <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-red-400">•</span>
                {cause}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Leverage Points */}
      {issue.leveragePoints.length > 0 && (
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Leverage Points</h2>
          <ul className="space-y-1">
            {issue.leveragePoints.map((point, i) => (
              <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-green-400">•</span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Issue Relationship Graph */}
      {(issue.upstreamIssues.length > 0 || issue.downstreamIssues.length > 0 || issue.relatedIssues.length > 0) && (
        <IssueRelationshipGraph
          currentIssueId={issue.id}
          upstreamIssues={issue.upstreamIssues}
          downstreamIssues={issue.downstreamIssues}
          relatedIssues={issue.relatedIssues}
        />
      )}
    </div>
  );
}

/* ==================== Brief Tab ==================== */

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

function BriefTab({ brief, isLoading }: { brief: Brief; isLoading: boolean }) {
  if (isLoading) {
    return <div className="animate-pulse text-gray-400">Loading brief...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Goals */}
      <div className="border border-gray-800 rounded-lg p-4">
        <h2 className="font-semibold mb-3">Goals ({brief.goals.length})</h2>
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

      {/* Constraints */}
      <div className="border border-gray-800 rounded-lg p-4">
        <h2 className="font-semibold mb-3">Constraints ({brief.constraints.length})</h2>
        <div className="space-y-2">
          {brief.constraints.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className={`text-xs px-2 py-0.5 rounded mt-0.5 ${
                c.hard ? "bg-red-900/50 text-red-300" : "bg-gray-700 text-gray-300"
              }`}>{c.type}</span>
              <div className="flex-1">
                <p className="text-gray-200">{c.description}</p>
                {c.workaround && (
                  <p className="text-gray-500 text-xs mt-1">Workaround: {c.workaround}</p>
                )}
              </div>
              {c.hard && <span className="text-red-400 text-xs">HARD</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Uncertainties */}
      {brief.uncertainties.length > 0 && (
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Uncertainties ({brief.uncertainties.length})</h2>
          <div className="space-y-3">
            {brief.uncertainties.map((u, i) => (
              <div key={i} className="bg-gray-800/30 rounded p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{u.area}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    u.impact === "high" ? "bg-red-900/50 text-red-300" :
                    u.impact === "medium" ? "bg-yellow-900/50 text-yellow-300" :
                    "bg-gray-700 text-gray-300"
                  }`}>{u.impact} impact</span>
                </div>
                <p className="text-sm text-gray-400">{u.description}</p>
                {u.resolutionApproach && (
                  <p className="text-xs text-gray-500 mt-2">Resolution: {u.resolutionApproach}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Space */}
      <div className="border border-gray-800 rounded-lg p-4">
        <h2 className="font-semibold mb-3">Action Space ({brief.actionSpace.length} categories)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {brief.actionSpace.map((action, i) => (
            <div key={i} className="bg-gray-800/30 rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{action.category}</span>
                <div className="flex gap-2 text-xs">
                  <span className={`px-1.5 py-0.5 rounded ${
                    action.feasibility === "high" ? "bg-green-900/50 text-green-300" :
                    action.feasibility === "medium" ? "bg-yellow-900/50 text-yellow-300" :
                    "bg-red-900/50 text-red-300"
                  }`}>{action.feasibility}</span>
                  <span className="text-gray-500">{action.timeframe}</span>
                </div>
              </div>
              <ul className="text-xs text-gray-400 space-y-1">
                {action.actions.slice(0, 4).map((a, j) => (
                  <li key={j}>• {a}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Required Evidence */}
      {brief.requiredEvidence.length > 0 && (
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Required Evidence ({brief.requiredEvidence.length})</h2>
          <div className="space-y-2">
            {brief.requiredEvidence.map((ev, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className={`text-xs px-2 py-0.5 rounded mt-0.5 ${
                  ev.priority === "critical" ? "bg-red-900/50 text-red-300" :
                  ev.priority === "important" ? "bg-yellow-900/50 text-yellow-300" :
                  "bg-gray-700 text-gray-300"
                }`}>{ev.priority}</span>
                <div>
                  <p className="text-gray-200">{ev.question}</p>
                  <p className="text-gray-500 text-xs mt-1">
                    Type: {ev.evidenceType} | Sources: {ev.sources.join(", ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== Situation Tab ==================== */

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

function SituationTab({ situation, isLoading }: { situation: SituationModel; isLoading: boolean }) {
  if (isLoading) {
    return <div className="animate-pulse text-gray-400">Loading situation model...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Key Insights */}
      {situation.keyInsights.length > 0 && (
        <div className="border border-purple-800/50 rounded-lg p-4">
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
      {situation.recommendedLeveragePoints.length > 0 && (
        <div className="border border-green-800/50 rounded-lg p-4">
          <h2 className="font-semibold text-green-300 mb-3">Recommended Leverage Points</h2>
          <ul className="space-y-2">
            {situation.recommendedLeveragePoints.map((lp, i) => (
              <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-green-400 mt-0.5">📍</span>
                {lp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* System Map */}
      {situation.systemMap && (
        <>
          {/* Actors */}
          {situation.systemMap.actors.length > 0 && (
            <div className="border border-gray-800 rounded-lg p-4">
              <h2 className="font-semibold mb-3">System Actors ({situation.systemMap.actors.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {situation.systemMap.actors.map((actor, i) => (
                  <div key={i} className="bg-gray-800/30 rounded p-2 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{actor.name}</span>
                      <span className="text-xs text-gray-500 ml-2">{actor.role}</span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      actor.influence >= 0.7 ? "bg-red-900/50 text-red-300" :
                      actor.influence >= 0.4 ? "bg-yellow-900/50 text-yellow-300" :
                      "bg-gray-700 text-gray-300"
                    }`}>{(actor.influence * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feedback Loops */}
          {situation.systemMap.feedbackLoops.length > 0 && (
            <div className="border border-gray-800 rounded-lg p-4">
              <h2 className="font-semibold mb-3">Feedback Loops ({situation.systemMap.feedbackLoops.length})</h2>
              <div className="space-y-3">
                {situation.systemMap.feedbackLoops.map((loop, i) => (
                  <div key={i} className="bg-gray-800/30 rounded p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        loop.reinforcing ? "bg-red-900/50 text-red-300" :
                        "bg-blue-900/50 text-blue-300"
                      }`}>{loop.reinforcing ? "reinforcing" : "balancing"}</span>
                      {loop.nodes && loop.nodes.length > 0 && (
                        <span className="text-xs text-gray-500">{loop.nodes.join(" → ")}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">{loop.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ==================== Solutions Tab ==================== */

function SolutionsTab({ solutions, isLoading }: { solutions: Solution[]; isLoading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="animate-pulse text-gray-400">Loading solutions...</div>;
  }

  const statusColors: Record<string, string> = {
    proposed: "bg-gray-700 text-gray-300",
    approved: "bg-blue-900/50 text-blue-300",
    in_progress: "bg-yellow-900/50 text-yellow-300",
    completed: "bg-green-900/50 text-green-300",
    abandoned: "bg-red-900/50 text-red-300",
  };

  const typeColors: Record<string, string> = {
    tool: "bg-cyan-900/50 text-cyan-300",
    platform: "bg-purple-900/50 text-purple-300",
    system: "bg-indigo-900/50 text-indigo-300",
    automation: "bg-orange-900/50 text-orange-300",
    research: "bg-emerald-900/50 text-emerald-300",
    model: "bg-pink-900/50 text-pink-300",
    policy: "bg-amber-900/50 text-amber-300",
    other: "bg-gray-700 text-gray-300",
  };

  return (
    <div className="space-y-4">
      {solutions.map((solution, idx) => {
        const isExpanded = expandedId === solution.id;
        const feasibility = solution.feasibilityScore ?? 0;
        const impact = solution.impactScore ?? 0;
        const confidence = solution.confidence ?? 0;

        return (
          <div key={solution.id} className="border border-gray-800 rounded-lg overflow-hidden">
            {/* Solution Header - Always Visible */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : solution.id)}
              className="w-full p-4 text-left hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-medium text-gray-500">#{idx + 1}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${typeColors[solution.solutionType] || typeColors.other}`}>
                    {solution.solutionType}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${statusColors[solution.solutionStatus] || statusColors.proposed}`}>
                    {solution.solutionStatus}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-500">
                    F: <span className={feasibility >= 0.7 ? "text-green-400" : feasibility >= 0.4 ? "text-yellow-400" : "text-red-400"}>
                      {(feasibility * 100).toFixed(0)}%
                    </span>
                  </span>
                  <span className="text-gray-500">
                    I: <span className={impact >= 0.7 ? "text-green-400" : impact >= 0.4 ? "text-yellow-400" : "text-red-400"}>
                      {(impact * 100).toFixed(0)}%
                    </span>
                  </span>
                  <span className="text-gray-500">
                    C: <span className={confidence >= 0.7 ? "text-green-400" : confidence >= 0.4 ? "text-yellow-400" : "text-red-400"}>
                      {(confidence * 100).toFixed(0)}%
                    </span>
                  </span>
                  <span className="text-gray-600">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>
              <h3 className="font-semibold text-lg">{solution.title}</h3>
              <p className="text-gray-400 text-sm mt-1 line-clamp-2">{solution.summary}</p>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t border-gray-800 p-4 space-y-4 bg-gray-900/30">
                {/* Mechanism */}
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-1">Mechanism</h4>
                  <p className="text-sm text-gray-300">{solution.mechanism}</p>
                </div>

                {/* Leverage Points */}
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

                {/* Components */}
                {solution.components.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Components ({solution.components.length})</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {solution.components.map((comp, i) => (
                        <div key={i} className="bg-gray-800/50 rounded p-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{comp.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              comp.complexity === "high" ? "bg-red-900/50 text-red-300" :
                              comp.complexity === "medium" ? "bg-yellow-900/50 text-yellow-300" :
                              "bg-green-900/50 text-green-300"
                            }`}>{comp.complexity}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{comp.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Execution Plan */}
                {solution.executionPlan && solution.executionPlan.steps.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Execution Plan ({solution.executionPlan.totalPhases} phases)</h4>
                    <div className="space-y-2">
                      {solution.executionPlan.steps.map((step, i) => (
                        <div key={i} className="bg-gray-800/50 rounded p-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded">Phase {step.phase}</span>
                            <span className="text-sm font-medium">{step.name}</span>
                          </div>
                          <p className="text-xs text-gray-500">{step.description}</p>
                          {step.deliverables.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {step.deliverables.map((d, j) => (
                                <span key={j} className="text-xs bg-gray-700 px-1.5 py-0.5 rounded">{d}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risks */}
                {solution.risks.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Risks ({solution.risks.length})</h4>
                    <div className="space-y-2">
                      {solution.risks.map((risk, i) => (
                        <div key={i} className="bg-gray-800/50 rounded p-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              risk.impact === "high" ? "bg-red-900/50 text-red-300" :
                              risk.impact === "medium" ? "bg-yellow-900/50 text-yellow-300" :
                              "bg-green-900/50 text-green-300"
                            }`}>{risk.impact} impact</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              risk.likelihood === "high" ? "bg-red-900/50 text-red-300" :
                              risk.likelihood === "medium" ? "bg-yellow-900/50 text-yellow-300" :
                              "bg-green-900/50 text-green-300"
                            }`}>{risk.likelihood} likelihood</span>
                          </div>
                          <p className="text-xs text-gray-300">{risk.description}</p>
                          {risk.mitigation && (
                            <p className="text-xs text-gray-500 mt-1">Mitigation: {risk.mitigation}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Success Metrics */}
                {solution.successMetrics && solution.successMetrics.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Success Metrics</h4>
                    <div className="space-y-1">
                      {solution.successMetrics.map((m, i) => (
                        <div key={i} className="text-sm">
                          <span className="text-gray-300">{m.metric}</span>
                          <span className="text-gray-500"> → </span>
                          <span className="text-green-400">{m.target}</span>
                          <span className="text-gray-600 text-xs ml-2">({m.measurementMethod})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Estimated Impact */}
                {solution.estimatedImpact && (
                  <div className="flex gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Scope: </span>
                      <span className="text-gray-300">{solution.estimatedImpact.scope}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Magnitude: </span>
                      <span className="text-gray-300">{solution.estimatedImpact.magnitude}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Time to Impact: </span>
                      <span className="text-gray-300">{solution.estimatedImpact.timeToImpact}</span>
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="pt-2 border-t border-gray-800 text-xs text-gray-500">
                  ID: {solution.id} | Created: {new Date(solution.createdAt).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ==================== Verifications Tab ==================== */

function VerificationsTab({ verifications, isLoading }: { verifications: Verification[]; isLoading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="animate-pulse text-gray-400">Loading verifications...</div>;
  }

  const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    corroborated: { label: "Corroborated", color: "bg-green-900/50 text-green-300", icon: "✓" },
    contested: { label: "Contested", color: "bg-red-900/50 text-red-300", icon: "✗" },
    partially_supported: { label: "Partial", color: "bg-yellow-900/50 text-yellow-300", icon: "⚡" },
    unverified: { label: "Unverified", color: "bg-gray-700 text-gray-300", icon: "?" },
    pending: { label: "Pending", color: "bg-blue-900/50 text-blue-300", icon: "..." },
  };

  const categoryLabels: Record<string, string> = {
    factual: "Factual",
    statistical: "Statistical",
    causal: "Causal",
    predictive: "Predictive",
    definitional: "Definitional",
  };

  // Summary stats
  const corroborated = verifications.filter(v => v.status === "corroborated").length;
  const contested = verifications.filter(v => v.status === "contested").length;
  const partial = verifications.filter(v => v.status === "partially_supported").length;
  const unverified = verifications.filter(v => v.status === "unverified" || v.status === "pending").length;
  const avgConfidence = verifications.reduce((sum, v) => sum + v.adjustedConfidence, 0) / verifications.length;

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

      {/* Verification Cards */}
      {verifications.map((verification) => {
        const isExpanded = expandedId === verification.id;
        const config = statusConfig[verification.status] || statusConfig.pending;
        const confidenceChange = verification.adjustedConfidence - verification.originalConfidence;
        const changeIcon = confidenceChange > 0 ? "↑" : confidenceChange < 0 ? "↓" : "→";
        const changeColor = confidenceChange > 0 ? "text-green-400" : confidenceChange < 0 ? "text-red-400" : "text-gray-400";

        return (
          <div key={verification.id} className="border border-gray-800 rounded-lg overflow-hidden">
            {/* Header - Always Visible */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : verification.id)}
              className="w-full p-4 text-left hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${config.color}`}>
                    {config.icon} {config.label}
                  </span>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
                    {categoryLabels[verification.claimCategory] || verification.claimCategory}
                  </span>
                  <span className="text-xs text-gray-600">
                    {verification.sourceType}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${changeColor}`}>
                    {(verification.originalConfidence * 100).toFixed(0)}% {changeIcon} {(verification.adjustedConfidence * 100).toFixed(0)}%
                  </span>
                  <span className="text-gray-600">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>
              <p className="text-gray-200 text-sm">{verification.claimStatement}</p>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t border-gray-800 p-4 space-y-4 bg-gray-900/30">
                {/* Verification Notes */}
                {verification.verificationNotes && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-1">Verification Notes</h4>
                    <p className="text-sm text-gray-300">{verification.verificationNotes}</p>
                  </div>
                )}

                {/* Source Assessments */}
                {verification.sourceAssessments.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">
                      Source Assessments ({verification.sourceAssessments.length})
                    </h4>
                    <div className="space-y-2">
                      {verification.sourceAssessments.map((source, i) => {
                        const alignmentColors: Record<string, string> = {
                          supports: "text-green-400",
                          contradicts: "text-red-400",
                          neutral: "text-gray-400",
                          partially_supports: "text-yellow-400",
                        };
                        const alignmentIcons: Record<string, string> = {
                          supports: "✓",
                          contradicts: "✗",
                          neutral: "–",
                          partially_supports: "⚡",
                        };

                        return (
                          <div key={i} className="bg-gray-800/50 rounded p-3">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className={`${alignmentColors[source.alignment]}`}>
                                  {alignmentIcons[source.alignment]}
                                </span>
                                <span className="text-sm font-medium">{source.name}</span>
                                {source.relevance !== "none" && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    source.relevance === "high" ? "bg-green-900/50 text-green-300" :
                                    source.relevance === "medium" ? "bg-yellow-900/50 text-yellow-300" :
                                    "bg-gray-700 text-gray-300"
                                  }`}>{source.relevance}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>Credibility: {(source.credibility * 100).toFixed(0)}%</span>
                                <span>Confidence: {(source.confidence * 100).toFixed(0)}%</span>
                              </div>
                            </div>
                            {source.relevantExcerpt && source.relevantExcerpt !== "N/A" && (
                              <p className="text-xs text-gray-400 mt-2 italic">"{source.relevantExcerpt}"</p>
                            )}
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:underline mt-1 inline-block"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {source.url}
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Conflicts */}
                {verification.conflicts.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-red-400 mb-2">
                      Conflicts ({verification.conflicts.length})
                    </h4>
                    <div className="space-y-2">
                      {verification.conflicts.map((conflict, i) => (
                        <div key={i} className="bg-red-900/20 border border-red-800/50 rounded p-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              conflict.severity === "major" ? "bg-red-900/50 text-red-300" :
                              conflict.severity === "moderate" ? "bg-yellow-900/50 text-yellow-300" :
                              "bg-gray-700 text-gray-300"
                            }`}>{conflict.severity}</span>
                          </div>
                          <p className="text-xs text-gray-300">{conflict.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="flex gap-4 text-xs text-gray-500 pt-2 border-t border-gray-800">
                  <span>{verification.corroboratingSourcesCount} supporting</span>
                  <span>{verification.conflictingSourcesCount} conflicting</span>
                  <span>Verified: {new Date(verification.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ==================== Shared Components ==================== */

const SCORE_INFO: Record<string, { abbr: string; description: string; highMeans: string }> = {
  Impact: {
    abbr: "I",
    description: "Scale and severity of harm",
    highMeans: "Affects many people or causes severe harm",
  },
  Urgency: {
    abbr: "U",
    description: "Time sensitivity",
    highMeans: "Getting worse quickly, needs immediate action",
  },
  Tractability: {
    abbr: "T",
    description: "Feasibility of progress",
    highMeans: "Clear path to improvement exists",
  },
  Legitimacy: {
    abbr: "L",
    description: "Recognition and support",
    highMeans: "Widely recognized, has stakeholder buy-in",
  },
  Neglectedness: {
    abbr: "N",
    description: "How underserved by existing efforts",
    highMeans: "Few others working on it, high marginal value",
  },
};

function ScoreRow({ label, value }: { label: string; value: number }) {
  const color = value >= 0.7 ? "bg-red-500" : value >= 0.4 ? "bg-yellow-500" : "bg-green-500";
  const textColor = value >= 0.7 ? "text-red-400" : value >= 0.4 ? "text-yellow-400" : "text-green-400";
  const info = SCORE_INFO[label];

  return (
    <div className="group">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400 w-28 flex items-center gap-1">
          {info && <span className="text-xs text-gray-600">{info.abbr}</span>}
          {label}
        </span>
        <div className="flex-1 h-2 bg-gray-800 rounded overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${value * 100}%` }} />
        </div>
        <span className={`text-sm w-12 text-right font-medium ${textColor}`}>{(value * 100).toFixed(0)}%</span>
      </div>
      {info && (
        <div className="hidden group-hover:block ml-8 mt-1 text-xs text-gray-500">
          {info.description}. <span className="text-gray-600">High = {info.highMeans}</span>
        </div>
      )}
    </div>
  );
}
