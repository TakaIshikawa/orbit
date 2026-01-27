"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type OutcomeCreateInput } from "@/lib/api";

interface OutcomeRecordingModalProps {
  solutionId: string;
  solutionTitle: string;
  isOpen: boolean;
  onClose: () => void;
  defaultType?: "metric_measurement" | "status_change" | "feedback" | "milestone";
}

export function OutcomeRecordingModal({
  solutionId,
  solutionTitle,
  isOpen,
  onClose,
  defaultType = "metric_measurement",
}: OutcomeRecordingModalProps) {
  const queryClient = useQueryClient();
  const [outcomeType, setOutcomeType] = useState<OutcomeCreateInput["outcomeType"]>(defaultType);
  const [metricName, setMetricName] = useState("");
  const [metricValue, setMetricValue] = useState("");
  const [metricTarget, setMetricTarget] = useState("");
  const [metricBaseline, setMetricBaseline] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSentiment, setFeedbackSentiment] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recordMutation = useMutation({
    mutationFn: (data: OutcomeCreateInput) => api.recordOutcome(solutionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["solution-outcomes", solutionId] });
      queryClient.invalidateQueries({ queryKey: ["solution-effectiveness", solutionId] });
      queryClient.invalidateQueries({ queryKey: ["myWork"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
      resetForm();
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to record outcome");
    },
  });

  const resetForm = () => {
    setOutcomeType(defaultType);
    setMetricName("");
    setMetricValue("");
    setMetricTarget("");
    setMetricBaseline("");
    setFeedbackText("");
    setFeedbackSentiment(0);
    setNotes("");
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const data: OutcomeCreateInput = {
      outcomeType,
      notes: notes || undefined,
    };

    if (outcomeType === "metric_measurement") {
      if (!metricName.trim()) {
        setError("Metric name is required");
        return;
      }
      if (!metricValue) {
        setError("Metric value is required");
        return;
      }
      data.metricName = metricName;
      data.metricValue = parseFloat(metricValue);
      if (metricTarget) data.metricTarget = parseFloat(metricTarget);
      if (metricBaseline) data.metricBaseline = parseFloat(metricBaseline);
    }

    if (outcomeType === "feedback") {
      if (!feedbackText.trim()) {
        setError("Feedback text is required");
        return;
      }
      data.feedbackText = feedbackText;
      data.feedbackSentiment = feedbackSentiment;
    }

    if (outcomeType === "status_change" || outcomeType === "milestone") {
      if (!notes.trim()) {
        setError("Notes are required for status changes and milestones");
        return;
      }
    }

    recordMutation.mutate(data);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="border-b border-gray-800 p-4">
          <h2 className="text-lg font-semibold">Record Outcome</h2>
          <p className="text-sm text-gray-400 truncate mt-1">For: {solutionTitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Outcome Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Outcome Type</label>
            <select
              value={outcomeType}
              onChange={(e) => setOutcomeType(e.target.value as OutcomeCreateInput["outcomeType"])}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="metric_measurement">Metric Measurement</option>
              <option value="status_change">Status Change</option>
              <option value="feedback">Feedback</option>
              <option value="milestone">Milestone</option>
            </select>
          </div>

          {/* Metric Fields */}
          {outcomeType === "metric_measurement" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Metric Name</label>
                <input
                  type="text"
                  value={metricName}
                  onChange={(e) => setMetricName(e.target.value)}
                  placeholder="e.g., Response Time, User Adoption Rate"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Value</label>
                  <input
                    type="number"
                    step="any"
                    value={metricValue}
                    onChange={(e) => setMetricValue(e.target.value)}
                    placeholder="Current"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Target</label>
                  <input
                    type="number"
                    step="any"
                    value={metricTarget}
                    onChange={(e) => setMetricTarget(e.target.value)}
                    placeholder="Goal"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Baseline</label>
                  <input
                    type="number"
                    step="any"
                    value={metricBaseline}
                    onChange={(e) => setMetricBaseline(e.target.value)}
                    placeholder="Start"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          {/* Feedback Fields */}
          {outcomeType === "feedback" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Feedback</label>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Describe the feedback received..."
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sentiment: {feedbackSentiment < -0.3 ? "Negative" : feedbackSentiment > 0.3 ? "Positive" : "Neutral"}
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-red-400 text-sm">-1</span>
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.1"
                    value={feedbackSentiment}
                    onChange={(e) => setFeedbackSentiment(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-green-400 text-sm">+1</span>
                </div>
              </div>
            </>
          )}

          {/* Notes (always shown) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Notes {(outcomeType === "status_change" || outcomeType === "milestone") && <span className="text-red-400">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                outcomeType === "status_change" ? "Describe the status change..." :
                outcomeType === "milestone" ? "Describe the milestone reached..." :
                "Additional notes (optional)"
              }
              rows={2}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                onClose();
              }}
              className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={recordMutation.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {recordMutation.isPending ? "Recording..." : "Record Outcome"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
