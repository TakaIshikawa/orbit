"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api, type Solution, type MyWork, type Outcome } from "@/lib/api";
import { OutcomeRecordingModal } from "@/components/outcome-recording-modal";

// Placeholder user ID - in production this would come from auth
const CURRENT_USER_ID = "user_default";

type Tab = "in_progress" | "completed" | "watching";

interface ModalState {
  isOpen: boolean;
  solutionId: string;
  solutionTitle: string;
  defaultType: "metric_measurement" | "status_change" | "feedback" | "milestone";
}

export default function MyWorkPage() {
  const [activeTab, setActiveTab] = useState<Tab>("in_progress");
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    solutionId: "",
    solutionTitle: "",
    defaultType: "metric_measurement",
  });
  const queryClient = useQueryClient();

  const { data: myWorkData, isLoading } = useQuery({
    queryKey: ["myWork", CURRENT_USER_ID],
    queryFn: () => api.getMyWork(CURRENT_USER_ID),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ solutionId, status }: { solutionId: string; status: "proposed" | "approved" | "in_progress" | "completed" | "abandoned" }) =>
      api.updateSolutionStatus(solutionId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myWork", CURRENT_USER_ID] });
      queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (solutionId: string) => api.unassignSolution(solutionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myWork", CURRENT_USER_ID] });
      queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
    },
  });

  const myWork = myWorkData?.data;

  // Calculate impact summary
  const impactSummary = calculateImpactSummary(myWork);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "in_progress", label: "In Progress", count: myWork?.totalInProgress },
    { id: "completed", label: "Completed", count: myWork?.totalCompleted },
    { id: "watching", label: "Watching", count: 0 },
  ];

  const openRecordModal = (
    solutionId: string,
    solutionTitle: string,
    defaultType: ModalState["defaultType"]
  ) => {
    setModalState({
      isOpen: true,
      solutionId,
      solutionTitle,
      defaultType,
    });
  };

  const closeModal = () => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-800 rounded w-48 mb-4" />
          <div className="h-4 bg-gray-800 rounded w-96" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-gray-800 rounded-lg p-6 animate-pulse">
              <div className="h-6 bg-gray-800 rounded w-32 mb-4" />
              <div className="h-4 bg-gray-800 rounded w-full mb-2" />
              <div className="h-4 bg-gray-800 rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">My Work</h1>
        <p className="text-gray-400">Track your efforts and record outcomes</p>
      </div>

      {/* My Impact Summary */}
      <div className="border border-gray-800 rounded-lg p-4 bg-gradient-to-r from-gray-900 to-gray-900/50">
        <h2 className="text-sm font-medium text-gray-400 mb-3">MY IMPACT SUMMARY</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400">{impactSummary.solutionsCompleted}</div>
            <div className="text-xs text-gray-500">Solutions Completed</div>
          </div>
          <div className="text-center">
            <div className={`text-3xl font-bold ${
              impactSummary.avgEffectiveness >= 70 ? "text-green-400" :
              impactSummary.avgEffectiveness >= 40 ? "text-yellow-400" : "text-gray-400"
            }`}>
              {impactSummary.avgEffectiveness > 0 ? `${impactSummary.avgEffectiveness}%` : "—"}
            </div>
            <div className="text-xs text-gray-500">Avg Effectiveness</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-400">{impactSummary.totalMetricsAchieved}</div>
            <div className="text-xs text-gray-500">Metrics Achieved</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-400">{myWork?.totalInProgress ?? 0}</div>
            <div className="text-xs text-gray-500">Active Efforts</div>
          </div>
        </div>
      </div>

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
        {activeTab === "in_progress" && (
          <InProgressTab
            solutions={myWork?.inProgress ?? []}
            onComplete={(id) => updateStatusMutation.mutate({ solutionId: id, status: "completed" })}
            onAbandon={(id) => updateStatusMutation.mutate({ solutionId: id, status: "abandoned" })}
            onUnassign={(id) => unassignMutation.mutate(id)}
            onRecordProgress={(id, title) => openRecordModal(id, title, "status_change")}
            onRecordMetric={(id, title) => openRecordModal(id, title, "metric_measurement")}
            isUpdating={updateStatusMutation.isPending || unassignMutation.isPending}
          />
        )}
        {activeTab === "completed" && (
          <CompletedTab
            solutions={myWork?.completed ?? []}
            onRecordOutcome={(id, title) => openRecordModal(id, title, "metric_measurement")}
          />
        )}
        {activeTab === "watching" && (
          <WatchingTab />
        )}
      </div>

      {/* Outcome Recording Modal */}
      <OutcomeRecordingModal
        solutionId={modalState.solutionId}
        solutionTitle={modalState.solutionTitle}
        isOpen={modalState.isOpen}
        onClose={closeModal}
        defaultType={modalState.defaultType}
      />
    </div>
  );
}

