"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type PlaybookStepExecution } from "@/lib/api";
import Link from "next/link";

export default function ExecutionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["playbook-execution", id],
    queryFn: () => api.getPlaybookExecution(id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Loading execution...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/playbooks" className="text-blue-400 hover:underline text-sm">
          &larr; Back to playbooks
        </Link>
        <div className="text-red-400 border border-red-800 rounded-lg p-4">
          <p className="font-medium">Error loading execution</p>
          <p className="text-sm mt-1">{error instanceof Error ? error.message : "Not found"}</p>
        </div>
      </div>
    );
  }

  const execution = data.data;

  const statusColors: Record<string, string> = {
    pending: "bg-gray-700 text-gray-300",
    running: "bg-blue-900/50 text-blue-300",
    paused: "bg-yellow-900/50 text-yellow-300",
    completed: "bg-green-900/50 text-green-300",
    failed: "bg-red-900/50 text-red-300",
    cancelled: "bg-gray-700 text-gray-300",
    skipped: "bg-gray-700 text-gray-300",
  };

  const stepStatusColors: Record<string, string> = {
    pending: "border-gray-600 bg-gray-900",
    running: "border-blue-500 bg-blue-900/20",
    completed: "border-green-500 bg-green-900/20",
    failed: "border-red-500 bg-red-900/20",
    skipped: "border-gray-600 bg-gray-900/50",
  };

  const duration = execution.completedAt
    ? new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/playbooks/${execution.playbookId}`} className="text-blue-400 hover:underline text-sm">
          &larr; Back to playbook
        </Link>
      </div>

      {/* Header */}
      <div className="border border-gray-800 rounded-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">Execution</h1>
              <span className={`text-xs px-2 py-1 rounded ${statusColors[execution.status]}`}>
                {execution.status}
              </span>
            </div>
            <p className="text-gray-400 text-sm font-mono">{execution.id}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Triggered By</span>
            <p className="font-medium">{execution.triggeredBy}</p>
          </div>
          <div>
            <span className="text-gray-500">Progress</span>
            <p className="font-medium">{execution.currentStep}/{execution.totalSteps} steps</p>
          </div>
          <div>
            <span className="text-gray-500">Started</span>
            <p className="font-medium">{new Date(execution.startedAt).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-gray-500">Duration</span>
            <p className="font-medium">
              {duration !== null ? `${(duration / 1000).toFixed(1)}s` : "In progress"}
            </p>
          </div>
        </div>

        {execution.error && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-lg">
            <span className="text-red-400 text-sm font-medium">Error: </span>
            <span className="text-red-300 text-sm">{execution.error}</span>
          </div>
        )}
      </div>

      {/* Context */}
      {execution.context && Object.keys(execution.context).length > 0 && (
        <div className="border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Context</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {execution.context.patternId && (
              <div>
                <span className="text-gray-500">Pattern ID</span>
                <p className="font-mono text-sm">{execution.context.patternId}</p>
              </div>
            )}
            {execution.context.issueId && (
              <div>
                <span className="text-gray-500">Issue ID</span>
                <Link href={`/issues/${execution.context.issueId}`} className="text-blue-400 hover:underline font-mono text-sm">
                  {execution.context.issueId}
                </Link>
              </div>
            )}
            {execution.context.briefId && (
              <div>
                <span className="text-gray-500">Brief ID</span>
                <Link href={`/briefs/${execution.context.briefId}`} className="text-blue-400 hover:underline font-mono text-sm">
                  {execution.context.briefId}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Steps</h2>
        {execution.steps.length === 0 ? (
          <p className="text-gray-500 text-sm">No steps executed yet</p>
        ) : (
          <div className="space-y-3">
            {execution.steps.map((step, idx) => (
              <StepCard key={step.id} step={step} index={idx} statusColors={stepStatusColors} />
            ))}
          </div>
        )}
      </div>

      {/* Logs */}
      {execution.logs && execution.logs.length > 0 && (
        <div className="border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Logs</h2>
          <div className="space-y-1 font-mono text-sm max-h-96 overflow-y-auto">
            {execution.logs.map((log, idx) => (
              <div key={idx} className="flex gap-3 py-1">
                <span className="text-gray-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 w-12 ${
                  log.level === "error" ? "text-red-400" :
                  log.level === "warn" ? "text-yellow-400" :
                  "text-gray-400"
                }`}>
                  [{log.level}]
                </span>
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output */}
      {execution.output && Object.keys(execution.output).length > 0 && (
        <div className="border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Output</h2>
          <pre className="text-sm text-gray-300 bg-gray-900 p-4 rounded-lg overflow-auto max-h-96">
            {JSON.stringify(execution.output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function StepCard({ step, index, statusColors }: { step: PlaybookStepExecution; index: number; statusColors: Record<string, string> }) {
  const duration = step.completedAt && step.startedAt
    ? new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
    : step.durationMs;

  return (
    <div className={`border rounded-lg p-4 ${statusColors[step.status] || statusColors.pending}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center bg-gray-800 rounded text-sm">
            {index + 1}
          </div>
          <span className="font-medium">{step.stepName}</span>
          <span className="text-xs px-2 py-0.5 bg-gray-800 rounded text-gray-400">
            {step.actionType}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {duration !== null && (
            <span className="text-xs text-gray-500">{duration}ms</span>
          )}
          <span className={`text-xs px-2 py-1 rounded ${
            step.status === "completed" ? "bg-green-900/50 text-green-300" :
            step.status === "failed" ? "bg-red-900/50 text-red-300" :
            step.status === "running" ? "bg-blue-900/50 text-blue-300" :
            step.status === "skipped" ? "bg-gray-700 text-gray-400" :
            "bg-gray-700 text-gray-300"
          }`}>
            {step.status}
          </span>
        </div>
      </div>

      {step.error && (
        <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded text-sm">
          <span className="text-red-400">Error: </span>
          <span className="text-red-300">{step.error}</span>
        </div>
      )}

      {step.output && Object.keys(step.output).length > 0 && (
        <details className="mt-2">
          <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
            View output
          </summary>
          <pre className="mt-2 text-xs text-gray-400 bg-gray-900 p-2 rounded overflow-auto max-h-48">
            {JSON.stringify(step.output, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
