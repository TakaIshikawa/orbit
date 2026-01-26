"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, type RunLog } from "@/lib/api";

export default function RunsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.getRuns(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Runs</h1>
          <p className="text-gray-400">Agent execution logs and traces</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-gray-400">Loading runs...</div>
        </div>
      )}

      {error && (
        <div className="text-red-400 border border-red-800 rounded-lg p-4">
          <p className="font-medium">Error loading runs</p>
          <p className="text-sm mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">No runs yet</p>
          <p className="text-sm text-gray-500">Runs are created when agents execute</p>
        </div>
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="text-sm text-gray-500">{data.meta.total} runs found</div>
          <div className="space-y-3">
            {data.data.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RunCard({ run }: { run: RunLog }) {
  const statusColors: Record<string, string> = {
    running: "bg-blue-900/50 text-blue-300",
    success: "bg-green-900/50 text-green-300",
    failed: "bg-red-900/50 text-red-300",
    timeout: "bg-orange-900/50 text-orange-300",
    cancelled: "bg-gray-700 text-gray-300",
  };

  const totalTokens = run.llmCalls.reduce(
    (acc, call) => acc + call.tokens.input + call.tokens.output,
    0
  );

  const totalLatency = run.llmCalls.reduce((acc, call) => acc + call.latencyMs, 0);

  const duration = run.completedAt
    ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
    : null;

  return (
    <Link href={`/runs/${run.id}`} className="block border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded ${statusColors[run.runStatus] || statusColors.running}`}>
            {run.runStatus}
          </span>
          <span className="text-xs text-gray-500 font-mono">{run.agentId}</span>
        </div>
        <span className="text-xs text-gray-500">
          {new Date(run.startedAt).toLocaleString()}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4 mt-3 text-center">
        <div>
          <div className="text-lg font-semibold">{run.llmCalls.length}</div>
          <div className="text-xs text-gray-500">LLM Calls</div>
        </div>
        <div>
          <div className="text-lg font-semibold">{totalTokens.toLocaleString()}</div>
          <div className="text-xs text-gray-500">Tokens</div>
        </div>
        <div>
          <div className="text-lg font-semibold">{(totalLatency / 1000).toFixed(1)}s</div>
          <div className="text-xs text-gray-500">LLM Time</div>
        </div>
        <div>
          <div className="text-lg font-semibold">
            {duration ? `${(duration / 1000).toFixed(1)}s` : "-"}
          </div>
          <div className="text-xs text-gray-500">Duration</div>
        </div>
      </div>

      {run.error && (
        <div className="mt-3 p-2 bg-red-900/20 border border-red-900/50 rounded text-xs text-red-400">
          {run.error}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
        <span>Trigger: {run.triggeredBy.type}</span>
        <span className="font-mono">{run.id}</span>
      </div>
    </Link>
  );
}