function calculateImpactSummary(myWork: MyWork | undefined): {
  solutionsCompleted: number;
  avgEffectiveness: number;
  totalMetricsAchieved: number;
} {
  if (!myWork) {
    return { solutionsCompleted: 0, avgEffectiveness: 0, totalMetricsAchieved: 0 };
  }

  const completed = myWork.completed;
  let totalEffectiveness = 0;
  let effectivenessCount = 0;
  let metricsAchieved = 0;

  for (const solution of completed) {
    if (solution.effectiveness?.overallScore !== null && solution.effectiveness?.overallScore !== undefined) {
      totalEffectiveness += solution.effectiveness.overallScore;
      effectivenessCount++;
    }
    metricsAchieved += solution.effectiveness?.metricsAchieved ?? 0;
  }

  return {
    solutionsCompleted: myWork.totalCompleted,
    avgEffectiveness: effectivenessCount > 0 ? Math.round((totalEffectiveness / effectivenessCount) * 100) : 0,
    totalMetricsAchieved: metricsAchieved,
  };
}

interface ActiveWorkSolution extends Solution {
  daysSinceStarted: number | null;
}

interface SolutionWithEffectiveness extends Solution {
  effectiveness: {
    overallScore: number | null;
    metricsAchieved: number;
    metricsMissed: number;
    impactVariance: number | null;
  } | null;
}

function InProgressTab({
  solutions,
  onComplete,
  onAbandon,
  onUnassign,
  onRecordProgress,
  onRecordMetric,
  isUpdating,
}: {
  solutions: ActiveWorkSolution[];
  onComplete: (id: string) => void;
  onAbandon: (id: string) => void;
  onUnassign: (id: string) => void;
  onRecordProgress: (id: string, title: string) => void;
  onRecordMetric: (id: string, title: string) => void;
  isUpdating: boolean;
}) {
  if (solutions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-2">No work in progress</p>
        <p className="text-gray-500 text-sm mb-4">
          Browse issues and click "I'll work on this" to start tracking your work
        </p>
        <Link
          href="/issues"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Browse Issues
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {solutions.map((solution) => (
        <InProgressSolutionCard
          key={solution.id}
          solution={solution}
          onComplete={() => onComplete(solution.id)}
          onAbandon={() => onAbandon(solution.id)}
          onUnassign={() => onUnassign(solution.id)}
          onRecordProgress={() => onRecordProgress(solution.id, solution.title)}
          onRecordMetric={() => onRecordMetric(solution.id, solution.title)}
          isUpdating={isUpdating}
        />
      ))}
    </div>
  );
}

