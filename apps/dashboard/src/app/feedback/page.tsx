"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  FeedbackEvent,
  ConfidenceAdjustment,
  SystemLearning,
} from "@/lib/api";
import { useState } from "react";

export default function FeedbackPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);

  const { data: statsData } = useQuery({
    queryKey: ["feedbackStats"],
    queryFn: () => api.getFeedbackStats(),
  });

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ["pendingFeedback"],
    queryFn: () => api.getPendingFeedback({ limit: 50 }),
  });

  const { data: adjustmentsData, isLoading: adjustmentsLoading } = useQuery({
    queryKey: ["recentAdjustments"],
    queryFn: () => api.getRecentAdjustments({ limit: 20, days: 7 }),
  });

  const { data: adjustmentStatsData } = useQuery({
    queryKey: ["adjustmentStats"],
    queryFn: () => api.getAdjustmentStats({ days: 7 }),
  });

  const { data: learningsData, isLoading: learningsLoading } = useQuery({
    queryKey: ["systemLearnings"],
    queryFn: () => api.getSystemLearnings({ limit: 20 }),
  });

  const applyAdjustmentsMutation = useMutation({
    mutationFn: () => api.runFeedbackProcessor(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["feedbackStats"] });
      queryClient.invalidateQueries({ queryKey: ["pendingFeedback"] });
      queryClient.invalidateQueries({ queryKey: ["recentAdjustments"] });
      queryClient.invalidateQueries({ queryKey: ["adjustmentStats"] });
      const result = data.data;
      setMessage({
        type: "success",
        text: `Applied ${result.adjustmentsMade} adjustments from ${result.eventsProcessed} events`,
      });
      setTimeout(() => setMessage(null), 5000);
    },
    onError: (error) => {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to apply adjustments",
      });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const stats = statsData?.data;
  const adjustmentStats = adjustmentStatsData?.data;
  const pendingCount = stats?.pendingCount ?? 0;

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === "success"
            ? "bg-green-900/50 text-green-300 border border-green-800"
            : "bg-red-900/50 text-red-300 border border-red-800"
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Feedback Loop</h1>
          <p className="text-zinc-400 mt-1">Process feedback events to adjust confidence scores</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCorrectionForm(!showCorrectionForm)}
            className="px-4 py-2 border border-zinc-600 text-zinc-300 rounded-lg hover:bg-zinc-800"
          >
            {showCorrectionForm ? "Hide Correction Form" : "Manual Correction"}
          </button>
          <button
            onClick={() => applyAdjustmentsMutation.mutate()}
            disabled={applyAdjustmentsMutation.isPending || pendingCount === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {applyAdjustmentsMutation.isPending ? "Applying..." : `Apply Adjustments (${pendingCount})`}
          </button>
        </div>
      </div>

      {/* Manual Correction Form (collapsible) */}
      {showCorrectionForm && (
        <ManualCorrectionPanel
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["pendingFeedback"] });
            queryClient.invalidateQueries({ queryKey: ["feedbackStats"] });
            setShowCorrectionForm(false);
          }}
        />
      )}

      {/* Feedback Flow Visualization */}
      <div className="grid grid-cols-3 gap-4">
        {/* Pending Events */}
        <div className="border border-zinc-700 rounded-lg overflow-hidden">
          <div className="bg-yellow-500/10 border-b border-zinc-700 px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-yellow-400">Pending Events</h3>
              <p className="text-xs text-zinc-400">Awaiting processing</p>
            </div>
            <span className="text-2xl font-bold text-yellow-400">{pendingCount}</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {pendingLoading ? (
              <div className="p-8 text-center text-zinc-400">Loading...</div>
            ) : pendingData?.data && pendingData.data.length > 0 ? (
              <div className="divide-y divide-zinc-800">
                {pendingData.data.map((event) => (
                  <FeedbackEventRow key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500">
                <p>No pending events</p>
                <p className="text-xs mt-1">Run scout or verify to generate events</p>
              </div>
            )}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl text-zinc-600 mb-2">→</div>
            <button
              onClick={() => applyAdjustmentsMutation.mutate()}
              disabled={applyAdjustmentsMutation.isPending || pendingCount === 0}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {applyAdjustmentsMutation.isPending ? "Applying..." : "Apply"}
            </button>
            <div className="text-xs text-zinc-500 mt-2">
              Processes events and<br />updates confidence scores
            </div>
          </div>
        </div>

        {/* Adjustments */}
        <div className="border border-zinc-700 rounded-lg overflow-hidden">
          <div className="bg-green-500/10 border-b border-zinc-700 px-4 py-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-green-400">Adjustments Made</h3>
              <p className="text-xs text-zinc-400">Last 7 days</p>
            </div>
            <span className="text-2xl font-bold text-green-400">
              {adjustmentStats?.totalAdjustments ?? 0}
            </span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {adjustmentsLoading ? (
              <div className="p-8 text-center text-zinc-400">Loading...</div>
            ) : adjustmentsData?.data && adjustmentsData.data.length > 0 ? (
              <div className="divide-y divide-zinc-800">
                {adjustmentsData.data.map((adj) => (
                  <AdjustmentRow key={adj.id} adjustment={adj} />
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500">
                <p>No adjustments yet</p>
                <p className="text-xs mt-1">Apply pending events to create adjustments</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-5 gap-4">
        <StatsCard
          title="Processed (24h)"
          value={stats?.processedLast24h ?? 0}
          color="blue"
        />
        <StatsCard
          title="Adjustments (24h)"
          value={stats?.adjustmentsMadeLast24h ?? 0}
          color="green"
        />
        <StatsCard
          title="Positive"
          value={adjustmentStats?.positiveAdjustments ?? 0}
          subtitle="confidence up"
          color="green"
        />
        <StatsCard
          title="Negative"
          value={adjustmentStats?.negativeAdjustments ?? 0}
          subtitle="confidence down"
          color="red"
        />
        <StatsCard
          title="Avg Change"
          value={`${((adjustmentStats?.avgAdjustmentMagnitude ?? 0) * 100).toFixed(1)}%`}
          color="purple"
        />
      </div>

      {/* Pending by Type */}
      {stats?.byType && Object.keys(stats.byType).length > 0 && (
        <div className="bg-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Pending by Type</h3>
          <div className="flex gap-4">
            {Object.entries(stats.byType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  type === "verification_result" ? "bg-blue-400" :
                  type === "source_accuracy" ? "bg-green-400" :
                  type === "solution_outcome" ? "bg-purple-400" :
                  type === "manual_correction" ? "bg-yellow-400" : "bg-gray-400"
                }`} />
                <span className="text-sm text-zinc-400">{type.replace(/_/g, " ")}</span>
                <span className="text-sm font-medium text-zinc-200">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Learnings */}
      <div className="border border-zinc-700 rounded-lg overflow-hidden">
        <div className="bg-purple-500/10 border-b border-zinc-700 px-4 py-3">
          <h3 className="font-semibold text-purple-400">System Learnings</h3>
          <p className="text-xs text-zinc-400">Patterns discovered from feedback processing</p>
        </div>
        <div className="p-4">
          {learningsLoading ? (
            <div className="text-center text-zinc-400 py-4">Loading learnings...</div>
          ) : learningsData?.data && learningsData.data.length > 0 ? (
            <div className="space-y-4">
              {/* Group learnings by category */}
              {groupLearningsByCategory(learningsData.data).map(([category, learnings]) => (
                <div key={category} className="border border-zinc-800 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-zinc-300 mb-2 capitalize">
                    {category.replace(/_/g, " ")}
                  </h4>
                  <div className="space-y-2">
                    {learnings.slice(0, 3).map((learning) => (
                      <LearningRow key={learning.id} learning={learning} />
                    ))}
                    {learnings.length > 3 && (
                      <p className="text-xs text-zinc-500">+{learnings.length - 3} more learnings</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-zinc-500 py-4">
              <p>No learnings yet</p>
              <p className="text-xs mt-1">Process more feedback events to discover patterns</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function groupLearningsByCategory(learnings: SystemLearning[]): [string, SystemLearning[]][] {
  const groups: Record<string, SystemLearning[]> = {};
  for (const learning of learnings) {
    const category = learning.category || "other";
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(learning);
  }
  return Object.entries(groups);
}

function LearningRow({ learning }: { learning: SystemLearning }) {
  const successRate = learning.successRate !== null
    ? Math.round(learning.successRate * 100)
    : null;

  return (
    <div className="bg-zinc-800/50 rounded p-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-200 font-medium">{learning.learningKey}</div>
          {learning.insights && learning.insights.length > 0 && (
            <div className="mt-1 text-xs text-zinc-400 line-clamp-2">
              {learning.insights[0].insight}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          {successRate !== null && (
            <div className={`text-sm font-medium ${
              successRate >= 70 ? "text-green-400" :
              successRate >= 40 ? "text-yellow-400" : "text-red-400"
            }`}>
              {successRate}%
            </div>
          )}
          <div className="text-xs text-zinc-500">
            n={learning.sampleSize}
          </div>
        </div>
      </div>
      {learning.avgConfidence !== null && (
        <div className="mt-2 flex gap-4 text-xs text-zinc-500">
          <span>Avg confidence: {(learning.avgConfidence * 100).toFixed(0)}%</span>
          {learning.avgEffectiveness !== null && (
            <span>Avg effectiveness: {(learning.avgEffectiveness * 100).toFixed(0)}%</span>
          )}
        </div>
      )}
    </div>
  );
}

function StatsCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  color: "blue" | "green" | "yellow" | "red" | "purple";
}) {
  const colors = {
    blue: "bg-blue-500/10 text-blue-400",
    green: "bg-green-500/10 text-green-400",
    yellow: "bg-yellow-500/10 text-yellow-400",
    red: "bg-red-500/10 text-red-400",
    purple: "bg-purple-500/10 text-purple-400",
  };

  return (
    <div className={`rounded-lg p-4 ${colors[color]}`}>
      <div className="text-sm opacity-80">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {subtitle && <div className="text-xs opacity-60 mt-1">{subtitle}</div>}
    </div>
  );
}

function FeedbackEventRow({ event }: { event: FeedbackEvent }) {
  const typeColors = {
    verification_result: "bg-blue-500/20 text-blue-300",
    solution_outcome: "bg-purple-500/20 text-purple-300",
    source_accuracy: "bg-green-500/20 text-green-300",
    playbook_execution: "bg-orange-500/20 text-orange-300",
    manual_correction: "bg-yellow-500/20 text-yellow-300",
  };

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`px-1.5 py-0.5 rounded text-xs ${typeColors[event.feedbackType]}`}>
          {event.feedbackType.replace(/_/g, " ")}
        </span>
        <span className="text-xs text-zinc-500">
          {new Date(event.createdAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="text-sm text-zinc-300 truncate">
        {event.targetEntityType}: {event.targetEntityId}
      </div>
    </div>
  );
}

function AdjustmentRow({ adjustment }: { adjustment: ConfidenceAdjustment }) {
  const isPositive = adjustment.adjustmentDelta > 0;

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-sm font-medium ${isPositive ? "text-green-400" : "text-red-400"}`}>
          {isPositive ? "+" : ""}{(adjustment.adjustmentDelta * 100).toFixed(1)}%
        </span>
        <span className="text-xs text-zinc-500">
          {new Date(adjustment.createdAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="text-sm text-zinc-300 truncate">
        {adjustment.entityType}: {adjustment.entityId}
      </div>
      <div className="text-xs text-zinc-500">
        {adjustment.field}: {(adjustment.previousValue * 100).toFixed(0)}% → {(adjustment.newValue * 100).toFixed(0)}%
      </div>
    </div>
  );
}

function ManualCorrectionPanel({ onSuccess }: { onSuccess: () => void }) {
  const [entityType, setEntityType] = useState<string>("pattern");
  const [entityId, setEntityId] = useState<string>("");
  const [field, setField] = useState<string>("confidence");
  const [newValue, setNewValue] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const correctedValue = parseFloat(newValue);
      if (isNaN(correctedValue) || correctedValue < 0 || correctedValue > 1) {
        throw new Error("Value must be a number between 0 and 1");
      }
      return api.submitManualCorrection({
        targetEntityType: entityType,
        targetEntityId: entityId,
        field,
        correctedValue,
        reason,
      });
    },
    onSuccess: () => {
      setSubmitStatus("success");
      setEntityId("");
      setNewValue("");
      setReason("");
      onSuccess();
    },
    onError: (error) => {
      setSubmitStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
      setTimeout(() => setSubmitStatus("idle"), 5000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityId || !newValue || !reason) return;
    setSubmitStatus("submitting");
    submitMutation.mutate();
  };

  const entityTypes = [
    { value: "pattern", label: "Pattern", fields: ["confidence"] },
    { value: "source_health", label: "Source", fields: ["dynamicReliability", "baseReliability"] },
    { value: "solution", label: "Solution", fields: ["estimatedImpact", "feasibilityScore"] },
  ];

  const selectedEntityType = entityTypes.find(t => t.value === entityType);

  return (
    <div className="bg-zinc-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-zinc-100 mb-4">Submit Manual Correction</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Entity Type</label>
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                const newType = entityTypes.find(t => t.value === e.target.value);
                if (newType) setField(newType.fields[0]);
              }}
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {entityTypes.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Field</label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {selectedEntityType?.fields.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Entity ID</label>
            <input
              type="text"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="e.g., pat_abc123"
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">New Value (0-1)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="0.85"
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-zinc-300 mb-1">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this correction is needed..."
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitStatus === "submitting" || !entityId || !newValue || !reason}
              className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitStatus === "submitting" ? "Submitting..." : "Submit"}
            </button>
          </div>
        </div>

        {submitStatus === "success" && (
          <div className="text-green-400 text-sm">Correction submitted successfully</div>
        )}
        {submitStatus === "error" && (
          <div className="text-red-400 text-sm">Error: {errorMessage}</div>
        )}
      </form>
    </div>
  );
}
