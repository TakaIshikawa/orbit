"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  FeedbackEvent,
  ConfidenceAdjustment,
  SystemLearning,
  EvaluationRun,
} from "@/lib/api";
import Link from "next/link";
import { useState } from "react";

export default function FeedbackPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "pending" | "adjustments" | "learnings" | "evaluations" | "corrections">("overview");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { data: statsData, isLoading: statsLoading } = useQuery({
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
    queryFn: () => api.getSystemLearnings({ limit: 50 }),
  });

  const { data: evaluationsData, isLoading: evaluationsLoading } = useQuery({
    queryKey: ["evaluationRuns"],
    queryFn: () => api.getEvaluationRuns({ limit: 10 }),
  });

  const processNowMutation = useMutation({
    mutationFn: () => api.runFeedbackProcessor(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["feedbackStats"] });
      queryClient.invalidateQueries({ queryKey: ["pendingFeedback"] });
      queryClient.invalidateQueries({ queryKey: ["recentAdjustments"] });
      const result = data.data;
      setMessage({
        type: "success",
        text: `Processed ${result.eventsProcessed} events, ${result.adjustmentsMade} adjustments made`,
      });
      setTimeout(() => setMessage(null), 5000);
    },
    onError: (error) => {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to process feedback",
      });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const evaluateNowMutation = useMutation({
    mutationFn: () => api.runSystemEvaluation(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["evaluationRuns"] });
      queryClient.invalidateQueries({ queryKey: ["feedbackStats"] });
      setMessage({
        type: "success",
        text: `Evaluation completed: ${data.data.id}`,
      });
      setTimeout(() => setMessage(null), 5000);
    },
    onError: (error) => {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to run evaluation",
      });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const stats = statsData?.data;
  const adjustmentStats = adjustmentStatsData?.data;

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
          <h1 className="text-2xl font-bold text-zinc-100">Feedback System</h1>
          <p className="text-zinc-400 mt-1">Monitor the continuous learning and improvement loops</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => processNowMutation.mutate()}
            disabled={processNowMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {processNowMutation.isPending ? "Processing..." : "Process Now"}
          </button>
          <button
            onClick={() => evaluateNowMutation.mutate()}
            disabled={evaluateNowMutation.isPending}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {evaluateNowMutation.isPending ? "Evaluating..." : "Run Evaluation"}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-zinc-700">
        <nav className="flex gap-4">
          {[
            { id: "overview", label: "Overview" },
            { id: "pending", label: `Pending (${stats?.pendingCount ?? 0})` },
            { id: "adjustments", label: "Adjustments" },
            { id: "learnings", label: "Learnings" },
            { id: "evaluations", label: "Evaluations" },
            { id: "corrections", label: "Manual Corrections" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "text-blue-400 border-blue-400"
                  : "text-zinc-400 border-transparent hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4">
            <StatsCard
              title="Pending Events"
              value={stats?.pendingCount ?? 0}
              subtitle="awaiting processing"
              color="yellow"
            />
            <StatsCard
              title="Processed (24h)"
              value={stats?.processedLast24h ?? 0}
              subtitle="events processed"
              color="green"
            />
            <StatsCard
              title="Adjustments (24h)"
              value={stats?.adjustmentsMadeLast24h ?? 0}
              subtitle={`${adjustmentStats?.positiveAdjustments ?? 0} up, ${adjustmentStats?.negativeAdjustments ?? 0} down`}
              color="blue"
            />
            <StatsCard
              title="System Learnings"
              value={stats?.learningsCount ?? 0}
              subtitle="active learning entries"
              color="purple"
            />
          </div>

          {/* Feedback by Type */}
          <div className="bg-zinc-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-zinc-100 mb-4">Pending by Type</h3>
            <div className="grid grid-cols-5 gap-4">
              {stats?.byType && Object.entries(stats.byType).map(([type, count]) => (
                <div key={type} className="text-center">
                  <div className="text-2xl font-bold text-zinc-100">{count}</div>
                  <div className="text-xs text-zinc-400">{type.replace("_", " ")}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-zinc-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-zinc-100 mb-4">Recent Adjustments</h3>
              <div className="space-y-3">
                {adjustmentsData?.data.slice(0, 5).map((adj) => (
                  <AdjustmentRow key={adj.id} adjustment={adj} />
                ))}
                {(!adjustmentsData?.data || adjustmentsData.data.length === 0) && (
                  <p className="text-zinc-500 text-sm">No recent adjustments</p>
                )}
              </div>
            </div>

            <div className="bg-zinc-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-zinc-100 mb-4">Recent Evaluations</h3>
              <div className="space-y-3">
                {evaluationsData?.data.slice(0, 5).map((eval_) => (
                  <EvaluationRow key={eval_.id} evaluation={eval_} />
                ))}
                {(!evaluationsData?.data || evaluationsData.data.length === 0) && (
                  <p className="text-zinc-500 text-sm">No recent evaluations</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Tab */}
      {activeTab === "pending" && (
        <div className="bg-zinc-800 rounded-lg">
          {pendingLoading ? (
            <div className="p-8 text-center text-zinc-400">Loading...</div>
          ) : (
            <div className="divide-y divide-zinc-700">
              {pendingData?.data.map((event) => (
                <FeedbackEventRow key={event.id} event={event} />
              ))}
              {(!pendingData?.data || pendingData.data.length === 0) && (
                <div className="p-8 text-center text-zinc-500">No pending feedback events</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Adjustments Tab */}
      {activeTab === "adjustments" && (
        <div className="space-y-4">
          {/* Adjustment Stats */}
          <div className="grid grid-cols-4 gap-4">
            <StatsCard
              title="Total (7 days)"
              value={adjustmentStats?.totalAdjustments ?? 0}
              color="blue"
            />
            <StatsCard
              title="Positive"
              value={adjustmentStats?.positiveAdjustments ?? 0}
              subtitle="confidence increased"
              color="green"
            />
            <StatsCard
              title="Negative"
              value={adjustmentStats?.negativeAdjustments ?? 0}
              subtitle="confidence decreased"
              color="red"
            />
            <StatsCard
              title="Avg Magnitude"
              value={`${((adjustmentStats?.avgAdjustmentMagnitude ?? 0) * 100).toFixed(1)}%`}
              color="purple"
            />
          </div>

          <div className="bg-zinc-800 rounded-lg">
            {adjustmentsLoading ? (
              <div className="p-8 text-center text-zinc-400">Loading...</div>
            ) : (
              <div className="divide-y divide-zinc-700">
                {adjustmentsData?.data.map((adj) => (
                  <div key={adj.id} className="p-4">
                    <AdjustmentRow adjustment={adj} detailed />
                  </div>
                ))}
                {(!adjustmentsData?.data || adjustmentsData.data.length === 0) && (
                  <div className="p-8 text-center text-zinc-500">No adjustments in the last 7 days</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Learnings Tab */}
      {activeTab === "learnings" && (
        <div className="space-y-4">
          {learningsLoading ? (
            <div className="p-8 text-center text-zinc-400">Loading...</div>
          ) : (
            <div className="grid gap-4">
              {["pattern_verification", "solution_effectiveness", "source_reliability"].map((category) => {
                const categoryLearnings = learningsData?.data.filter(l => l.learningCategory === category) ?? [];
                if (categoryLearnings.length === 0) return null;

                return (
                  <div key={category} className="bg-zinc-800 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-zinc-100 mb-4 capitalize">
                      {category.replace(/_/g, " ")}
                    </h3>
                    <div className="space-y-3">
                      {categoryLearnings.map((learning) => (
                        <LearningRow key={learning.id} learning={learning} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {(!learningsData?.data || learningsData.data.length === 0) && (
                <div className="bg-zinc-800 rounded-lg p-8 text-center text-zinc-500">
                  No system learnings recorded yet
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Evaluations Tab */}
      {activeTab === "evaluations" && (
        <div className="bg-zinc-800 rounded-lg">
          {evaluationsLoading ? (
            <div className="p-8 text-center text-zinc-400">Loading...</div>
          ) : (
            <div className="divide-y divide-zinc-700">
              {evaluationsData?.data.map((eval_) => (
                <div key={eval_.id} className="p-6">
                  <EvaluationDetails evaluation={eval_} />
                </div>
              ))}
              {(!evaluationsData?.data || evaluationsData.data.length === 0) && (
                <div className="p-8 text-center text-zinc-500">No evaluations run yet</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manual Corrections Tab */}
      {activeTab === "corrections" && (
        <ManualCorrectionPanel onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["pendingFeedback"] });
          queryClient.invalidateQueries({ queryKey: ["feedbackStats"] });
        }} />
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
    <div className="p-4 flex items-center gap-4">
      <span className={`px-2 py-1 rounded text-xs ${typeColors[event.feedbackType]}`}>
        {event.feedbackType.replace("_", " ")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-200">
          {event.targetEntityType}:{event.targetEntityId.slice(0, 20)}...
        </div>
        <div className="text-xs text-zinc-500">
          from {event.sourceEntityType}:{event.sourceEntityId.slice(0, 15)}...
        </div>
      </div>
      <div className="text-xs text-zinc-500">
        {new Date(event.createdAt).toLocaleString()}
      </div>
    </div>
  );
}

function AdjustmentRow({ adjustment, detailed }: { adjustment: ConfidenceAdjustment; detailed?: boolean }) {
  const isPositive = adjustment.adjustmentDelta > 0;

  return (
    <div className="flex items-center gap-4">
      <span className={`text-lg ${isPositive ? "text-green-400" : "text-red-400"}`}>
        {isPositive ? "↑" : "↓"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-200">
          {adjustment.entityType}:{adjustment.entityId.slice(0, 15)}...
        </div>
        <div className="text-xs text-zinc-400">
          {adjustment.field}: {(adjustment.previousValue * 100).toFixed(1)}% → {(adjustment.newValue * 100).toFixed(1)}%
        </div>
        {detailed && (
          <div className="text-xs text-zinc-500 mt-1">{adjustment.reason}</div>
        )}
      </div>
      <div className="text-xs text-zinc-500">
        {new Date(adjustment.createdAt).toLocaleString()}
      </div>
    </div>
  );
}

function LearningRow({ learning }: { learning: SystemLearning }) {
  return (
    <div className="bg-zinc-700/50 rounded p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-zinc-200">{learning.learningKey}</span>
        <span className="text-xs text-zinc-500">{learning.sampleSize} samples</span>
      </div>
      <div className="grid grid-cols-4 gap-4 text-sm">
        {learning.successRate !== null && (
          <div>
            <span className="text-zinc-400">Success rate: </span>
            <span className="text-zinc-200">{(learning.successRate * 100).toFixed(1)}%</span>
          </div>
        )}
        {learning.avgConfidence !== null && (
          <div>
            <span className="text-zinc-400">Avg confidence: </span>
            <span className="text-zinc-200">{(learning.avgConfidence * 100).toFixed(1)}%</span>
          </div>
        )}
        {learning.avgEffectiveness !== null && (
          <div>
            <span className="text-zinc-400">Avg effectiveness: </span>
            <span className="text-zinc-200">{(learning.avgEffectiveness * 100).toFixed(1)}%</span>
          </div>
        )}
        {learning.avgAccuracy !== null && (
          <div>
            <span className="text-zinc-400">Avg accuracy: </span>
            <span className="text-zinc-200">{(learning.avgAccuracy * 100).toFixed(1)}%</span>
          </div>
        )}
      </div>
      {learning.insights.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-600">
          <div className="text-xs text-zinc-400 mb-1">Insights:</div>
          {learning.insights.slice(0, 2).map((insight, i) => (
            <div key={i} className="text-xs text-zinc-300">
              • {insight.insight} ({(insight.confidence * 100).toFixed(0)}% confidence)
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvaluationRow({ evaluation }: { evaluation: EvaluationRun }) {
  const statusColors = {
    completed: "text-green-400",
    running: "text-yellow-400",
    failed: "text-red-400",
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-zinc-200">{evaluation.runType}</div>
        <div className="text-xs text-zinc-500">
          {new Date(evaluation.startedAt).toLocaleString()}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {evaluation.alertCount > 0 && (
          <span className="text-xs text-red-400">{evaluation.alertCount} alerts</span>
        )}
        <span className={`text-xs ${statusColors[evaluation.status as keyof typeof statusColors] || "text-zinc-400"}`}>
          {evaluation.status}
        </span>
      </div>
    </div>
  );
}

function EvaluationDetails({ evaluation }: { evaluation: EvaluationRun }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-lg font-medium text-zinc-100">{evaluation.runType}</h4>
          <p className="text-sm text-zinc-400">
            {new Date(evaluation.startedAt).toLocaleString()}
            {evaluation.completedAt && ` - ${new Date(evaluation.completedAt).toLocaleString()}`}
          </p>
        </div>
        <span className={`px-2 py-1 rounded text-xs ${
          evaluation.status === "completed" ? "bg-green-500/20 text-green-300" :
          evaluation.status === "failed" ? "bg-red-500/20 text-red-300" :
          "bg-yellow-500/20 text-yellow-300"
        }`}>
          {evaluation.status}
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {evaluation.metrics.patternCount !== undefined && (
          <div className="bg-zinc-700/50 rounded p-3">
            <div className="text-xs text-zinc-400">Patterns</div>
            <div className="text-lg font-bold text-zinc-100">{evaluation.metrics.patternCount}</div>
            {evaluation.metrics.avgPatternConfidence !== undefined && (
              <div className="text-xs text-zinc-400">
                {(evaluation.metrics.avgPatternConfidence * 100).toFixed(1)}% avg confidence
              </div>
            )}
          </div>
        )}
        {evaluation.metrics.sourceCount !== undefined && (
          <div className="bg-zinc-700/50 rounded p-3">
            <div className="text-xs text-zinc-400">Sources</div>
            <div className="text-lg font-bold text-zinc-100">{evaluation.metrics.sourceCount}</div>
            {evaluation.metrics.healthySourceRate !== undefined && (
              <div className="text-xs text-zinc-400">
                {(evaluation.metrics.healthySourceRate * 100).toFixed(1)}% healthy
              </div>
            )}
          </div>
        )}
        {evaluation.metrics.solutionCount !== undefined && (
          <div className="bg-zinc-700/50 rounded p-3">
            <div className="text-xs text-zinc-400">Solutions</div>
            <div className="text-lg font-bold text-zinc-100">{evaluation.metrics.solutionCount}</div>
            {evaluation.metrics.avgSolutionEffectiveness !== undefined && (
              <div className="text-xs text-zinc-400">
                {(evaluation.metrics.avgSolutionEffectiveness * 100).toFixed(1)}% effectiveness
              </div>
            )}
          </div>
        )}
        {evaluation.metrics.feedbackPending !== undefined && (
          <div className="bg-zinc-700/50 rounded p-3">
            <div className="text-xs text-zinc-400">Feedback</div>
            <div className="text-lg font-bold text-zinc-100">{evaluation.metrics.feedbackPending}</div>
            <div className="text-xs text-zinc-400">pending</div>
          </div>
        )}
      </div>

      {/* Alerts */}
      {evaluation.alertCount > 0 && (
        <div className="mb-4">
          <div className="text-sm text-red-400 font-medium">
            {evaluation.alertCount} alert{evaluation.alertCount !== 1 ? "s" : ""} generated
          </div>
        </div>
      )}

      {/* Recommendations */}
      {evaluation.recommendations.length > 0 && (
        <div>
          <div className="text-sm text-zinc-400 mb-2">Recommendations:</div>
          <ul className="space-y-1">
            {evaluation.recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-zinc-300 flex gap-2">
                <span className="text-blue-400">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
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
      setTimeout(() => setSubmitStatus("idle"), 3000);
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
    <div className="space-y-6">
      <div className="bg-zinc-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-zinc-100 mb-2">Submit Manual Correction</h3>
        <p className="text-sm text-zinc-400 mb-6">
          Manually adjust confidence or reliability scores when you have information that the
          automated system may not have captured. Corrections are processed through the feedback
          loop and will inform future system learning.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Entity Type */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Entity Type
              </label>
              <select
                value={entityType}
                onChange={(e) => {
                  setEntityType(e.target.value);
                  const newType = entityTypes.find(t => t.value === e.target.value);
                  if (newType) setField(newType.fields[0]);
                }}
                className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-200
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {entityTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            {/* Field to Adjust */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Field to Adjust
              </label>
              <select
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-200
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {selectedEntityType?.fields.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Entity ID */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Entity ID
            </label>
            <input
              type="text"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder={`e.g., ${entityType === "pattern" ? "ptn_abc123" : entityType === "source_health" ? "reuters.com" : "sol_xyz789"}`}
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-200
                       placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* New Value */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              New Value (0.0 - 1.0)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="e.g., 0.85"
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-200
                       placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Enter a value between 0 (0%) and 1 (100%)
            </p>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Reason for Correction
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this correction is needed..."
              rows={3}
              className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-200
                       placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Submit Button */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={submitStatus === "submitting" || !entityId || !newValue || !reason}
              className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitStatus === "submitting" ? "Submitting..." : "Submit Correction"}
            </button>

            {submitStatus === "success" && (
              <span className="text-green-400 text-sm">
                Correction submitted successfully
              </span>
            )}

            {submitStatus === "error" && (
              <span className="text-red-400 text-sm">
                Error: {errorMessage}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Info Panel */}
      <div className="bg-zinc-800/50 rounded-lg p-6">
        <h4 className="text-sm font-semibold text-zinc-300 mb-3">How Manual Corrections Work</h4>
        <ul className="space-y-2 text-sm text-zinc-400">
          <li className="flex gap-2">
            <span className="text-blue-400">1.</span>
            Corrections are submitted as feedback events
          </li>
          <li className="flex gap-2">
            <span className="text-blue-400">2.</span>
            The feedback processor applies the correction directly
          </li>
          <li className="flex gap-2">
            <span className="text-blue-400">3.</span>
            An adjustment record is created for audit purposes
          </li>
          <li className="flex gap-2">
            <span className="text-blue-400">4.</span>
            System learnings may be updated based on the pattern of corrections
          </li>
        </ul>
      </div>
    </div>
  );
}
