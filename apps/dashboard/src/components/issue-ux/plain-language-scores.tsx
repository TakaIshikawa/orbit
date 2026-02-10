"use client";

interface PlainLanguageScoresProps {
  issue: {
    scoreImpact: number;
    scoreUrgency: number;
    scoreTractability: number;
    scoreLegitimacy: number;
    scoreNeglectedness: number;
  };
}

export function PlainLanguageScores({ issue }: PlainLanguageScoresProps) {
  const getImpactDescription = (score: number) => {
    if (score >= 0.8) return { text: "Affects billions of people", icon: "🌍", color: "text-red-400" };
    if (score >= 0.6) return { text: "Major regional impact", icon: "🏙️", color: "text-orange-400" };
    if (score >= 0.4) return { text: "Significant but contained", icon: "📍", color: "text-yellow-400" };
    return { text: "Limited scope", icon: "📌", color: "text-gray-400" };
  };

  const getUrgencyDescription = (score: number) => {
    if (score >= 0.8) return { text: "Crisis - needs immediate action", icon: "🚨", color: "text-red-400" };
    if (score >= 0.6) return { text: "Getting worse every month", icon: "⚡", color: "text-orange-400" };
    if (score >= 0.4) return { text: "Slow but steady decline", icon: "📉", color: "text-yellow-400" };
    return { text: "Stable for now", icon: "➖", color: "text-gray-400" };
  };

  const getTractabilityDescription = (score: number) => {
    if (score >= 0.7) return { text: "Solutions exist and work", icon: "✅", color: "text-green-400" };
    if (score >= 0.5) return { text: "Hard but not impossible", icon: "🔧", color: "text-yellow-400" };
    if (score >= 0.3) return { text: "Major obstacles ahead", icon: "🚧", color: "text-orange-400" };
    return { text: "No clear path forward", icon: "❌", color: "text-red-400" };
  };

  const getLegitimacyDescription = (score: number) => {
    if (score >= 0.8) return { text: "Strong evidence, well-documented", icon: "📊", color: "text-green-400" };
    if (score >= 0.6) return { text: "Good evidence with some gaps", icon: "📋", color: "text-cyan-400" };
    if (score >= 0.4) return { text: "Mixed evidence", icon: "❓", color: "text-yellow-400" };
    return { text: "Limited or contested evidence", icon: "⚠️", color: "text-red-400" };
  };

  const getNeglectednessDescription = (score: number) => {
    if (score >= 0.8) return { text: "Almost no one working on this", icon: "🏚️", color: "text-red-400" };
    if (score >= 0.6) return { text: "Severely under-resourced", icon: "📭", color: "text-orange-400" };
    if (score >= 0.4) return { text: "Some attention but not enough", icon: "👀", color: "text-yellow-400" };
    return { text: "Well-covered by others", icon: "✔️", color: "text-green-400" };
  };

  const scores = [
    { label: "Impact", ...getImpactDescription(issue.scoreImpact), raw: issue.scoreImpact },
    { label: "Urgency", ...getUrgencyDescription(issue.scoreUrgency), raw: issue.scoreUrgency },
    { label: "Tractability", ...getTractabilityDescription(issue.scoreTractability), raw: issue.scoreTractability },
    { label: "Evidence", ...getLegitimacyDescription(issue.scoreLegitimacy), raw: issue.scoreLegitimacy },
    { label: "Neglectedness", ...getNeglectednessDescription(issue.scoreNeglectedness), raw: issue.scoreNeglectedness },
  ];

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Issue Assessment</h3>

      <div className="space-y-3">
        {scores.map((score) => (
          <div key={score.label} className="flex items-center gap-3">
            <span className="text-lg w-8">{score.icon}</span>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 uppercase">{score.label}</span>
                <span className="text-xs text-gray-600">{Math.round(score.raw * 100)}%</span>
              </div>
              <div className={`text-sm ${score.color}`}>{score.text}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Overall Assessment */}
      <div className="mt-4 pt-3 border-t border-gray-700">
        <div className="text-xs text-gray-500 mb-1">Bottom Line</div>
        <p className="text-sm text-gray-300">
          {issue.scoreUrgency >= 0.7 && issue.scoreTractability >= 0.5
            ? "High-priority opportunity - act now while solutions are feasible."
            : issue.scoreUrgency >= 0.7 && issue.scoreTractability < 0.5
            ? "Urgent but difficult - may need innovative approaches."
            : issue.scoreNeglectedness >= 0.7 && issue.scoreTractability >= 0.5
            ? "Overlooked opportunity - your effort could make outsized impact."
            : issue.scoreLegitimacy < 0.5
            ? "More research needed before committing resources."
            : "Worth monitoring - keep tracking developments."}
        </p>
      </div>
    </div>
  );
}
