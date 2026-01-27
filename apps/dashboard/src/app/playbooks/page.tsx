"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PlaybookExecution } from "@/lib/api";
import Link from "next/link";

export default function DiscoverPage() {
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch recent discoveries (issues)
  const { data: issuesData, isLoading: issuesLoading } = useQuery({
    queryKey: ["recent-issues"],
    queryFn: () => api.getIssues({ limit: 5 }),
  });

  // Fetch recent pipeline executions
  const { data: executionsData, isLoading: executionsLoading } = useQuery({
    queryKey: ["playbook-executions"],
    queryFn: () => api.getAllPlaybookExecutions({ limit: 5 }),
    refetchInterval: 5000,
  });

  // Run discovery pipeline mutation
  const discoverMutation = useMutation({
    mutationFn: async (topicInput: string) => {
      // Find or create the discovery playbook
      const playbooks = await api.getPlaybooks();
      let discoveryPlaybook = playbooks.data.find(p => p.name === "Discovery Pipeline");

      if (!discoveryPlaybook) {
        const created = await api.createPlaybook({
          name: "Discovery Pipeline",
          description: "Scout and analyze to discover new issues",
          steps: [
            { name: "Discover patterns", action: { type: "scout", config: { topic: topicInput, maxPatterns: 20 } } },
            { name: "Synthesize issues", action: { type: "analyze", config: {} } },
          ],
          triggers: [{ type: "manual" }],
          applicableTo: {},
          playbookStatus: "active",
        });
        discoveryPlaybook = created.data;
      }

      return api.runPlaybook(discoveryPlaybook.id);
    },
    onSuccess: () => {
      setMessage({ type: "success", text: "Discovery started. New issues will appear shortly." });
      setTopic("");
      queryClient.invalidateQueries({ queryKey: ["playbook-executions"] });
      queryClient.invalidateQueries({ queryKey: ["recent-issues"] });
      setTimeout(() => setMessage(null), 5000);
    },
    onError: (error) => {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to start discovery" });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const hasRunningExecution = executionsData?.data?.some(e => e.status === "running" || e.status === "pending");

  const handleDiscover = () => {
    if (topic.trim()) {
      discoverMutation.mutate(topic.trim());
    }
  };

  return (
    <div className="space-y-8">
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

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Discover</h1>
        <p className="text-gray-400">Find new issues and opportunities for impact</p>
      </div>

      {/* Discovery Input */}
      <div className="border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-3">What do you want to explore?</h2>
        <p className="text-sm text-gray-400 mb-4">
          Enter a topic or domain to discover relevant issues, patterns, and opportunities for action.
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
            placeholder="e.g., climate adaptation, public health, education access..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleDiscover}
            disabled={discoverMutation.isPending || hasRunningExecution || !topic.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {discoverMutation.isPending ? (
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
              <>Discover</>
            )}
          </button>
        </div>

        {/* Quick Suggestions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-gray-500">Suggestions:</span>
          {[
            "AI governance",
            "biosecurity",
            "nuclear risk",
            "pandemic preparedness",
            "existential risk",
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setTopic(suggestion)}
              className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded hover:bg-gray-700 hover:text-white transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {/* Recent Discoveries */}
      <div className="border border-gray-800 rounded-lg">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold">Recent Discoveries</h3>
          <Link href="/issues" className="text-sm text-blue-400 hover:text-blue-300">
            View all issues
          </Link>
        </div>

        {issuesLoading && (
          <div className="p-4 text-gray-400 animate-pulse">Loading...</div>
        )}

        {issuesData?.data?.length === 0 && !issuesLoading && (
          <div className="p-8 text-center text-gray-500">
            <p>No issues discovered yet</p>
            <p className="text-sm mt-1">Enter a topic above to start discovering</p>
          </div>
        )}

        {issuesData?.data && issuesData.data.length > 0 && (
          <div className="divide-y divide-gray-800">
            {issuesData.data.map((issue) => (
              <Link
                key={issue.id}
                href={`/issues/${issue.id}`}
                className="block p-4 hover:bg-gray-800/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{issue.title}</h4>
                    <p className="text-sm text-gray-400 mt-1 line-clamp-1">{issue.summary}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {issue.affectedDomains.slice(0, 2).map((domain) => (
                        <span key={domain} className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-400">
                          {domain}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={`text-lg font-bold ${
                    issue.compositeScore >= 0.7 ? "text-red-400" :
                    issue.compositeScore >= 0.4 ? "text-yellow-400" : "text-green-400"
                  }`}>
                    {(issue.compositeScore * 100).toFixed(0)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Running/Recent Executions */}
      {executionsData?.data && executionsData.data.length > 0 && (
        <div className="border border-gray-800 rounded-lg">
          <div className="p-4 border-b border-gray-800">
            <h3 className="font-semibold">Discovery Activity</h3>
          </div>
          <div className="divide-y divide-gray-800">
            {executionsData.data.slice(0, 3).map((execution) => (
              <ExecutionRow key={execution.id} execution={execution} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExecutionRow({ execution }: { execution: PlaybookExecution }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    pending: { color: "bg-gray-700 text-gray-300", label: "Pending" },
    running: { color: "bg-yellow-900/50 text-yellow-300", label: "Discovering" },
    completed: { color: "bg-green-900/50 text-green-300", label: "Completed" },
    failed: { color: "bg-red-900/50 text-red-300", label: "Failed" },
    cancelled: { color: "bg-gray-700 text-gray-300", label: "Cancelled" },
  };

  const config = statusConfig[execution.status] || statusConfig.pending;
  const progress = execution.totalSteps > 0
    ? Math.round((execution.currentStep / execution.totalSteps) * 100)
    : 0;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${config.color}`}>
            {execution.status === "running" && (
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
            )}
            {config.label}
          </span>
          <span className="text-sm text-gray-500">
            {new Date(execution.startedAt).toLocaleString()}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {execution.currentStep}/{execution.totalSteps} steps
        </span>
      </div>

      {execution.status === "running" && (
        <div className="h-1.5 bg-gray-700 rounded overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {execution.error && (
        <div className="mt-2 text-xs text-red-400">
          {execution.error}
        </div>
      )}
    </div>
  );
}
