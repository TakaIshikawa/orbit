"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ActionableIssue, ActiveWorkSolution, SolutionWithEffectiveness } from "@/lib/api";
import { QuickDiscovery } from "@/components/discovery";

// Placeholder user ID - in production this would come from auth
const CURRENT_USER_ID = "user_default";

export default function Home() {
  const queryClient = useQueryClient();

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["dashboardSummary"],
    queryFn: () => api.getDashboardSummary(),
  });

  const assignMutation = useMutation({
    mutationFn: ({ solutionId, userId }: { solutionId: string; userId: string }) =>
      api.assignSolution(solutionId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (issueId: string) => api.archiveIssue(issueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
    },
  });

  const summary = dashboardData?.data;

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-800 rounded w-48 mb-4" />
          <div className="h-4 bg-gray-800 rounded w-96" />
        </div>
        <div className="grid grid-cols-1 gap-6">
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
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Home</h1>
        <p className="text-gray-400 mt-2">
          Your action-oriented workspace for systematic change
        </p>
      </div>

      {/* Quick Discovery */}
      <QuickDiscovery
        onRunComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
        }}
      />

      {/* Needs Attention */}
      <section className="border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Needs Attention</h2>
          <Link
            href="/issues"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            View all issues
          </Link>
        </div>

        {summary?.topActionableIssues && summary.topActionableIssues.length > 0 ? (
          <div className="space-y-4">
            {summary.topActionableIssues.map((issue) => (
              <ActionableIssueCard
                key={issue.id}
                issue={issue}
                onTakeAction={(solutionId) => {
                  assignMutation.mutate({ solutionId, userId: CURRENT_USER_ID });
                }}
                onArchive={() => {
                  archiveMutation.mutate(issue.id);
                }}
                isArchiving={archiveMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            message="No urgent issues found"
            description="Run the discovery pipeline to find issues that need attention"
            actionHref="/playbooks"
            actionLabel="Go to Discover"
          />
        )}
      </section>

      {/* Your Active Work */}
      <section className="border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Your Active Work</h2>
          <Link
            href="/my-work"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            View all
          </Link>
        </div>

        {summary?.activeWork && summary.activeWork.length > 0 ? (
          <div className="space-y-3">
            {summary.activeWork.map((solution) => (
              <ActiveWorkCard key={solution.id} solution={solution} />
            ))}
          </div>
        ) : (
          <EmptyState
            message="No active work"
            description="Take action on an issue to start tracking your work"
          />
        )}
      </section>

      {/* Recent Outcomes */}
      <section className="border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Outcomes</h2>
        </div>

        {summary?.recentOutcomes && summary.recentOutcomes.length > 0 ? (
          <div className="space-y-3">
            {summary.recentOutcomes.map((solution) => (
              <OutcomeCard key={solution.id} solution={solution} />
            ))}
          </div>
        ) : (
          <EmptyState
            message="No completed work yet"
            description="Complete a solution to see your outcomes and impact metrics"
          />
        )}
      </section>
    </div>
  );
}

function ActionableIssueCard({
  issue,
  onTakeAction,
  onArchive,
  isArchiving,
}: {
  issue: ActionableIssue;
  onTakeAction: (solutionId: string) => void;
  onArchive: () => void;
  isArchiving?: boolean;
}) {
  const actionabilityPercent = Math.round(issue.actionability * 100);

  return (
    <div className="border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <Link
            href={`/issues/${issue.id}`}
            className="font-medium hover:text-blue-400 transition-colors block truncate"
          >
            {issue.title}
          </Link>
          <p className="text-gray-400 text-sm mt-1 line-clamp-2">
            {issue.summary}
          </p>

          {/* Scores */}
          <div className="flex flex-wrap gap-3 mt-3">
            <ScoreBadge
              label="Actionability"
              value={actionabilityPercent}
              color={actionabilityPercent >= 70 ? "green" : actionabilityPercent >= 40 ? "yellow" : "gray"}
            />
            <ScoreBadge
              label="Urgency"
              value={Math.round((issue.scoreUrgency ?? 0) * 100)}
              color="orange"
            />
            <ScoreBadge
              label="Tractability"
              value={Math.round((issue.scoreTractability ?? 0) * 100)}
              color="blue"
            />
            {issue.solutionCount > 0 && (
              <span className="text-xs bg-green-900/50 text-green-300 px-2 py-1 rounded">
                {issue.solutionCount} solution{issue.solutionCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onArchive}
            disabled={isArchiving}
            className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            title="Archive issue"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </button>
          <Link
            href={`/issues/${issue.id}?tab=actions`}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Take Action
          </Link>
        </div>
      </div>
    </div>
  );
}

function ActiveWorkCard({ solution }: { solution: ActiveWorkSolution }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
      <div className="flex-1 min-w-0">
        <Link
          href={`/issues/${solution.issueId}?tab=efforts`}
          className="font-medium hover:text-blue-400 transition-colors block truncate"
        >
          {solution.title}
        </Link>
        <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
          <span className="capitalize">{solution.solutionType}</span>
          {solution.daysSinceStarted !== null && (
            <span>
              Started {solution.daysSinceStarted === 0
                ? "today"
                : solution.daysSinceStarted === 1
                ? "yesterday"
                : `${solution.daysSinceStarted} days ago`}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="px-2 py-1 bg-yellow-900/50 text-yellow-300 text-xs rounded">
          In Progress
        </span>
        <Link
          href={`/issues/${solution.issueId}?tab=efforts`}
          className="px-3 py-1 text-sm text-blue-400 hover:text-blue-300"
        >
          Update
        </Link>
      </div>
    </div>
  );
}

function OutcomeCard({ solution }: { solution: SolutionWithEffectiveness }) {
  const effectiveness = solution.effectiveness;
  const effectivenessScore = effectiveness?.overallScore !== null && effectiveness?.overallScore !== undefined
    ? Math.round(effectiveness.overallScore * 100)
    : null;

  return (
    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
      <div className="flex-1 min-w-0">
        <Link
          href={`/issues/${solution.issueId}?tab=outcomes`}
          className="font-medium hover:text-blue-400 transition-colors block truncate"
        >
          {solution.title}
        </Link>
        <div className="flex items-center gap-3 mt-1 text-sm">
          {effectiveness && (
            <>
              {effectiveness.metricsAchieved > 0 && (
                <span className="text-green-400">
                  {effectiveness.metricsAchieved} metric{effectiveness.metricsAchieved !== 1 ? "s" : ""} achieved
                </span>
              )}
              {effectiveness.metricsMissed > 0 && (
                <span className="text-red-400">
                  {effectiveness.metricsMissed} missed
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {effectivenessScore !== null ? (
          <div className="text-right">
            <div className={`text-lg font-bold ${
              effectivenessScore >= 70 ? "text-green-400" :
              effectivenessScore >= 40 ? "text-yellow-400" : "text-red-400"
            }`}>
              {effectivenessScore}%
            </div>
            <div className="text-xs text-gray-500">effectiveness</div>
          </div>
        ) : (
          <span className="text-xs text-gray-500">No metrics yet</span>
        )}
        <span className="px-2 py-1 bg-green-900/50 text-green-300 text-xs rounded">
          Completed
        </span>
      </div>
    </div>
  );
}

function ScoreBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "green" | "yellow" | "orange" | "blue" | "gray";
}) {
  const colors = {
    green: "bg-green-900/50 text-green-300",
    yellow: "bg-yellow-900/50 text-yellow-300",
    orange: "bg-orange-900/50 text-orange-300",
    blue: "bg-blue-900/50 text-blue-300",
    gray: "bg-gray-800 text-gray-400",
  };

  return (
    <span className={`text-xs px-2 py-1 rounded ${colors[color]}`}>
      {label}: {value}%
    </span>
  );
}

function EmptyState({
  message,
  description,
  actionHref,
  actionLabel,
}: {
  message: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="text-center py-8">
      <p className="text-gray-400 mb-2">{message}</p>
      <p className="text-gray-500 text-sm mb-4">{description}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-block px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
