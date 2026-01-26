"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type RunLog } from "@/lib/api";

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [scoutQuery, setScoutQuery] = useState("");
  const [scoutUrl, setScoutUrl] = useState("");
  const [verifyLimit, setVerifyLimit] = useState(5);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch recent runs
  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["pipeline-runs"],
    queryFn: () => api.getRuns({ limit: 20 }),
    refetchInterval: activeRunId ? 2000 : false, // Poll when a run is active
  });

  // Fetch output for active run
  const { data: outputData } = useQuery({
    queryKey: ["pipeline-output", activeRunId],
    queryFn: () => activeRunId ? api.getPipelineRunOutput(activeRunId) : null,
    enabled: !!activeRunId,
    refetchInterval: 1000, // Poll every second
  });

  // Scout mutation
  const scoutMutation = useMutation({
    mutationFn: () => api.runScout({
      query: scoutQuery || undefined,
      url: scoutUrl || undefined,
      recommended: !scoutUrl,
    }),
    onSuccess: (data) => {
      setActiveRunId(data.data.runId);
      setMessage({ type: "success", text: `Scout started: ${data.data.runId}` });
      queryClient.invalidateQueries({ queryKey: ["pipeline-runs"] });
    },
    onError: (error) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to start scout" });
    },
  });

  // Verify mutation
  const verifyMutation = useMutation({
    mutationFn: () => api.runVerify({ limit: verifyLimit }),
    onSuccess: (data) => {
      setActiveRunId(data.data.runId);
      setMessage({ type: "success", text: `Verify started: ${data.data.runId}` });
      queryClient.invalidateQueries({ queryKey: ["pipeline-runs"] });
    },
    onError: (error) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to start verify" });
    },
  });

  // Stop mutation
  const stopMutation = useMutation({
    mutationFn: (runId: string) => api.stopPipelineRun(runId),
    onSuccess: () => {
      setMessage({ type: "success", text: "Stop signal sent" });
      queryClient.invalidateQueries({ queryKey: ["pipeline-runs"] });
    },
  });

  // Clear active run when it completes
  useEffect(() => {
    if (outputData?.data?.status && outputData.data.status !== "running") {
      // Run completed, stop polling after a delay
      const timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["pipeline-runs"] });
        queryClient.invalidateQueries({ queryKey: ["patterns"] });
        queryClient.invalidateQueries({ queryKey: ["verifications"] });
        queryClient.invalidateQueries({ queryKey: ["source-health"] });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [outputData?.data?.status, queryClient]);

  const runs = runsData?.data ?? [];
  const pipelineRuns = runs.filter(r => r.agentId === "scout" || r.agentId === "verify");

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === "success"
            ? "bg-green-900/50 text-green-300 border border-green-800"
            : "bg-red-900/50 text-red-300 border border-red-800"
        }`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-4 text-gray-400 hover:text-white">×</button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-gray-400">Run and monitor discovery and verification commands</p>
      </div>

      {/* Command Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Scout Card */}
        <div className="border border-gray-800 rounded-lg p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🔭</span>
            <div>
              <h2 className="font-semibold text-lg">Scout</h2>
              <p className="text-sm text-gray-400">Discover patterns from sources</p>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Search Query (optional)</label>
              <input
                type="text"
                value={scoutQuery}
                onChange={(e) => setScoutQuery(e.target.value)}
                placeholder="e.g., climate policy gaps"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Single URL (optional)</label>
              <input
                type="text"
                value={scoutUrl}
                onChange={(e) => setScoutUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            onClick={() => scoutMutation.mutate()}
            disabled={scoutMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
          >
            {scoutMutation.isPending ? "Starting..." : "Run Scout"}
          </button>
        </div>

        {/* Verify Card */}
        <div className="border border-gray-800 rounded-lg p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">✓</span>
            <div>
              <h2 className="font-semibold text-lg">Verify</h2>
              <p className="text-sm text-gray-400">Cross-reference patterns with external sources</p>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max Patterns to Verify</label>
              <input
                type="number"
                value={verifyLimit}
                onChange={(e) => setVerifyLimit(parseInt(e.target.value) || 5)}
                min={1}
                max={20}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-gray-500">
              Verifies unverified patterns against high-credibility external sources
            </p>
          </div>

          <button
            onClick={() => verifyMutation.mutate()}
            disabled={verifyMutation.isPending}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
          >
            {verifyMutation.isPending ? "Starting..." : "Run Verify"}
          </button>
        </div>
      </div>

      {/* Live Output */}
      {activeRunId && outputData?.data && (
        <div className="border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold">Live Output</h3>
              <span className={`text-xs px-2 py-0.5 rounded ${
                outputData.data.status === "running"
                  ? "bg-yellow-900/50 text-yellow-300"
                  : outputData.data.status === "success"
                  ? "bg-green-900/50 text-green-300"
                  : "bg-red-900/50 text-red-300"
              }`}>
                {outputData.data.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {outputData.data.status === "running" && (
                <button
                  onClick={() => stopMutation.mutate(activeRunId)}
                  className="text-xs px-2 py-1 bg-red-900/50 text-red-300 rounded hover:bg-red-900/70"
                >
                  Stop
                </button>
              )}
              <button
                onClick={() => setActiveRunId(null)}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>
          </div>
          <div className="bg-gray-900 rounded p-3 max-h-80 overflow-y-auto font-mono text-xs">
            {outputData.data.output.length === 0 ? (
              <span className="text-gray-500">Waiting for output...</span>
            ) : (
              outputData.data.output.map((line, i) => (
                <div key={i} className={line.startsWith("[stderr]") ? "text-red-400" : "text-gray-300"}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Recent Runs */}
      <div className="border border-gray-800 rounded-lg p-4">
        <h3 className="font-semibold mb-4">Recent Pipeline Runs</h3>

        {runsLoading && (
          <div className="text-gray-400 animate-pulse">Loading runs...</div>
        )}

        {pipelineRuns.length === 0 && !runsLoading && (
          <p className="text-gray-500 text-sm">No pipeline runs yet. Run Scout or Verify to get started.</p>
        )}

        {pipelineRuns.length > 0 && (
          <div className="space-y-2">
            {pipelineRuns.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                isActive={run.id === activeRunId}
                onSelect={() => setActiveRunId(run.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RunRow({ run, isActive, onSelect }: { run: RunLog; isActive: boolean; onSelect: () => void }) {
  const statusColors: Record<string, string> = {
    running: "bg-yellow-900/50 text-yellow-300",
    success: "bg-green-900/50 text-green-300",
    failed: "bg-red-900/50 text-red-300",
    timeout: "bg-orange-900/50 text-orange-300",
  };

  const agentIcons: Record<string, string> = {
    scout: "🔭",
    verify: "✓",
  };

  const duration = run.completedAt
    ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
    : null;

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
        isActive ? "bg-blue-900/30 border border-blue-800" : "bg-gray-800/50 hover:bg-gray-800"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3">
        <span>{agentIcons[run.agentId] || "▶"}</span>
        <div>
          <div className="font-medium capitalize">{run.agentId}</div>
          <div className="text-xs text-gray-500">
            {new Date(run.startedAt).toLocaleString()}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {duration !== null && (
          <span className="text-xs text-gray-500">{duration}s</span>
        )}
        <span className={`text-xs px-2 py-0.5 rounded ${statusColors[run.runStatus] || "bg-gray-700"}`}>
          {run.runStatus}
        </span>
      </div>
    </div>
  );
}
