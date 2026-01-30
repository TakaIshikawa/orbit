"use client";

import { useState } from "react";
import { ManagedSource } from "@/lib/api";

interface SourceSelectorProps {
  sources: ManagedSource[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  isLoading?: boolean;
}

export function SourceSelector({
  sources,
  selectedIds,
  onChange,
  isLoading = false,
}: SourceSelectorProps) {
  const [showAll, setShowAll] = useState(false);

  const toggleSource = (sourceId: string) => {
    if (selectedIds.includes(sourceId)) {
      onChange(selectedIds.filter((id) => id !== sourceId));
    } else {
      onChange([...selectedIds, sourceId]);
    }
  };

  const toggleAll = () => {
    if (selectedIds.length === sources.length) {
      onChange([]);
    } else {
      onChange(sources.map((s) => s.id));
    }
  };

  const displayedSources = showAll ? sources : sources.slice(0, 6);
  const hiddenCount = sources.length - displayedSources.length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <label className="block text-sm text-gray-400">Sources</label>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-24 bg-gray-800 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="space-y-2">
        <label className="block text-sm text-gray-400">Sources</label>
        <p className="text-sm text-gray-500">No managed sources available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm text-gray-400">Sources</label>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {selectedIds.length === sources.length ? "Deselect all" : "Select all"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {displayedSources.map((source) => {
          const isSelected = selectedIds.includes(source.id);
          const credibilityTier = source.debiasedScore >= 0.7 ? "high" : source.debiasedScore >= 0.5 ? "medium" : "low";
          const tierColors = {
            high: "border-green-600 bg-green-900/20",
            medium: "border-yellow-600 bg-yellow-900/20",
            low: "border-red-600 bg-red-900/20",
          };

          return (
            <button
              key={source.id}
              type="button"
              onClick={() => toggleSource(source.id)}
              className={`
                inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all
                ${isSelected
                  ? "bg-blue-900/50 border-blue-500 text-white"
                  : `${tierColors[credibilityTier]} text-gray-300 hover:bg-gray-700/50`
                }
              `}
            >
              <span className={`w-2 h-2 rounded-full ${
                isSelected ? "bg-blue-400" : credibilityTier === "high" ? "bg-green-400" : credibilityTier === "medium" ? "bg-yellow-400" : "bg-red-400"
              }`} />
              <span className="truncate max-w-[150px]">{source.name}</span>
              {isSelected && (
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          );
        })}
        {hiddenCount > 0 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
          >
            +{hiddenCount} more
          </button>
        )}
        {showAll && sources.length > 6 && (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
          >
            Show less
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500">
        {selectedIds.length} of {sources.length} sources selected
      </p>
    </div>
  );
}
