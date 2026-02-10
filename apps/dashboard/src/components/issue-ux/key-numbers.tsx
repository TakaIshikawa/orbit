"use client";

interface KeyNumbersProps {
  issue: {
    keyNumber?: string | null;
    scoreUrgency: number;
    sources?: unknown[];
  };
  solutions?: Array<{
    solutionStatus: string;
  }>;
  verificationStats?: {
    corroborated: number;
    contested: number;
    total: number;
  };
}

interface KeyNumber {
  value: string;
  label: string;
  color: string;
}

export function KeyNumbers({ issue, solutions = [], verificationStats }: KeyNumbersProps) {
  const numbers: KeyNumber[] = [];

  // Key number from issue if available
  if (issue.keyNumber) {
    numbers.push({
      value: issue.keyNumber,
      label: "Key Metric",
      color: "text-cyan-400",
    });
  }

  // Urgency as a key number
  if (issue.scoreUrgency >= 0.7) {
    numbers.push({
      value: `${Math.round(issue.scoreUrgency * 100)}%`,
      label: "Urgency",
      color: "text-red-400",
    });
  }

  // Solutions count
  const solutionsList = solutions ?? [];
  const inProgress = solutionsList.filter((s) => s.solutionStatus === "in_progress").length;
  const completed = solutionsList.filter((s) => s.solutionStatus === "completed").length;

  if (inProgress > 0) {
    numbers.push({
      value: inProgress.toString(),
      label: "In Progress",
      color: "text-yellow-400",
    });
  } else if (completed > 0) {
    numbers.push({
      value: completed.toString(),
      label: "Completed",
      color: "text-green-400",
    });
  } else if (solutionsList.length > 0) {
    numbers.push({
      value: solutionsList.length.toString(),
      label: "Solutions",
      color: "text-purple-400",
    });
  } else {
    numbers.push({
      value: "0",
      label: "Solutions",
      color: "text-gray-500",
    });
  }

  // Sources
  numbers.push({
    value: (issue.sources?.length || 0).toString(),
    label: "Sources",
    color: "text-blue-400",
  });

  // Evidence quality
  if (verificationStats && verificationStats.total > 0) {
    const ratio = Math.round((verificationStats.corroborated / verificationStats.total) * 100);
    numbers.push({
      value: `${ratio}%`,
      label: "Verified",
      color: ratio >= 70 ? "text-green-400" : ratio >= 40 ? "text-yellow-400" : "text-red-400",
    });
  }

  // Limit to 4 numbers
  const displayNumbers = numbers.slice(0, 4);

  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {displayNumbers.map((num, index) => (
        <div
          key={index}
          className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center"
        >
          <div className={`text-2xl font-bold ${num.color}`}>{num.value}</div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">{num.label}</div>
        </div>
      ))}
    </div>
  );
}
