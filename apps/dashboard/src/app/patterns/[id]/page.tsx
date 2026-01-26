"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function PatternDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["pattern", id],
    queryFn: () => api.getPattern(id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Loading pattern...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-red-400 border border-red-800 rounded-lg p-4">
        <p className="font-medium">Error loading pattern</p>
        <p className="text-sm mt-1">{error instanceof Error ? error.message : "Pattern not found"}</p>
        <Link href="/patterns" className="text-blue-400 text-sm mt-2 inline-block hover:underline">
          Back to patterns
        </Link>
      </div>
    );
  }

  const pattern = data.data;

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
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/patterns" className="hover:text-white">Patterns</Link>
        <span>/</span>
        <span className="text-gray-300">{pattern.id}</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-xs px-2 py-1 rounded ${typeColors[pattern.patternType] || typeColors.other}`}>
              {typeLabels[pattern.patternType] || pattern.patternType}
            </span>
            <span className="text-xs text-gray-500 capitalize">{pattern.status}</span>
          </div>
          <h1 className="text-2xl font-bold">{pattern.title}</h1>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{(pattern.confidence * 100).toFixed(0)}%</div>
          <div className="text-xs text-gray-500">confidence</div>
        </div>
      </div>

      <p className="text-gray-400">{pattern.description}</p>

      <div className="grid grid-cols-2 gap-6">
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Scope</h2>
          <div className="space-y-3">
            <div>
              <h3 className="text-sm text-gray-500 mb-1">Domains</h3>
              <div className="flex flex-wrap gap-2">
                {pattern.domains.map((domain) => (
                  <span key={domain} className="text-sm bg-gray-800 px-2 py-1 rounded">
                    {domain}
                  </span>
                ))}
              </div>
            </div>
            {pattern.geographies.length > 0 && (
              <div>
                <h3 className="text-sm text-gray-500 mb-1">Geographies</h3>
                <div className="flex flex-wrap gap-2">
                  {pattern.geographies.map((geo) => (
                    <span key={geo} className="text-sm bg-gray-800 px-2 py-1 rounded">
                      {geo}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Observation</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">First Observed</dt>
              <dd>{new Date(pattern.firstObserved).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Frequency</dt>
              <dd className="capitalize">{pattern.observationFrequency.replace("_", " ")}</dd>
            </div>
            {pattern.clusterId && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Cluster</dt>
                <dd className="font-mono text-xs">{pattern.clusterId}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="border border-gray-800 rounded-lg p-4">
        <h2 className="font-semibold mb-3">Sources ({pattern.sources.length})</h2>
        <div className="space-y-3">
          {pattern.sources.map((source, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <div className="flex-1">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  {source.title}
                </a>
                <div className="text-xs text-gray-500 mt-1">{source.url}</div>
              </div>
              <div className="text-right">
                <div className={`text-xs px-2 py-1 rounded ${
                  source.reliability >= 0.8 ? "bg-green-900/50 text-green-300" :
                  source.reliability >= 0.5 ? "bg-yellow-900/50 text-yellow-300" :
                  "bg-red-900/50 text-red-300"
                }`}>
                  {(source.reliability * 100).toFixed(0)}% reliable
                </div>
              </div>
            </div>
          ))}
          {pattern.sources.length === 0 && (
            <p className="text-gray-500 text-sm">No sources linked</p>
          )}
        </div>
      </div>

      <div className="border border-gray-800 rounded-lg p-4">
        <h2 className="font-semibold mb-3">Metadata</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">ID</dt>
          <dd className="font-mono">{pattern.id}</dd>
          <dt className="text-gray-500">Version</dt>
          <dd>{pattern.version}</dd>
          <dt className="text-gray-500">Author</dt>
          <dd className="font-mono">{pattern.author}</dd>
          <dt className="text-gray-500">Created</dt>
          <dd>{new Date(pattern.createdAt).toLocaleString()}</dd>
          <dt className="text-gray-500">Content Hash</dt>
          <dd className="font-mono text-xs truncate">{pattern.contentHash}</dd>
        </dl>
      </div>
    </div>
  );
}
