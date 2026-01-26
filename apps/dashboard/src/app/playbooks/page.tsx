"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Link from "next/link";

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch recent pipeline executions
  const { data: executionsData, isLoading } = useQuery({
    queryKey: ["playbook-executions"],
    queryFn: () => api.getPlaybookExecutions({ limit: 10 }),
    refetchInterval: 5000, // Poll for updates
  });

  // Run full pipeline mutation
  const runPipelineMutation = useMutation({
    mutationFn: async () => {
      // First, find or create the full pipeline playbook
      const playbooks = await api.getPlaybooks();
      let fullPipeline = playbooks.data.find(p => p.name === "Full Pipeline");

      if (!fullPipeline) {
        // Create the full pipeline playbook if it doesn't exist
        const created = await api.createPlaybook({
          name: "Full Pipeline",
          description: "Scout → Analyze → Brief → Verify → Plan",
          steps: [
            { name: "Discover patterns", action: { type: "scout", config: { maxPatterns: 20 } } },
            { name: "Synthesize issues", action: { type: "analyze", config: {} } },
            { name: "Generate briefs", action: { type: "brief", config: {} } },
            { name: "Verify claims", action: { type: "verify", config: { maxClaims: 5 } } },
            { name: "Generate solutions", action: { type: "plan", config: { maxSolutions: 5 } } },
          ],
          triggers: [{ type: "manual" }],
          applicableTo: {},
          playbookStatus: "active",
        });
        fullPipeline = created.data;
      }

      // Execute the playbook
      return api.executePlaybook(fullPipeline.id);
    },
    onSuccess: (data) => {
      setMessage({ type: "success", text: `Pipeline started: ${data.data.executionId}` });
      queryClient.invalidateQueries({ queryKey: ["playbook-executions"] });
      setTimeout(() => setMessage(null), 5000);
    },
    onError: (error) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to start pipeline" });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const hasRunningExecution = executionsData?.data?.some(e => e.status === "running" || e.status === "pending");

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
        <h1 className="text-2xl font-bold">Run Pipeline</h1>
        <p className="text-gray-400">Execute the full discovery and analysis pipeline</p>
      </div>

      {/* Run Pipeline Card */}
      <div className="border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold mb-1">Full Pipeline</h2>
            <p className="text-sm text-gray-400 mb-3">
              Scout → Analyze → Brief → Verify → Plan
            </p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>5 stages</span>
              <span>•</span>
              <Link href="/scheduler" className="text-blue-400 hover:underline">
                Set up schedule →
              </Link>
            </div>
          </div>
          <button
            onClick={() => runPipelineMutation.mutate()}
            disabled={runPipelineMutation.isPending || hasRunningExecution}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {runPipelineMutation.isPending ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Starting...
              </>
            ) : hasRunningExecution ? (
              <>
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                Running...
              </>
            ) : (
              <>
                <span>▶</span>
                Run Pipeline
              </>
            )}
          </button>
        </div>
      </div>

      {/* Pipeline Stages */}
      <div className="border border-gray-800 rounded-lg p-4">
        <h3 className="font-medium mb-3 text-gray-400">Pipeline Stages</h3>
        <div className="flex items-center gap-2">
          {[
            { name: "Scout", icon: "🔭", desc: "Discover patterns" },
            { name: "Analyze", icon: "🔍", desc: "Synthesize issues" },
            { name: "Brief", icon: "📋", desc: "Generate briefs" },
            { name: "Verify", icon: "✓", desc: "Validate claims" },
            { name: "Plan", icon: "💡", desc: "Generate solutions" },
          ].map((stage, i) => (
            <div key={stage.name} className="flex items-center gap-2">
              <div className="bg-gray-800 rounded-lg p-3 text-center min-w-[100px]">
                <div className="text-xl mb-1">{stage.icon}</div>
                <div className="text-sm font-medium">{stage.name}</div>
                <div className="text-xs text-gray-500">{stage.desc}</div>
              </div>
              {i < 4 && <span className="text-gray-600">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Runs */}
      <div className="border border-gray-800 rounded-lg">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold">Recent Runs</h3>
          {executionsData?.meta?.total !== undefined && (
            <span className="text-xs text-gray-500">{executionsData.meta.total} total</span>
          )}
        </div>

        {isLoading && (
          <div className="p-4 text-gray-400 animate-pulse">Loading...</div>
        )}

        {executionsData?.data?.length === 0 && !isLoading && (
          <div className="p-8 text-center text-gray-500">
            <p>No pipeline runs yet</p>
            <p className="text-sm mt-1">Click "Run Pipeline" to start</p>
          </div>
        )}

        {executionsData?.data && executionsData.data.length > 0 && (
          <div className="divide-y divide-gray-800">
            {executionsData.data.map((execution) => (
              <ExecutionRow key={execution.id} execution={execution} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface PlaybookExecution {
  id: string;
  playbookId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  currentStep: number;
  totalSteps: number;
  stepsCompleted: number;
  stepsFailed: number;
  error: string | null;
}

function ExecutionRow({ execution }: { execution: PlaybookExecution }) {
  const statusConfig: Record<string, { color: string; icon: string }> = {
    pending: { color: "bg-gray-700 text-gray-300", icon: "⏳" },
    running: { color: "bg-yellow-900/50 text-yellow-300", icon: "⚡" },
    completed: { color: "bg-green-900/50 text-green-300", icon: "✓" },
    failed: { color: "bg-red-900/50 text-red-300", icon: "✗" },
    cancelled: { color: "bg-gray-700 text-gray-300", icon: "⊘" },
  };

  const config = statusConfig[execution.status] || statusConfig.pending;
  const duration = execution.completedAt
    ? Math.round((new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000)
    : null;

  const progress = execution.totalSteps > 0
    ? Math.round((execution.stepsCompleted / execution.totalSteps) * 100)
    : 0;

  return (
    <div className="p-4 hover:bg-gray-800/30 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${config.color}`}>
            {execution.status === "running" && (
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
            )}
            {execution.status}
          </span>
          <span className="text-sm text-gray-400">
            {new Date(execution.startedAt).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {duration !== null && (
            <span className="text-gray-500">{duration}s</span>
          )}
          <span className="text-gray-400">
            {execution.stepsCompleted}/{execution.totalSteps} steps
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {execution.status === "running" && (
        <div className="h-1.5 bg-gray-700 rounded overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {execution.error && (
        <div className="mt-2 text-xs text-red-400 bg-red-900/20 rounded p-2">
          {execution.error}
        </div>
      )}
    </div>
  );
}
