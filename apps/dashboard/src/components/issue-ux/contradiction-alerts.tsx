"use client";

interface Alert {
  claim: string;
  source: string;
  severity: "high" | "medium" | "low";
}

interface Contradiction {
  claim: string;
  sources: Array<{ name: string; position: "supports" | "contradicts" }>;
  severity: "high" | "medium" | "low";
}

interface ContradictionAlertsProps {
  alerts: Alert[];
}

export function ContradictionAlerts({ alerts }: ContradictionAlertsProps) {
  // Convert alerts to contradictions format
  const contradictions: Contradiction[] = alerts.map((alert) => ({
    claim: alert.claim,
    sources: [
      { name: alert.source, position: "contradicts" as const },
      { name: "Other sources", position: "supports" as const },
    ],
    severity: alert.severity,
  }));

  if (contradictions.length === 0) {
    return null;
  }

  const severityColors = {
    high: { border: "border-red-500/50", bg: "bg-red-900/20", icon: "text-red-400" },
    medium: { border: "border-yellow-500/50", bg: "bg-yellow-900/20", icon: "text-yellow-400" },
    low: { border: "border-gray-500/50", bg: "bg-gray-800/50", icon: "text-gray-400" },
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-yellow-400">⚠️</span>
        <h3 className="text-sm font-semibold text-yellow-400">Conflicting Evidence</h3>
        <span className="text-xs text-gray-500">({contradictions.length} found)</span>
      </div>

      {contradictions.slice(0, 3).map((contradiction, index) => {
        const colors = severityColors[contradiction.severity];
        return (
          <div
            key={index}
            className={`border ${colors.border} ${colors.bg} rounded-lg p-3`}
          >
            <div className="flex items-start gap-3">
              <span className={`text-lg ${colors.icon}`}>
                {contradiction.severity === "high" ? "🔴" : contradiction.severity === "medium" ? "🟡" : "⚪"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 mb-2 line-clamp-2">{contradiction.claim}</p>

                <div className="space-y-1">
                  {contradiction.sources.map((source, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          source.position === "supports" ? "text-green-400" : "text-red-400"
                        }
                      >
                        {source.position === "supports" ? "✓" : "✗"}
                      </span>
                      <span className="text-gray-400">{source.name}</span>
                      <span className="text-gray-600">
                        {source.position === "supports" ? "supports" : "contradicts"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
              → View resolution analysis
            </button>
          </div>
        );
      })}

      {contradictions.length > 3 && (
        <button className="w-full text-center text-xs text-gray-500 hover:text-gray-300 py-2">
          Show {contradictions.length - 3} more contradictions
        </button>
      )}
    </div>
  );
}
