"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Agent, type AgentType } from "@/lib/api";

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.getAgents(),
  });

  const { data: agentTypesData } = useQuery({
    queryKey: ["agent-types"],
    queryFn: () => api.getAgentTypes(),
  });

  const invokeMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      api.invokeAgent(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.stopAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-gray-400">Manage and invoke autonomous agents</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors"
        >
          New Agent
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-gray-400">Loading agents...</div>
        </div>
      )}

      {error && (
        <div className="text-red-400 border border-red-800 rounded-lg p-4">
          <p className="font-medium">Error loading agents</p>
          <p className="text-sm mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">No agents created yet</p>
          <p className="text-sm text-gray-500">Create an agent to start autonomous operations</p>
        </div>
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="text-sm text-gray-500">{data.meta.total} agents found</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.data.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onInvoke={(input) => invokeMutation.mutate({ id: agent.id, input })}
                onStop={() => stopMutation.mutate(agent.id)}
                isInvoking={invokeMutation.isPending}
                isStopping={stopMutation.isPending}
              />
            ))}
          </div>
        </>
      )}

      {showCreateModal && agentTypesData && (
        <CreateAgentModal
          agentTypes={agentTypesData.data}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

function AgentCard({
  agent,
  onInvoke,
  onStop,
  isInvoking,
  isStopping,
}: {
  agent: Agent;
  onInvoke: (input: Record<string, unknown>) => void;
  onStop: () => void;
  isInvoking: boolean;
  isStopping: boolean;
}) {
  const [showInvokeModal, setShowInvokeModal] = useState(false);

  const statusColors: Record<string, string> = {
    active: "bg-green-900/50 text-green-300",
    stopped: "bg-gray-700 text-gray-300",
    error: "bg-red-900/50 text-red-300",
  };

  const typeColors: Record<string, string> = {
    scout: "bg-blue-900/50 text-blue-300",
    triage: "bg-purple-900/50 text-purple-300",
    analyst: "bg-orange-900/50 text-orange-300",
    planner: "bg-yellow-900/50 text-yellow-300",
    operator: "bg-green-900/50 text-green-300",
  };

  return (
    <>
      <div className="border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded ${typeColors[agent.agentType] || "bg-gray-800 text-gray-300"}`}>
              {agent.agentType}
            </span>
            <span className={`text-xs px-2 py-1 rounded ${statusColors[agent.status]}`}>
              {agent.status}
            </span>
          </div>
          <span className="text-xs text-gray-500">
            {agent.invocationCount} runs
          </span>
        </div>

        <h3 className="font-semibold text-lg">{agent.name}</h3>
        <p className="text-gray-400 text-sm mt-1 line-clamp-2">{agent.description}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {agent.lastInvokedAt
              ? `Last run: ${new Date(agent.lastInvokedAt).toLocaleDateString()}`
              : "Never invoked"}
          </div>
          <div className="flex gap-2">
            {agent.status === "active" ? (
              <button
                onClick={onStop}
                disabled={isStopping}
                className="text-xs px-3 py-1.5 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 disabled:opacity-50"
              >
                {isStopping ? "Stopping..." : "Stop"}
              </button>
            ) : (
              <button
                onClick={() => setShowInvokeModal(true)}
                disabled={isInvoking}
                className="text-xs px-3 py-1.5 rounded bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 disabled:opacity-50"
              >
                {isInvoking ? "Invoking..." : "Invoke"}
              </button>
            )}
          </div>
        </div>
      </div>

      {showInvokeModal && (
        <InvokeAgentModal
          agent={agent}
          onInvoke={(input) => {
            onInvoke(input);
            setShowInvokeModal(false);
          }}
          onClose={() => setShowInvokeModal(false)}
        />
      )}
    </>
  );
}

function CreateAgentModal({
  agentTypes,
  onClose,
}: {
  agentTypes: AgentType[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [agentType, setAgentType] = useState(agentTypes[0]?.type || "");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: () => api.createAgent({ name, agentType, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Agent</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
              placeholder="My Scout Agent"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Type</label>
            <select
              value={agentType}
              onChange={(e) => setAgentType(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
            >
              {agentTypes.map((type) => (
                <option key={type.type} value={type.type}>
                  {type.name} - {type.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white h-20"
              placeholder="Optional description..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!name || !agentType || createMutation.isPending}
            className="px-4 py-2 bg-white text-black rounded font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InvokeAgentModal({
  agent,
  onInvoke,
  onClose,
}: {
  agent: Agent;
  onInvoke: (input: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [inputJson, setInputJson] = useState("{}");
  const [parseError, setParseError] = useState<string | null>(null);

  const handleInvoke = () => {
    try {
      const input = JSON.parse(inputJson);
      setParseError(null);
      onInvoke(input);
    } catch {
      setParseError("Invalid JSON");
    }
  };

  const inputPlaceholders: Record<string, string> = {
    scout: '{\n  "query": "AI policy regulations",\n  "domains": ["technology", "policy"]\n}',
    triage: '{\n  "patternIds": ["pattern-1", "pattern-2"]\n}',
    analyst: '{\n  "issueId": "issue-123"\n}',
    planner: '{\n  "situationModelId": "sm-123"\n}',
    operator: '{\n  "decisionId": "decision-123"\n}',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-2">Invoke {agent.name}</h2>
        <p className="text-sm text-gray-400 mb-4">Type: {agent.agentType}</p>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Input (JSON)</label>
          <textarea
            value={inputJson}
            onChange={(e) => {
              setInputJson(e.target.value);
              setParseError(null);
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white font-mono text-sm h-40"
            placeholder={inputPlaceholders[agent.agentType] || "{}"}
          />
          {parseError && (
            <p className="text-red-400 text-xs mt-1">{parseError}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleInvoke}
            className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
          >
            Invoke
          </button>
        </div>
      </div>
    </div>
  );
}
