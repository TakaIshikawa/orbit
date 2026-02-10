"use client";

interface ReadingTimeProps {
  issue: {
    summary?: string;
    rootCauses?: string[];
    leveragePoints?: string[];
    sources?: unknown[];
  };
  verificationCount: number;
  solutionCount: number;
}

export function ReadingTime({ issue, verificationCount, solutionCount }: ReadingTimeProps) {
  // Estimate reading time based on content
  const summaryWords = (issue.summary || "").split(/\s+/).length;
  const rootCauseWords = (issue.rootCauses || []).join(" ").split(/\s+/).length;
  const leverageWords = (issue.leveragePoints || []).join(" ").split(/\s+/).length;

  // Assume ~200 words per minute reading speed
  const summaryMinutes = Math.ceil((summaryWords + rootCauseWords + leverageWords) / 200);

  // Add time for reviewing evidence and solutions
  const evidenceMinutes = Math.ceil(verificationCount * 0.5); // 30 seconds per verification
  const solutionMinutes = Math.ceil(solutionCount * 1); // 1 minute per solution
  const sourceMinutes = Math.ceil((issue.sources?.length || 0) * 0.3); // 20 seconds per source

  const quickRead = Math.max(2, summaryMinutes + 1);
  const fullRead = Math.max(5, summaryMinutes + evidenceMinutes + solutionMinutes + sourceMinutes);

  return (
    <div className="flex items-center gap-3 text-xs text-gray-500">
      <span className="text-lg">📖</span>
      <span>
        <span className="text-gray-400">{quickRead} min</span> summary
      </span>
      <span className="text-gray-600">|</span>
      <span>
        <span className="text-gray-400">{fullRead} min</span> full analysis
      </span>
    </div>
  );
}
