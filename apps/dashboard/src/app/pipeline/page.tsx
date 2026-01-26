"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type RunLog } from "@/lib/api";

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [scoutQuery, setScoutQuery] = useState("");
  const [scoutUrl, setScoutUrl] = useState("");
  const [verifyLimit, setVerifyLimit] = useState(5);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch recent runs
  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["pipeline-runs"],
    queryFn: () => api.getRuns({ limit: 20 }),
    refetchInterval: activeRunId ? 2000 : false,
  });

  // Fetch output for active run
  const { data: outputData } = useQuery({
    queryKey: ["pipeline-output", activeRunId],
    queryFn: () => activeRunId ? api.getPipelineRunOutput(activeRunId) : null,
    enabled: !!activeRunId,
    refetchInterval: 1000,
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
      setExpandedRunId(data.data.runId);
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
      setExpandedRunId(data.data.runId);
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
      const timer = setTimeout(() => {
        setActiveRunId(null);
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

      {/* Recent Runs */}
      <div className="border border-gray-800 rounded-lg">
        <div className="p-4 border-b border-gray-800">
          <h3 className="font-semibold">Recent Pipeline Runs</h3>
        </div>

        {runsLoading && (
          <div className="p-4 text-gray-400 animate-pulse">Loading runs...</div>
        )}

        {pipelineRuns.length === 0 && !runsLoading && (
          <p className="p-4 text-gray-500 text-sm">No pipeline runs yet. Run Scout or Verify to get started.</p>
        )}

        {pipelineRuns.length > 0 && (
          <div className="divide-y divide-gray-800">
            {pipelineRuns.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                isExpanded={run.id === expandedRunId}
                isActive={run.id === activeRunId}
                liveOutput={run.id === activeRunId ? outputData?.data?.output : undefined}
                onToggle={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                onStop={() => stopMutation.mutate(run.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RunCard({
  run,
  isExpanded,
  isActive,
  liveOutput,
  onToggle,
  onStop,
}: {
  run: RunLog;
  isExpanded: boolean;
  isActive: boolean;
  liveOutput?: string[];
  onToggle: () => void;
  onStop: () => void;
}) {
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

  // Calculate LLM metrics
  const llmCalls = run.llmCalls || [];
  const totalTokens = llmCalls.reduce((sum, c) => sum + c.tokens.input + c.tokens.output, 0);
  const totalLatency = llmCalls.reduce((sum, c) => sum + c.latencyMs, 0);

  // Get output from artifacts
  const output = run.artifacts?.find(a => a.type === "output")?.content || "";
  const outputLines = output ? output.split("\n") : [];

  // Use live output if available, otherwise use stored output
  const displayOutput = isActive && liveOutput ? liveOutput : outputLines;

  return (
    <div className={isActive ? "bg-blue-900/10" : ""}>
      {/* Header Row */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{agentIcons[run.agentId] || "▶"}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium capitalize">{run.agentId}</span>
              {isActive && (
                <span className="flex items-center gap-1 text-xs text-yellow-400">
                  <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {new Date(run.startedAt).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* LLM Stats (if available) */}
          {llmCalls.length > 0 && (
            <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500">
              <span>{llmCalls.length} calls</span>
              <span>{totalTokens.toLocaleString()} tokens</span>
              <span>{(totalLatency / 1000).toFixed(1)}s LLM</span>
            </div>
          )}

          {duration !== null && (
            <span className="text-sm text-gray-400">{duration}s</span>
          )}

          <span className={`text-xs px-2 py-0.5 rounded ${statusColors[run.runStatus] || "bg-gray-700"}`}>
            {run.runStatus}
          </span>

          <span className={`text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
            ▼
          </span>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Metrics Grid */}
          {(llmCalls.length > 0 || duration) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard label="Duration" value={duration ? `${duration}s` : "-"} />
              <MetricCard label="LLM Calls" value={llmCalls.length} />
              <MetricCard label="Total Tokens" value={totalTokens.toLocaleString()} />
              <MetricCard label="Avg Latency" value={llmCalls.length > 0 ? `${(totalLatency / llmCalls.length / 1000).toFixed(2)}s` : "-"} />
            </div>
          )}

          {/* LLM Call Details */}
          {llmCalls.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-400">LLM Calls</h4>
              <div className="space-y-2">
                {llmCalls.map((call, i) => {
                  const inputTokens = call.tokens.input;
                  const outputTokens = call.tokens.output;
                  const maxTokens = Math.max(...llmCalls.map(c => c.tokens.input + c.tokens.output));
                  const barWidth = ((inputTokens + outputTokens) / maxTokens) * 100;

                  return (
                    <div key={i} className="bg-gray-800/50 rounded p-3">
                      <div className="flex items-center justify-between mb-2 text-sm">
                        <span className="text-gray-300">{call.model}</span>
                        <span className="text-gray-500">{(call.latencyMs / 1000).toFixed(2)}s</span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded overflow-hidden mb-1">
                        <div className="h-full flex">
                          <div
                            className="bg-blue-500 h-full"
                            style={{ width: `${(inputTokens / (inputTokens + outputTokens)) * barWidth}%` }}
                          />
                          <div
                            className="bg-green-500 h-full"
                            style={{ width: `${(outputTokens / (inputTokens + outputTokens)) * barWidth}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded bg-blue-500" />
                          In: {inputTokens.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded bg-green-500" />
                          Out: {outputTokens.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error */}
          {run.error && (
            <div className="bg-red-900/20 border border-red-800 rounded p-3">
              <h4 className="text-sm font-medium text-red-400 mb-1">Error</h4>
              <pre className="text-xs text-red-300 whitespace-pre-wrap">{run.error}</pre>
            </div>
          )}

          {/* Output */}
          {displayOutput.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-400">Output</h4>
                {isActive && run.runStatus === "running" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onStop(); }}
                    className="text-xs px-2 py-1 bg-red-900/50 text-red-300 rounded hover:bg-red-900/70"
                  >
                    Stop
                  </button>
                )}
              </div>
              <div className="bg-gray-900 rounded p-3 max-h-64 overflow-y-auto font-mono text-xs">
                {displayOutput.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.startsWith("[stderr]")
                        ? "text-red-400"
                        : line.startsWith("✅") || line.startsWith("✓")
                        ? "text-green-400"
                        : line.startsWith("❌") || line.startsWith("✗")
                        ? "text-red-400"
                        : line.startsWith("📌") || line.startsWith("✨")
                        ? "text-blue-300"
                        : "text-gray-300"
                    }
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>ID: <span className="font-mono">{run.id}</span></span>
            <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
            {run.completedAt && <span>Completed: {new Date(run.completedAt).toLocaleString()}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-800/50 rounded p-3 text-center">
      <div className="text-lg font-semibold text-gray-100">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
