"use client";

import Link from "next/link";
import { DiscoveryRun } from "@/lib/api";

interface DiscoveryRunListProps {
  runs: DiscoveryRun[];
  isLoading?: boolean;
}

export function DiscoveryRunList({ runs, isLoading = false }: DiscoveryRunListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="p-3 bg-gray-800/50 rounded-lg animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-gray-700" />
              <div className="h-4 bg-gray-700 rounded w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        No recent discovery runs
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <DiscoveryRunItem key={run.id} run={run} />
      ))}
    </div>
  );
}

function DiscoveryRunItem({ run }: { run: DiscoveryRun }) {
  const statusConfig = {
    pending: { color: "bg-yellow-400", label: "Pending", animation: "pulse" as const },
    running: { color: "bg-blue-400", label: "Running", animation: "ping" as const },
    paused: { color: "bg-yellow-400", label: "Paused", animation: null },
    completed: { color: "bg-green-400", label: "Completed", animation: null },
    failed: { color: "bg-red-400", label: "Failed", animation: null },
    cancelled: { color: "bg-gray-400", label: "Cancelled", animation: null },
  };

  const config = statusConfig[run.status];
  const profileName = run.context?.variables?.profileName as string || "Unknown profile";
  const timeAgo = getTimeAgo(new Date(run.startedAt));

  // Get output stats if available
  const patternsCreated = run.output?.patternsCreated as string[] | undefined;
  const issuesCreated = run.output?.issuesCreated as string[] | undefined;

  return (
    <Link
      href={`/playbooks/executions/${run.id}`}
      className="block p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span
              className={`block w-3 h-3 rounded-full ${config.color} ${config.animation === "pulse" ? "animate-pulse" : ""}`}
            />
            {config.animation === "ping" && (
              <span className={`absolute inset-0 w-3 h-3 rounded-full ${config.color} animate-ping`} />
            )}
            {config.animation === "pulse" && (
              <span className={`absolute inset-0 w-3 h-3 rounded-full ${config.color} animate-ping opacity-75`} style={{ animationDuration: "2s" }} />
            )}
          </div>
          <div>
            <span className="font-medium text-white">
              {config.label}: {profileName}
            </span>
            {run.status === "running" && (
              <span className="ml-2 text-sm text-gray-400">
                Step {run.currentStep + 1}/{run.totalSteps}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          {run.status === "completed" && (
            <span className="text-green-400">
              {patternsCreated?.length || 0} patterns, {issuesCreated?.length || 0} issues
            </span>
          )}
          <span>{timeAgo}</span>
        </div>
      </div>
      {run.error && (
        <p className="mt-2 text-sm text-red-400 truncate">{run.error}</p>
      )}
    </Link>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
