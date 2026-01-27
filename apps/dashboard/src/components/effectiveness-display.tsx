"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type SolutionEffectiveness } from "@/lib/api";

interface EffectivenessDisplayProps {
  solutionId: string;
  compact?: boolean;
}

export function EffectivenessDisplay({ solutionId, compact = false }: EffectivenessDisplayProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["solution-effectiveness", solutionId],
    queryFn: () => api.getSolutionEffectiveness(solutionId),
  });

  if (isLoading) {
    return <div className="animate-pulse bg-gray-800 rounded h-16 w-24" />;
  }

  const effectiveness = data?.data;

  if (!effectiveness || effectiveness.overallEffectivenessScore === null) {
    return compact ? (
      <span className="text-xs text-gray-500">No metrics</span>
    ) : (
      <div className="text-sm text-gray-500">No effectiveness data yet</div>
    );
  }

  const score = Math.round(effectiveness.overallEffectivenessScore * 100);
  const scoreColor = score >= 70 ? "text-green-400" : score >= 40 ? "text-yellow-400" : "text-red-400";

  if (compact) {
    return (
      <div className="text-right">
        <div className={`text-2xl font-bold ${scoreColor}`}>{score}%</div>
        <div className="text-xs text-gray-500">effectiveness</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className={`text-3xl font-bold ${scoreColor}`}>{score}%</div>
          <div className="text-xs text-gray-500">Overall Effectiveness</div>
        </div>

        {effectiveness.impactVariance !== null && (
          <div className="text-center border-l border-gray-700 pl-4">
            <div className={`text-xl font-bold ${
              effectiveness.impactVariance > 0 ? "text-green-400" :
              effectiveness.impactVariance < 0 ? "text-red-400" : "text-gray-400"
            }`}>
              {effectiveness.impactVariance > 0 ? "+" : ""}{(effectiveness.impactVariance * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500">vs Estimate</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-green-900/20 rounded-lg p-2">
          <div className="text-lg font-bold text-green-400">{effectiveness.metricsAchieved}</div>
          <div className="text-xs text-gray-500">Achieved</div>
        </div>
        <div className="bg-yellow-900/20 rounded-lg p-2">
          <div className="text-lg font-bold text-yellow-400">{effectiveness.metricsPartial}</div>
          <div className="text-xs text-gray-500">Partial</div>
        </div>
        <div className="bg-red-900/20 rounded-lg p-2">
          <div className="text-lg font-bold text-red-400">{effectiveness.metricsMissed}</div>
          <div className="text-xs text-gray-500">Missed</div>
        </div>
      </div>

      <div className="text-xs text-gray-500 text-center">
        {effectiveness.outcomeCount} outcome{effectiveness.outcomeCount !== 1 ? "s" : ""} recorded
      </div>
    </div>
  );
}

interface EffectivenessData {
  overallEffectivenessScore: number | null;
  metricsAchieved: number;
  metricsPartial: number;
  metricsMissed: number;
  impactVariance: number | null;
  outcomeCount: number;
}

export function EffectivenessDisplayInline({ effectiveness }: { effectiveness: EffectivenessData | null }) {
  if (!effectiveness || effectiveness.overallEffectivenessScore === null) {
    return <span className="text-xs text-gray-500">No metrics</span>;
  }

  const score = Math.round(effectiveness.overallEffectivenessScore * 100);
  const scoreColor = score >= 70 ? "text-green-400" : score >= 40 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="flex items-center gap-3">
      <span className={`text-xl font-bold ${scoreColor}`}>{score}%</span>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-green-400">{effectiveness.metricsAchieved} achieved</span>
        <span className="text-gray-600">|</span>
        <span className="text-yellow-400">{effectiveness.metricsPartial} partial</span>
        <span className="text-gray-600">|</span>
        <span className="text-red-400">{effectiveness.metricsMissed} missed</span>
      </div>
    </div>
  );
}