function InProgressSolutionCard({
  solution,
  onComplete,
  onAbandon,
  onUnassign,
  onRecordProgress,
  onRecordMetric,
  isUpdating,
}: {
  solution: ActiveWorkSolution;
  onComplete: () => void;
  onAbandon: () => void;
  onUnassign: () => void;
  onRecordProgress: () => void;
  onRecordMetric: () => void;
  isUpdating: boolean;
}) {
  const { data: outcomesData } = useQuery({
    queryKey: ["solution-outcomes", solution.id],
    queryFn: () => api.getSolutionOutcomes(solution.id).catch(() => ({ data: [], meta: { total: 0, limit: 20, offset: 0 } })),
  });

  const recentOutcome = outcomesData?.data?.[0];

  return (
    <div className="border border-yellow-900/50 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs bg-yellow-900/50 text-yellow-300 px-2 py-0.5 rounded">
              In Progress
            </span>
            <span className="text-xs bg-gray-700 px-2 py-0.5 rounded capitalize">
              {solution.solutionType}
            </span>
            {solution.daysSinceStarted !== null && (
              <span className="text-xs text-gray-500">
                Day {solution.daysSinceStarted + 1}
              </span>
            )}
          </div>
          <Link
            href={`/issues/${solution.issueId}?tab=efforts`}
            className="font-semibold text-lg hover:text-blue-400 transition-colors"
          >
            {solution.title}
          </Link>
          <p className="text-gray-400 text-sm mt-1">{solution.summary}</p>

          {/* Recent Outcome */}
          {recentOutcome && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <div className="text-xs text-gray-500 mb-1">Recent update:</div>
              <div className="text-sm text-gray-300">
                {recentOutcome.notes || recentOutcome.feedbackText || `Recorded ${recentOutcome.metricName}: ${recentOutcome.metricValue}`}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {formatTimeAgo(recentOutcome.createdAt)}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={onRecordProgress}
              disabled={isUpdating}
              className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              Record Progress
            </button>
            <button
              onClick={onRecordMetric}
              disabled={isUpdating}
              className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              Record Metric
            </button>
          </div>
          <button
            onClick={onComplete}
            disabled={isUpdating}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            Mark Complete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onUnassign}
              disabled={isUpdating}
              className="flex-1 px-3 py-1.5 bg-gray-800 text-gray-300 text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              Unassign
            </button>
            <button
              onClick={onAbandon}
              disabled={isUpdating}
              className="flex-1 px-3 py-1.5 text-red-400 text-sm rounded-lg hover:bg-red-900/30 disabled:opacity-50 transition-colors"
            >
              Abandon
            </button>
          </div>
        </div>
      </div>

      {/* Execution Plan */}
      {solution.executionPlan && solution.executionPlan.steps.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <h4 className="text-sm font-medium text-gray-400 mb-2">Execution Plan</h4>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {solution.executionPlan.steps.map((step, i) => (
              <div key={i} className="flex-shrink-0 bg-gray-800/50 rounded px-3 py-1.5 text-xs">
                <span className="text-blue-400">Phase {step.phase}:</span> {step.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CompletedTab({
  solutions,
  onRecordOutcome,
}: {
  solutions: SolutionWithEffectiveness[];
  onRecordOutcome: (id: string, title: string) => void;
}) {
  if (solutions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-2">No completed work yet</p>
        <p className="text-gray-500 text-sm">
          Complete your in-progress solutions to see them here with effectiveness metrics
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {solutions.map((solution) => {
        const effectiveness = solution.effectiveness;
        const effectivenessScore = effectiveness?.overallScore !== null && effectiveness?.overallScore !== undefined
          ? Math.round(effectiveness.overallScore * 100)
          : null;

        return (
          <div key={solution.id} className="border border-green-900/50 rounded-lg p-4">
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
                <Link
                  href={`/issues/${solution.issueId}?tab=outcomes`}
                  className="font-semibold text-lg hover:text-blue-400 transition-colors"
                >
                  {solution.title}
                </Link>
                <p className="text-gray-400 text-sm mt-1">{solution.summary}</p>
              </div>

              <div className="flex items-center gap-4">
                {effectivenessScore !== null ? (
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
                  <div className="text-xs text-gray-500">No metrics yet</div>
                )}
                <button
                  onClick={() => onRecordOutcome(solution.id, solution.title)}
                  className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Add Outcome
                </button>
              </div>
            </div>

            {effectiveness && (
              <div className="mt-4 pt-4 border-t border-gray-800 grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-green-400">{effectiveness.metricsAchieved}</div>
                  <div className="text-xs text-gray-500">Achieved</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-red-400">{effectiveness.metricsMissed}</div>
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
                <div>
                  <Link
                    href={`/issues/${solution.issueId}?tab=outcomes`}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WatchingTab() {
  return (
    <div className="text-center py-12">
      <p className="text-gray-400 mb-2">Not watching any issues</p>
      <p className="text-gray-500 text-sm mb-4">
        Watch issues to monitor them without actively working on them
      </p>
      <p className="text-xs text-gray-600">
        (Watching functionality coming soon)
      </p>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
