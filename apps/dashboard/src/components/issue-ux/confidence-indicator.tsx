"use client";

interface ConfidenceIndicatorProps {
  confidence: number;
  sourceCount: number;
  agreementCount: number;
  contradictionCount: number;
  highQualityCount?: number;
  lastUpdated?: string;
}

export function ConfidenceIndicator({
  confidence,
  sourceCount,
  agreementCount,
  contradictionCount,
  highQualityCount = 0,
  lastUpdated,
}: ConfidenceIndicatorProps) {
  const barWidth = Math.round(confidence * 100);
  const barColor = confidence >= 0.7 ? "bg-green-500" : confidence >= 0.4 ? "bg-yellow-500" : "bg-red-500";
  const textColor = confidence >= 0.7 ? "text-green-400" : confidence >= 0.4 ? "text-yellow-400" : "text-red-400";

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">Evidence Confidence</span>
        <span className={`text-2xl font-bold ${textColor}`}>{Math.round(confidence * 100)}%</span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Breakdown */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-600">├─</span>
          <span className="text-green-400">{agreementCount}</span>
          <span className="text-gray-400">sources agree</span>
        </div>

        {highQualityCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-600">├─</span>
            <span className="text-cyan-400">{highQualityCount}</span>
            <span className="text-gray-400">high-quality studies</span>
          </div>
        )}

        {contradictionCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-600">├─</span>
            <span className="text-red-400">{contradictionCount}</span>
            <span className="text-gray-400">contradiction{contradictionCount > 1 ? "s" : ""}</span>
          </div>
        )}

        {lastUpdated && (
          <div className="flex items-center gap-2">
            <span className="text-gray-600">└─</span>
            <span className="text-gray-400">Last updated: {formatDate(lastUpdated)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
