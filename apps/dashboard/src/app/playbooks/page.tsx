"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Playbook } from "@/lib/api";
import Link from "next/link";

const PLAYBOOK_TEMPLATES = [
  {
    id: "investigation",
    name: "Investigation",
    description: "Scout for patterns, analyze them, and verify claims",
    steps: [
      { name: "Scout for patterns", action: { type: "scout", config: { maxPatterns: 10 } } },
      { name: "Analyze patterns", action: { type: "analyze", config: {} } },
      { name: "Verify claims", action: { type: "verify", config: { maxClaims: 5 } } },
    ],
    triggers: [{ type: "manual" }],
  },
  {
    id: "full-pipeline",
    name: "Full Pipeline",
    description: "Complete discovery, analysis, solution generation, and verification",
    steps: [
      { name: "Discover patterns", action: { type: "scout", config: { maxPatterns: 20 } } },
      { name: "Synthesize issues", action: { type: "analyze", config: {} } },
      { name: "Generate solutions", action: { type: "plan", config: { maxSolutions: 5 } } },
      { name: "Verify key claims", action: { type: "verify", config: { maxClaims: 3 } } },
    ],
    triggers: [{ type: "manual" }, { type: "schedule", schedule: "0 6 * * 1" }],
  },
  {
    id: "verification",
    name: "Verification Only",
    description: "Cross-reference all patterns against external sources",
    steps: [
      { name: "Cross-reference all patterns", action: { type: "verify", config: { maxClaims: 10, maxSources: 5 } } },
      { name: "Notify on completion", action: { type: "notify", config: { channel: "console", message: "Verification complete" } } },
    ],
    triggers: [{ type: "manual" }],
  },
];

export default function PlaybooksPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["playbooks"],
    queryFn: () => api.getPlaybooks(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deletePlaybook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playbooks"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Playbooks</h1>
          <p className="text-gray-400">Automated workflows for pattern discovery and analysis</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors"
        >
          New Playbook
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-gray-400">Loading playbooks...</div>
        </div>
      )}

      {error && (
        <div className="text-red-400 border border-red-800 rounded-lg p-4">
          <p className="font-medium">Error loading playbooks</p>
          <p className="text-sm mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">No playbooks yet</p>
          <p className="text-sm text-gray-500 mb-4">Playbooks automate your pattern discovery and analysis workflows</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Create Your First Playbook
          </button>
        </div>
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="text-sm text-gray-500">{data.meta.total} playbooks found</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.data.map((playbook) => (
              <PlaybookCard
                key={playbook.id}
                playbook={playbook}
                onDelete={() => deleteMutation.mutate(playbook.id)}
              />
            ))}
          </div>
        </>
      )}

      {showCreateModal && (
        <CreatePlaybookModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ["playbooks"] });
          }}
        />
      )}
    </div>
  );
}

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Daily at 6 AM", value: "0 6 * * *" },
  { label: "Weekly (Mon 6 AM)", value: "0 6 * * 1" },
  { label: "Custom", value: "custom" },
];

interface TriggerConfig {
  type: string;
  schedule?: string;
}

function CreatePlaybookModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [triggers, setTriggers] = useState<TriggerConfig[]>([{ type: "manual" }]);
  const [schedulePreset, setSchedulePreset] = useState<string>("");
  const [customCron, setCustomCron] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasScheduleTrigger = triggers.some(t => t.type === "schedule");
  const hasManualTrigger = triggers.some(t => t.type === "manual");

  const toggleManualTrigger = () => {
    if (hasManualTrigger) {
      setTriggers(triggers.filter(t => t.type !== "manual"));
    } else {
      setTriggers([...triggers, { type: "manual" }]);
    }
  };

  const toggleScheduleTrigger = () => {
    if (hasScheduleTrigger) {
      setTriggers(triggers.filter(t => t.type !== "schedule"));
      setSchedulePreset("");
      setCustomCron("");
    } else {
      setTriggers([...triggers, { type: "schedule", schedule: "0 6 * * *" }]);
      setSchedulePreset("0 6 * * *");
    }
  };

  const updateSchedule = (preset: string) => {
    setSchedulePreset(preset);
    if (preset !== "custom") {
      setTriggers(triggers.map(t =>
        t.type === "schedule" ? { ...t, schedule: preset } : t
      ));
    }
  };

  const updateCustomCron = (cron: string) => {
    setCustomCron(cron);
    setTriggers(triggers.map(t =>
      t.type === "schedule" ? { ...t, schedule: cron } : t
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (triggers.length === 0) {
      setError("At least one trigger is required");
      return;
    }
    if (hasScheduleTrigger) {
      const scheduleTrigger = triggers.find(t => t.type === "schedule");
      if (!scheduleTrigger?.schedule) {
        setError("Schedule trigger requires a cron expression");
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const template = selectedTemplate
        ? PLAYBOOK_TEMPLATES.find(t => t.id === selectedTemplate)
        : null;

      await api.createPlaybook({
        name: name.trim(),
        description: description.trim() || (template?.description ?? "Custom playbook"),
        steps: template?.steps ?? [],
        triggers: triggers,
        applicableTo: {},
        playbookStatus: "draft",
      });

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create playbook");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Create New Playbook</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Playbook"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this playbook do?"
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Triggers Section */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Triggers</label>
            <div className="space-y-3">
              {/* Manual Trigger */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleManualTrigger}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    hasManualTrigger
                      ? "border-blue-500 bg-blue-900/30 text-blue-300"
                      : "border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  Manual
                </button>
                <span className="text-xs text-gray-500">Run on demand via UI or API</span>
              </div>

              {/* Schedule Trigger */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleScheduleTrigger}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      hasScheduleTrigger
                        ? "border-green-500 bg-green-900/30 text-green-300"
                        : "border-gray-700 text-gray-400 hover:border-gray-600"
                    }`}
                  >
                    Schedule
                  </button>
                  <span className="text-xs text-gray-500">Run on a cron schedule</span>
                </div>

                {hasScheduleTrigger && (
                  <div className="ml-4 p-3 bg-gray-800/50 rounded-lg space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {CRON_PRESETS.map(preset => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => updateSchedule(preset.value)}
                          className={`px-2 py-1 text-xs rounded border transition-colors ${
                            schedulePreset === preset.value
                              ? "border-green-500 bg-green-900/30 text-green-300"
                              : "border-gray-700 text-gray-400 hover:border-gray-600"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    {schedulePreset === "custom" && (
                      <input
                        type="text"
                        value={customCron}
                        onChange={e => updateCustomCron(e.target.value)}
                        placeholder="0 */6 * * *"
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-green-500"
                      />
                    )}
                    <div className="text-xs text-gray-500">
                      Cron: <code className="bg-gray-700 px-1 rounded">{triggers.find(t => t.type === "schedule")?.schedule || "not set"}</code>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Template Selection */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Template (optional)</label>
            <div className="space-y-2">
              {PLAYBOOK_TEMPLATES.map(template => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplate(selectedTemplate === template.id ? null : template.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedTemplate === template.id
                      ? "border-blue-500 bg-blue-900/30"
                      : "border-gray-700 hover:border-gray-600"
                  }`}
                >
                  <div className="font-medium">{template.name}</div>
                  <div className="text-sm text-gray-400">{template.description}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {template.steps.length} steps: {template.steps.map(s => s.action.type).join(" → ")}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
            >
              {isSubmitting ? "Creating..." : "Create Playbook"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlaybookCard({ playbook, onDelete }: { playbook: Playbook; onDelete: () => void }) {
  const statusColors: Record<string, string> = {
    draft: "bg-gray-700 text-gray-300",
    active: "bg-green-900/50 text-green-300",
    deprecated: "bg-red-900/50 text-red-300",
  };

  return (
    <div className="border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded ${statusColors[playbook.playbookStatus] || statusColors.draft}`}>
            {playbook.playbookStatus}
          </span>
          {playbook.isEnabled && (
            <span className="text-xs px-2 py-1 rounded bg-blue-900/50 text-blue-300">Enabled</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{playbook.timesUsed} uses</span>
          <button
            onClick={(e) => {
              e.preventDefault();
              if (confirm("Delete this playbook?")) onDelete();
            }}
            className="text-gray-500 hover:text-red-400 transition-colors"
            title="Delete"
          >
            ×
          </button>
        </div>
      </div>

      <Link href={`/playbooks/${playbook.id}`} className="block">
        <h3 className="font-semibold hover:text-blue-400 transition-colors">{playbook.name}</h3>
        <p className="text-gray-400 text-sm mt-1 line-clamp-2">{playbook.description}</p>

        {/* Steps preview */}
        {playbook.steps && playbook.steps.length > 0 && (
          <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
            <span>{playbook.steps.length} steps:</span>
            <span className="text-gray-400 truncate">
              {playbook.steps.slice(0, 3).map(s => s.action.type).join(" → ")}
              {playbook.steps.length > 3 && " ..."}
            </span>
          </div>
        )}

        {/* Triggers preview */}
        {playbook.triggers && playbook.triggers.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            {playbook.triggers.slice(0, 3).map((trigger, idx) => (
              <span key={idx} className="text-xs text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded">
                {trigger.type.replace("_", " ")}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-xs">
          {playbook.successRate !== null ? (
            <span className="text-green-400">
              {(playbook.successRate * 100).toFixed(0)}% success rate
            </span>
          ) : (
            <span className="text-gray-500">No success data</span>
          )}
          <span className="text-gray-500">
            {new Date(playbook.createdAt).toLocaleDateString()}
          </span>
        </div>
      </Link>
    </div>
  );
}
