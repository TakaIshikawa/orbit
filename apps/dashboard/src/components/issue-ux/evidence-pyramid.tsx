"use client";

interface VerificationLike {
  id: string;
  claim?: string;
  notes?: string;
}

interface Tier {
  name: string;
  count: number;
  color: string;
}

interface EvidencePyramidProps {
  verifications?: VerificationLike[];
  tiers?: Tier[];
}

type EvidenceLevel = {
  name: string;
  description: string;
  color: string;
  bgColor: string;
  types: string[];
};

const EVIDENCE_LEVELS: EvidenceLevel[] = [
  {
    name: "Systematic Reviews",
    description: "Meta-analyses, Cochrane reviews",
    color: "text-emerald-400",
    bgColor: "bg-emerald-900/40",
    types: ["meta_analysis", "systematic_review", "cochrane"],
  },
  {
    name: "Experimental",
    description: "RCTs, controlled experiments",
    color: "text-green-400",
    bgColor: "bg-green-900/40",
    types: ["rct", "experimental", "randomized"],
  },
  {
    name: "Longitudinal",
    description: "Cohort studies, panel data",
    color: "text-cyan-400",
    bgColor: "bg-cyan-900/40",
    types: ["longitudinal", "cohort", "panel"],
  },
  {
    name: "Cross-sectional",
    description: "Surveys, observational studies",
    color: "text-blue-400",
    bgColor: "bg-blue-900/40",
    types: ["cross_sectional", "survey", "observational"],
  },
  {
    name: "Qualitative",
    description: "Case studies, expert opinion",
    color: "text-purple-400",
    bgColor: "bg-purple-900/40",
    types: ["qualitative", "case_study", "expert", "opinion"],
  },
  {
    name: "Grey Literature",
    description: "Reports, news, working papers",
    color: "text-gray-400",
    bgColor: "bg-gray-700/40",
    types: ["report", "news", "working_paper", "preprint"],
  },
];

export function EvidencePyramid({ verifications = [], tiers: providedTiers }: EvidencePyramidProps) {
  // Use provided tiers or categorize verifications
  let categorized: Array<{ name: string; count: number; color: string; bgColor: string; description?: string }>;
  let uncategorizedCount = 0;
  let totalCount: number;

  if (providedTiers && providedTiers.length > 0) {
    // Use provided tiers directly
    categorized = providedTiers.map((t, i) => ({
      name: t.name,
      count: t.count,
      color: t.color.replace("bg-", "text-"),
      bgColor: t.color.replace("-500", "-900/40"),
      description: "",
    }));
    totalCount = providedTiers.reduce((sum, t) => sum + t.count, 0);
  } else {
    // Categorize verifications by evidence type
    categorized = EVIDENCE_LEVELS.map((level) => {
      const count = verifications.filter((v) => {
        const claim = (v.claim || "").toLowerCase();
        const notes = (v.notes || "").toLowerCase();
        const combined = claim + " " + notes;

        return level.types.some((type) => combined.includes(type.replace("_", " ")));
      }).length;

      return { ...level, count };
    });

    // Also count uncategorized
    const categorizedIds = new Set(
      categorized.flatMap((c) =>
        verifications
          .filter((v) => {
            const claim = (v.claim || "").toLowerCase();
            const notes = (v.notes || "").toLowerCase();
            const combined = claim + " " + notes;
            return EVIDENCE_LEVELS.some((level) =>
              level.types.some((type) => combined.includes(type.replace("_", " ")))
            );
          })
          .map((v) => v.id)
      )
    );

    uncategorizedCount = verifications.filter((v) => !categorizedIds.has(v.id)).length;
    totalCount = verifications.length;
  }

  const maxWidth = 100;

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Evidence Quality Pyramid</h3>

      <div className="space-y-1">
        {categorized.map((level, index) => {
          const widthPercent = 30 + index * 12; // Pyramid shape
          const hasEvidence = level.count > 0;

          return (
            <div key={level.name} className="flex items-center gap-2">
              <div
                className={`
                  h-8 rounded transition-all duration-300 flex items-center justify-center
                  ${hasEvidence ? level.bgColor : "bg-gray-800/50"}
                  ${hasEvidence ? "border border-opacity-30" : "border border-gray-700"}
                `}
                style={{
                  width: `${widthPercent}%`,
                  marginLeft: `${(maxWidth - widthPercent) / 2}%`,
                  borderColor: hasEvidence ? level.color.replace("text-", "") : undefined,
                }}
              >
                {hasEvidence && (
                  <span className={`text-sm font-bold ${level.color}`}>{level.count}</span>
                )}
              </div>
              <div className="flex-1 text-xs">
                <div className={hasEvidence ? level.color : "text-gray-600"}>{level.name}</div>
                <div className="text-gray-600">{level.description}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-4 pt-3 border-t border-gray-700 flex items-center justify-between text-xs">
        <span className="text-gray-500">
          {totalCount} total evidence items
          {uncategorizedCount > 0 && ` (${uncategorizedCount} uncategorized)`}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Stronger evidence</span>
          <span className="text-emerald-400">↑</span>
        </div>
      </div>
    </div>
  );
}
