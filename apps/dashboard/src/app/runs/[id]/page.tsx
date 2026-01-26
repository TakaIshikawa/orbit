"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["run", id],
    queryFn: () => api.getRun(id),
  });

  const { data: artifactsData } = useQuery({
    queryKey: ["artifacts-by-run", id],
    queryFn: () => api.getArtifacts({ runId: id }),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Loading run...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-red-400 border border-red-800 rounded-lg p-4">
        <p className="font-medium">Error loading run</p>
        <p className="text-sm mt-1">{error instanceof Error ? error.message : "Run not found"}</p>
        <Link href="/runs" className="text-blue-400 text-sm mt-2 inline-block hover:underline">
          Back to runs
        </Link>
      </div>
    );
  }

  const run = data.data;

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
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/runs" className="hover:text-white">Runs</Link>
        <span>/</span>
        <span className="text-gray-300 font-mono">{run.id}</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-xs px-2 py-1 rounded ${statusColors[run.runStatus] || statusColors.running}`}>
              {run.runStatus}
            </span>
            <span className="text-xs text-gray-500">
              Triggered by: {typeof run.triggeredBy === 'string' ? run.triggeredBy : run.triggeredBy?.type || 'unknown'}
            </span>
          </div>
          <h1 className="text-2xl font-bold font-mono">{run.agentId}</h1>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">
            {new Date(run.startedAt).toLocaleString()}
          </div>
          {duration && (
            <div className="text-lg font-semibold">
              {(duration / 1000).toFixed(2)}s total
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{run.llmCalls.length}</div>
          <div className="text-sm text-gray-500">LLM Calls</div>
        </div>
        <div className="border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{totalTokens.toLocaleString()}</div>
          <div className="text-sm text-gray-500">Total Tokens</div>
        </div>
        <div className="border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{(totalLatency / 1000).toFixed(2)}s</div>
          <div className="text-sm text-gray-500">LLM Time</div>
        </div>
        <div className="border border-gray-800 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">
            {run.llmCalls.length > 0
              ? (totalLatency / run.llmCalls.length / 1000).toFixed(2)
              : 0}s
          </div>
          <div className="text-sm text-gray-500">Avg Latency</div>
        </div>
      </div>

      {run.error && (
        <div className="border border-red-800 rounded-lg p-4 bg-red-900/20">
          <h2 className="font-semibold text-red-400 mb-2">Error</h2>
          <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono">{run.error}</pre>
        </div>
      )}

      <div className="border border-gray-800 rounded-lg p-4">
        <h2 className="font-semibold mb-4">LLM Call Trace ({run.llmCalls.length})</h2>
        <div className="space-y-4">
          {run.llmCalls.map((call, i) => {
            const inputTokens = call.tokens.input;
            const outputTokens = call.tokens.output;
            const maxTokens = Math.max(...run.llmCalls.map(c => c.tokens.input + c.tokens.output));
            const barWidth = ((inputTokens + outputTokens) / maxTokens) * 100;

            return (
              <div key={call.callId} className="border border-gray-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-gray-800 px-2 py-1 rounded font-mono">
                      #{call.callId}
                    </span>
                    <span className="text-sm font-medium">{call.model}</span>
                  </div>
                  <span className="text-sm text-gray-400">{call.latencyMs}ms</span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-3 bg-gray-800 rounded overflow-hidden">
                    <div className="h-full flex">
                      <div
                        className="bg-blue-600 h-full"
                        style={{ width: `${(inputTokens / (inputTokens + outputTokens)) * barWidth}%` }}
                        title={`Input: ${inputTokens} tokens`}
                      />
                      <div
                        className="bg-green-600 h-full"
                        style={{ width: `${(outputTokens / (inputTokens + outputTokens)) * barWidth}%` }}
                        title={`Output: ${outputTokens} tokens`}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-blue-600"></span>
                    Input: {inputTokens.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-green-600"></span>
                    Output: {outputTokens.toLocaleString()}
                  </span>
                  <span className="ml-auto">
                    Total: {(inputTokens + outputTokens).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
          {run.llmCalls.length === 0 && (
            <p className="text-gray-500 text-sm">No LLM calls recorded</p>
          )}
        </div>
      </div>

      {/* Embedded artifacts (from pipeline runs) */}
      {run.artifacts && run.artifacts.length > 0 && (
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Run Output</h2>
          <div className="space-y-4">
            {run.artifacts.map((artifact: { type: string; content: string }, i: number) => (
              <div key={i}>
                <div className="text-xs text-gray-500 mb-2">{artifact.type}</div>
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono bg-gray-900 p-4 rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
                  {artifact.content}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Artifacts from artifacts table */}
      {artifactsData && artifactsData.data.length > 0 && (
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Artifacts Produced ({artifactsData.data.length})</h2>
          <div className="space-y-2">
            {artifactsData.data.map((artifact) => (
              <div key={artifact.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-800 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-gray-800 px-2 py-1 rounded">{artifact.artifactType}</span>
                  <span>{artifact.title}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{artifact.format}</span>
                  <span>{(artifact.sizeBytes / 1024).toFixed(1)} KB</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border border-gray-800 rounded-lg p-4">
        <h2 className="font-semibold mb-3">Metadata</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">Run ID</dt>
          <dd className="font-mono">{run.id}</dd>
          <dt className="text-gray-500">Agent ID</dt>
          <dd className="font-mono">{run.agentId}</dd>
          <dt className="text-gray-500">Decision ID</dt>
          <dd className="font-mono">{run.decisionId}</dd>
          <dt className="text-gray-500">Trigger Type</dt>
          <dd>{typeof run.triggeredBy === 'string' ? run.triggeredBy : run.triggeredBy?.type || 'unknown'}</dd>
          <dt className="text-gray-500">Trigger Ref</dt>
          <dd className="font-mono text-xs">{typeof run.triggeredBy === 'string' ? '-' : run.triggeredBy?.ref || '-'}</dd>
          <dt className="text-gray-500">Started</dt>
          <dd>{new Date(run.startedAt).toLocaleString()}</dd>
          <dt className="text-gray-500">Completed</dt>
          <dd>{run.completedAt ? new Date(run.completedAt).toLocaleString() : "-"}</dd>
          <dt className="text-gray-500">Content Hash</dt>
          <dd className="font-mono text-xs truncate">{run.contentHash}</dd>
        </dl>
      </div>
    </div>
  );
}
