"use client";

interface AtAGlanceProps {
  issue: {
    headline?: string | null;
    summary: string;
    keyNumber?: string | null;
    scoreUrgency: number;
    scoreTractability: number;
    scoreNeglectedness: number;
    sources?: unknown[];
  };
  verificationStats?: {
    corroborated: number;
    contested: number;
    partial: number;
    total: number;
  };
  solutionCount?: number;
}

export function AtAGlance({ issue, verificationStats, solutionCount = 0 }: AtAGlanceProps) {
  // Generate human-readable urgency/tractability/neglectedness descriptions
  const getUrgencyLabel = (score: number) => {
    if (score >= 0.8) return { label: "CRITICAL", color: "text-red-400", bg: "bg-red-900/30" };
    if (score >= 0.6) return { label: "HIGH", color: "text-orange-400", bg: "bg-orange-900/30" };
    if (score >= 0.4) return { label: "MEDIUM", color: "text-yellow-400", bg: "bg-yellow-900/30" };
    return { label: "LOW", color: "text-green-400", bg: "bg-green-900/30" };
  };

  const getTractabilityLabel = (score: number) => {
    if (score >= 0.7) return { label: "SOLVABLE", color: "text-green-400", bg: "bg-green-900/30" };
    if (score >= 0.5) return { label: "CHALLENGING", color: "text-yellow-400", bg: "bg-yellow-900/30" };
    if (score >= 0.3) return { label: "DIFFICULT", color: "text-orange-400", bg: "bg-orange-900/30" };
    return { label: "VERY HARD", color: "text-red-400", bg: "bg-red-900/30" };
  };

  const getNeglectednessLabel = (score: number) => {
    if (score >= 0.7) return { label: "IGNORED", color: "text-red-400", bg: "bg-red-900/30" };
    if (score >= 0.5) return { label: "UNDERSERVED", color: "text-orange-400", bg: "bg-orange-900/30" };
    if (score >= 0.3) return { label: "SOME FOCUS", color: "text-yellow-400", bg: "bg-yellow-900/30" };
    return { label: "WELL-COVERED", color: "text-green-400", bg: "bg-green-900/30" };
  };

  const urgency = getUrgencyLabel(issue.scoreUrgency);
  const tractability = getTractabilityLabel(issue.scoreTractability);
  const neglectedness = getNeglectednessLabel(issue.scoreNeglectedness);

  // Calculate confidence based on verification stats
  const confidence = verificationStats && verificationStats.total > 0
    ? Math.round((verificationStats.corroborated / verificationStats.total) * 100)
    : null;

  return (
    <div className="bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎯</span>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">In 30 Seconds</h3>
      </div>

      {/* Summary Text */}
      <p className="text-gray-200 mb-4 leading-relaxed">
        {issue.headline || issue.summary}
        {issue.keyNumber && (
          <span className="ml-2 text-cyan-400 font-semibold">{issue.keyNumber}</span>
        )}
      </p>

      {/* Score Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`${urgency.bg} rounded-lg p-3 text-center border border-gray-700`}>
          <div className={`text-xs uppercase tracking-wide text-gray-400 mb-1`}>Urgency</div>
          <div className={`text-lg font-bold ${urgency.color}`}>{urgency.label}</div>
          <div className="text-xs text-gray-500">{Math.round(issue.scoreUrgency * 100)}%</div>
        </div>

        <div className={`${tractability.bg} rounded-lg p-3 text-center border border-gray-700`}>
          <div className={`text-xs uppercase tracking-wide text-gray-400 mb-1`}>Can Fix?</div>
          <div className={`text-lg font-bold ${tractability.color}`}>{tractability.label}</div>
          <div className="text-xs text-gray-500">{Math.round(issue.scoreTractability * 100)}%</div>
        </div>

        <div className={`${neglectedness.bg} rounded-lg p-3 text-center border border-gray-700`}>
          <div className={`text-xs uppercase tracking-wide text-gray-400 mb-1`}>Attention</div>
          <div className={`text-lg font-bold ${neglectedness.color}`}>{neglectedness.label}</div>
          <div className="text-xs text-gray-500">{Math.round(issue.scoreNeglectedness * 100)}%</div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-700 text-sm">
        {confidence !== null && (
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Confidence:</span>
            <span className={confidence >= 70 ? "text-green-400" : confidence >= 40 ? "text-yellow-400" : "text-red-400"}>
              {confidence}%
            </span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Solutions:</span>
          <span className={solutionCount > 0 ? "text-cyan-400" : "text-gray-400"}>
            {solutionCount}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Sources:</span>
          <span className="text-gray-300">{issue.sources?.length || 0}</span>
        </div>
      </div>
    </div>
  );
}
