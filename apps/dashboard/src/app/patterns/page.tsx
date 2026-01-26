"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, type Pattern } from "@/lib/api";

export default function PatternsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["patterns"],
    queryFn: () => api.getPatterns(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Patterns</h1>
          <p className="text-gray-400">Detected systemic patterns from sources</p>
        </div>
        <button className="bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors">
          New Pattern
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-gray-400">Loading patterns...</div>
        </div>
      )}

      {error && (
        <div className="text-red-400 border border-red-800 rounded-lg p-4">
          <p className="font-medium">Error loading patterns</p>
          <p className="text-sm mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          <p className="text-sm text-gray-500 mt-2">Make sure the API is running on port 3001</p>
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">No patterns detected yet</p>
          <p className="text-sm text-gray-500">Run the Scout agent to discover patterns</p>
        </div>
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="text-sm text-gray-500">{data.meta.total} patterns found</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.data.map((pattern) => (
              <PatternCard key={pattern.id} pattern={pattern} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PatternCard({ pattern }: { pattern: Pattern }) {
  const typeLabels: Record<string, string> = {
    policy_gap: "Policy Gap",
    structural_inefficiency: "Structural Inefficiency",
    feedback_loop: "Feedback Loop",
    information_asymmetry: "Information Asymmetry",
    coordination_failure: "Coordination Failure",
    other: "Other",
  };

  const typeColors: Record<string, string> = {
    policy_gap: "bg-red-900/50 text-red-300",
    structural_inefficiency: "bg-orange-900/50 text-orange-300",
    feedback_loop: "bg-purple-900/50 text-purple-300",
    information_asymmetry: "bg-blue-900/50 text-blue-300",
    coordination_failure: "bg-yellow-900/50 text-yellow-300",
    other: "bg-gray-800 text-gray-300",
  };

  return (
    <Link href={`/patterns/${pattern.id}`} className="block border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <span className={`text-xs px-2 py-1 rounded ${typeColors[pattern.patternType] || typeColors.other}`}>
          {typeLabels[pattern.patternType] || pattern.patternType}
        </span>
        <span className="text-sm text-gray-400">
          {(pattern.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <h3 className="font-semibold">{pattern.title}</h3>
      <p className="text-gray-400 text-sm mt-1 line-clamp-2">{pattern.description}</p>
      <div className="flex gap-2 mt-3 flex-wrap">
        {pattern.domains.slice(0, 3).map((domain) => (
          <span key={domain} className="text-xs text-gray-500 bg-gray-800/50 px-2 py-0.5 rounded">
            {domain}
          </span>
        ))}
        {pattern.domains.length > 3 && (
          <span className="text-xs text-gray-600">+{pattern.domains.length - 3}</span>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
        <span>{new Date(pattern.createdAt).toLocaleDateString()}</span>
        <span className="capitalize">{pattern.status}</span>
      </div>
    </Link>
  );
}
