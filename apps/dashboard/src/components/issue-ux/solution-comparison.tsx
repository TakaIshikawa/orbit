"use client";

import { useState } from "react";

interface SolutionLike {
  id: string;
  title: string;
  summary?: string;
  solutionType: string;
  feasibilityScore?: number | null;
  impactScore?: number | null;
  components?: Array<{ name: string; complexity?: string }>;
  risks?: Array<{ impact?: string }>;
  estimatedImpact?: { timeToImpact?: string };
}

interface SolutionComparisonProps {
  solutions: SolutionLike[];
  onSelect?: (solutionId: string) => void;
}

export function SolutionComparison({ solutions, onSelect }: SolutionComparisonProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(solutions.slice(0, 3).map((s) => s.id))
  );

  if (solutions.length < 2) {
    return null;
  }

  const selectedSolutions = solutions.filter((s) => selectedIds.has(s.id));

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 2) next.delete(id);
      } else {
        if (next.size < 4) next.add(id);
      }
      return next;
    });
  };

  const getScoreColor = (score: number | null | undefined, invert = false) => {
    if (score === undefined || score === null) return "text-gray-500";
    const threshold = invert ? 1 - score : score;
    if (threshold >= 0.7) return "text-green-400";
    if (threshold >= 0.4) return "text-yellow-400";
    return "text-red-400";
  };

  const getCostEstimate = (solution: SolutionLike) => {
    const complexity = solution.components?.reduce((acc, c) => {
      if (c.complexity === "high") return acc + 3;
      if (c.complexity === "medium") return acc + 2;
      return acc + 1;
    }, 0) || 0;

    if (complexity >= 6) return { label: "$$$", color: "text-red-400" };
    if (complexity >= 3) return { label: "$$", color: "text-yellow-400" };
    return { label: "$", color: "text-green-400" };
  };

  const getRiskCount = (solution: SolutionLike) => {
    const major = solution.risks?.filter((r) => r.impact === "high" || r.impact === "critical").length || 0;
    return { major, total: solution.risks?.length || 0 };
  };

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Compare Solutions</h3>
        <span className="text-xs text-gray-500">Select 2-4 to compare</span>
      </div>

      {/* Solution Selector */}
      <div className="p-3 border-b border-gray-700 flex flex-wrap gap-2">
        {solutions.map((solution) => (
          <button
            key={solution.id}
            onClick={() => toggleSelection(solution.id)}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${
              selectedIds.has(solution.id)
                ? "bg-cyan-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {solution.title.slice(0, 25)}{solution.title.length > 25 ? "..." : ""}
          </button>
        ))}
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-3 text-left text-gray-500 font-medium w-32">Metric</th>
              {selectedSolutions.map((s) => (
                <th key={s.id} className="p-3 text-center text-gray-300 font-medium">
                  <div className="truncate max-w-[150px]" title={s.title}>
                    {s.title.slice(0, 20)}{s.title.length > 20 ? "..." : ""}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Feasibility */}
            <tr className="border-b border-gray-800">
              <td className="p-3 text-gray-400">Feasibility</td>
              {selectedSolutions.map((s) => (
                <td key={s.id} className="p-3 text-center">
                  <span className={`font-bold ${getScoreColor(s.feasibilityScore)}`}>
                    {s.feasibilityScore ? `${Math.round(s.feasibilityScore * 100)}%` : "—"}
                  </span>
                </td>
              ))}
            </tr>

            {/* Impact */}
            <tr className="border-b border-gray-800">
              <td className="p-3 text-gray-400">Impact</td>
              {selectedSolutions.map((s) => (
                <td key={s.id} className="p-3 text-center">
                  <span className={`font-bold ${getScoreColor(s.impactScore)}`}>
                    {s.impactScore ? `${Math.round(s.impactScore * 100)}%` : "—"}
                  </span>
                </td>
              ))}
            </tr>

            {/* Time to Impact */}
            <tr className="border-b border-gray-800">
              <td className="p-3 text-gray-400">Time to Impact</td>
              {selectedSolutions.map((s) => (
                <td key={s.id} className="p-3 text-center text-gray-300">
                  {s.estimatedImpact?.timeToImpact || "Unknown"}
                </td>
              ))}
            </tr>

            {/* Cost */}
            <tr className="border-b border-gray-800">
              <td className="p-3 text-gray-400">Est. Cost</td>
              {selectedSolutions.map((s) => {
                const cost = getCostEstimate(s);
                return (
                  <td key={s.id} className="p-3 text-center">
                    <span className={`font-bold ${cost.color}`}>{cost.label}</span>
                  </td>
                );
              })}
            </tr>

            {/* Risks */}
            <tr className="border-b border-gray-800">
              <td className="p-3 text-gray-400">Risks</td>
              {selectedSolutions.map((s) => {
                const risks = getRiskCount(s);
                return (
                  <td key={s.id} className="p-3 text-center">
                    {risks.major > 0 ? (
                      <span className="text-red-400">{risks.major} major</span>
                    ) : risks.total > 0 ? (
                      <span className="text-yellow-400">{risks.total} minor</span>
                    ) : (
                      <span className="text-green-400">None</span>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Components */}
            <tr>
              <td className="p-3 text-gray-400">Components</td>
              {selectedSolutions.map((s) => (
                <td key={s.id} className="p-3 text-center text-gray-300">
                  {s.components?.length || 0} parts
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Recommendation */}
      {selectedSolutions.length >= 2 && (
        <div className="p-3 bg-gray-800/50 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-1">Recommendation</div>
          {(() => {
            const best = selectedSolutions.reduce((a, b) => {
              const scoreA = (a.feasibilityScore || 0) * 0.4 + (a.impactScore || 0) * 0.6;
              const scoreB = (b.feasibilityScore || 0) * 0.4 + (b.impactScore || 0) * 0.6;
              return scoreA > scoreB ? a : b;
            });
            return (
              <div className="text-sm text-cyan-400">
                <span className="font-semibold">{best.title}</span>
                <span className="text-gray-400 ml-2">— Best balance of feasibility and impact</span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
