"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Playbook, type PlaybookExecution, type PlaybookStepExecution } from "@/lib/api";
import Link from "next/link";

export default function PlaybookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;
  const [runMessage, setRunMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { data: playbookData, isLoading: playbookLoading, error: playbookError } = useQuery({
    queryKey: ["playbook", id],
    queryFn: () => api.getPlaybook(id),
  });

  const { data: executionsData, isLoading: executionsLoading } = useQuery({
    queryKey: ["playbook-executions", id],
    queryFn: () => api.getPlaybookExecutions(id, { limit: 10 }),
  });

  const enableMutation = useMutation({
    mutationFn: () => api.enablePlaybook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playbook", id] });
      queryClient.invalidateQueries({ queryKey: ["playbooks"] });
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => api.disablePlaybook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playbook", id] });
      queryClient.invalidateQueries({ queryKey: ["playbooks"] });
    },
  });

  const forkMutation = useMutation({
    mutationFn: () => api.forkPlaybook(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["playbooks"] });
      router.push(`/playbooks/${data.data.id}`);
    },
  });

  const runMutation = useMutation({
    mutationFn: () => api.runPlaybook(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["playbook-executions", id] });
      setRunMessage({ type: "success", text: `Execution started: ${data.data.executionId}` });
      setTimeout(() => setRunMessage(null), 5000);
    },
    onError: (error) => {
      setRunMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to start execution" });
      setTimeout(() => setRunMessage(null), 5000);
    },
  });

  if (playbookLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Loading playbook...</div>
      </div>
    );
  }

  if (playbookError || !playbookData) {
    return (
      <div className="space-y-4">
        <Link href="/playbooks" className="text-blue-400 hover:underline text-sm">
          &larr; Back to playbooks
        </Link>
        <div className="text-red-400 border border-red-800 rounded-lg p-4">
          <p className="font-medium">Error loading playbook</p>
          <p className="text-sm mt-1">{playbookError instanceof Error ? playbookError.message : "Not found"}</p>
        </div>
      </div>
    );
  }

  const playbook = playbookData.data;
  const executions = executionsData?.data || [];

  const statusColors: Record<string, string> = {
    draft: "bg-gray-700 text-gray-300",
    active: "bg-green-900/50 text-green-300",
    deprecated: "bg-red-900/50 text-red-300",
  };

  const triggerTypeIcons: Record<string, string> = {
    manual: "M",
    pattern_created: "P",
    issue_created: "I",
    schedule: "S",
    webhook: "W",
  };

  const stepActionIcons: Record<string, string> = {
    scout: "S",
    analyze: "A",
    brief: "B",
    verify: "V",
    plan: "P",
    notify: "N",
    condition: "?",
    wait: "W",
    human_review: "H",
  };

  return (
    <div className="space-y-6">
      {runMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          runMessage.type === "success"
            ? "bg-green-900/50 text-green-300 border border-green-800"
            : "bg-red-900/50 text-red-300 border border-red-800"
        }`}>
          {runMessage.text}
        </div>
      )}
      <div className="flex items-center justify-between">
        <Link href="/playbooks" className="text-blue-400 hover:underline text-sm">
          &larr; Back to playbooks
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || (playbookData?.data.steps?.length === 0)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {runMutation.isPending ? "Starting..." : "▶ Run"}
          </button>
          <button
            onClick={() => forkMutation.mutate()}
            disabled={forkMutation.isPending}
            className="px-3 py-1.5 text-sm border border-gray-700 rounded hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {forkMutation.isPending ? "Forking..." : "Fork"}
          </button>
          {playbook.isEnabled ? (
            <button
              onClick={() => disableMutation.mutate()}
              disabled={disableMutation.isPending}
              className="px-3 py-1.5 text-sm bg-red-900/50 text-red-300 rounded hover:bg-red-900/70 transition-colors disabled:opacity-50"
            >
              {disableMutation.isPending ? "Disabling..." : "Disable"}
            </button>
          ) : (
            <button
              onClick={() => enableMutation.mutate()}
              disabled={enableMutation.isPending}
              className="px-3 py-1.5 text-sm bg-green-900/50 text-green-300 rounded hover:bg-green-900/70 transition-colors disabled:opacity-50"
            >
              {enableMutation.isPending ? "Enabling..." : "Enable"}
            </button>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="border border-gray-800 rounded-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">{playbook.name}</h1>
              <span className={`text-xs px-2 py-1 rounded ${statusColors[playbook.playbookStatus] || statusColors.draft}`}>
                {playbook.playbookStatus}
              </span>
              {playbook.isEnabled && (
                <span className="text-xs px-2 py-1 rounded bg-blue-900/50 text-blue-300">Enabled</span>
              )}
            </div>
            <p className="text-gray-400">{playbook.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Times Used</span>
            <p className="font-medium">{playbook.timesUsed}</p>
          </div>
          <div>
            <span className="text-gray-500">Success Rate</span>
            <p className="font-medium">
              {playbook.successRate !== null ? `${(playbook.successRate * 100).toFixed(1)}%` : "N/A"}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Version</span>
            <p className="font-medium">{playbook.version}</p>
          </div>
          <div>
            <span className="text-gray-500">Created</span>
            <p className="font-medium">{new Date(playbook.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Triggers */}
      <div className="border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Triggers</h2>
        {playbook.triggers.length === 0 ? (
          <p className="text-gray-500 text-sm">No triggers configured</p>
        ) : (
          <div className="space-y-3">
            {playbook.triggers.map((trigger, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-gray-900/50 rounded-lg">
                <div className="w-8 h-8 flex items-center justify-center bg-gray-800 rounded text-sm font-mono">
                  {triggerTypeIcons[trigger.type] || "?"}
                </div>
                <div className="flex-1">
                  <div className="font-medium capitalize">{trigger.type.replace("_", " ")}</div>
                  {trigger.schedule && (
                    <div className="text-sm text-gray-400 mt-1">
                      Schedule: <code className="bg-gray-800 px-1 rounded">{trigger.schedule}</code>
                    </div>
                  )}
                  {trigger.conditions && (
                    <div className="text-sm text-gray-400 mt-1">
                      Conditions: {JSON.stringify(trigger.conditions)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Steps ({playbook.steps.length})</h2>
        {playbook.steps.length === 0 ? (
          <p className="text-gray-500 text-sm">No steps defined</p>
        ) : (
          <div className="space-y-3">
            {playbook.steps.map((step, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-gray-900/50 rounded-lg">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 flex items-center justify-center bg-gray-800 rounded text-sm">
                    {idx + 1}
                  </div>
                  {idx < playbook.steps.length - 1 && (
                    <div className="w-px h-4 bg-gray-700 mt-2" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{step.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-800 rounded text-gray-400">
                      {step.action.type}
                    </span>
                    {step.continueOnError && (
                      <span className="text-xs text-yellow-500">continue on error</span>
                    )}
                  </div>
                  {step.description && (
                    <p className="text-sm text-gray-400 mt-1">{step.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Applicable To */}
      <div className="border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Applicable To</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-gray-500 text-sm">Domains</span>
            <div className="flex gap-2 flex-wrap mt-2">
              {playbook.applicableTo.domains?.map((domain) => (
                <span key={domain} className="text-xs bg-gray-800 px-2 py-1 rounded">
                  {domain}
                </span>
              )) || <span className="text-gray-500 text-sm">Any</span>}
            </div>
          </div>
          <div>
            <span className="text-gray-500 text-sm">Pattern Types</span>
            <div className="flex gap-2 flex-wrap mt-2">
              {playbook.applicableTo.patternTypes?.map((type) => (
                <span key={type} className="text-xs bg-gray-800 px-2 py-1 rounded">
                  {type}
                </span>
              )) || <span className="text-gray-500 text-sm">Any</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Executions */}
      <div className="border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Executions</h2>
          {executionsData && executionsData.meta.total > 10 && (
            <Link href={`/playbooks/${id}/executions`} className="text-blue-400 hover:underline text-sm">
              View all ({executionsData.meta.total})
            </Link>
          )}
        </div>
        {executionsLoading ? (
          <div className="animate-pulse text-gray-400 text-sm">Loading executions...</div>
        ) : executions.length === 0 ? (
          <p className="text-gray-500 text-sm">No executions yet</p>
        ) : (
          <div className="space-y-2">
            {executions.map((execution) => (
              <ExecutionRow key={execution.id} execution={execution} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExecutionRow({ execution }: { execution: PlaybookExecution }) {
  const statusColors: Record<string, string> = {
    pending: "bg-gray-700 text-gray-300",
    running: "bg-blue-900/50 text-blue-300",
    paused: "bg-yellow-900/50 text-yellow-300",
    completed: "bg-green-900/50 text-green-300",
    failed: "bg-red-900/50 text-red-300",
    cancelled: "bg-gray-700 text-gray-300",
  };

  return (
    <Link
      href={`/playbooks/executions/${execution.id}`}
      className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className={`text-xs px-2 py-1 rounded ${statusColors[execution.status]}`}>
          {execution.status}
        </span>
        <span className="text-sm text-gray-400">
          {execution.currentStep}/{execution.totalSteps} steps
        </span>
      </div>
      <div className="text-sm text-gray-500">
        {new Date(execution.startedAt).toLocaleString()}
      </div>
    </Link>
  );
}
