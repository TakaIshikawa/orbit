"use client";

interface Source {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  credibility?: number;
}

interface SourceCredibilityProps {
  sources: Source[];
}

interface TierInfo {
  name: string;
  min: number;
  max: number;
  color: string;
  bgColor: string;
  examples: string;
}

const TIERS: TierInfo[] = [
  {
    name: "Tier 1",
    min: 0.8,
    max: 1.0,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500",
    examples: "WHO, Nature, Lancet, Cochrane",
  },
  {
    name: "Tier 2",
    min: 0.6,
    max: 0.8,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500",
    examples: "Regional journals, Major think tanks",
  },
  {
    name: "Tier 3",
    min: 0.4,
    max: 0.6,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500",
    examples: "News outlets, Working papers",
  },
  {
    name: "Tier 4",
    min: 0,
    max: 0.4,
    color: "text-gray-400",
    bgColor: "bg-gray-500",
    examples: "Blogs, Opinion pieces",
  },
];

export function SourceCredibility({ sources }: SourceCredibilityProps) {
  // Categorize sources by tier
  const categorized = TIERS.map((tier) => {
    const tierSources = sources.filter((s) => {
      const cred = s.credibility || 0.5;
      return cred >= tier.min && cred < tier.max;
    });
    return { ...tier, sources: tierSources, count: tierSources.length };
  });

  const maxCount = Math.max(...categorized.map((t) => t.count), 1);
  const totalSources = sources.length;

  // Calculate weighted credibility
  const avgCredibility =
    sources.length > 0
      ? sources.reduce((sum, s) => sum + (s.credibility || 0.5), 0) / sources.length
      : 0;

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">Source Quality</h3>
        <span className="text-xs text-gray-500">{totalSources} sources</span>
      </div>

      {/* Tier Bars */}
      <div className="space-y-2 mb-4">
        {categorized.map((tier) => (
          <div key={tier.name} className="flex items-center gap-2">
            <span className={`w-14 text-xs ${tier.color}`}>{tier.name}</span>
            <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${tier.bgColor} rounded-full transition-all duration-500`}
                style={{ width: `${(tier.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="w-8 text-xs text-right text-gray-400">{tier.count}</span>
          </div>
        ))}
      </div>

      {/* Source List (collapsed) */}
      <details className="group">
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 list-none flex items-center gap-1">
          <span className="group-open:rotate-90 transition-transform">▶</span>
          Show source details
        </summary>
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {sources.map((source) => {
            const cred = source.credibility || 0.5;
            const tier = TIERS.find((t) => cred >= t.min && cred < t.max) || TIERS[3];
            return (
              <div key={source.sourceId} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${tier.bgColor}`} />
                <span className="text-gray-400 flex-1 truncate">{source.sourceName}</span>
                <span className={tier.color}>{Math.round(cred * 100)}%</span>
              </div>
            );
          })}
        </div>
      </details>

      {/* Summary */}
      <div className="mt-3 pt-3 border-t border-gray-700 flex items-center justify-between">
        <span className="text-xs text-gray-500">Average Credibility</span>
        <span
          className={`text-sm font-bold ${
            avgCredibility >= 0.7
              ? "text-green-400"
              : avgCredibility >= 0.5
              ? "text-yellow-400"
              : "text-red-400"
          }`}
        >
          {Math.round(avgCredibility * 100)}%
        </span>
      </div>
    </div>
  );
}
