"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, type ConfidenceAdjustment, type Issue, type Verification } from "@/lib/api";

export default function PatternDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["pattern", id],
    queryFn: () => api.getPattern(id),
  });

  // Get confidence adjustments for this pattern
  const { data: adjustmentsData } = useQuery({
    queryKey: ["pattern-adjustments", id],
    queryFn: () => api.getEntityAdjustments("pattern", id).catch(() => ({ data: [], meta: { total: 0, limit: 20, offset: 0 } })),
    enabled: !!id,
  });

  // Get issues that reference this pattern
  const { data: issuesData } = useQuery({
    queryKey: ["issues-by-pattern", id],
    queryFn: async () => {
      const result = await api.getIssues({ limit: 100 });
      // Filter to issues that include this pattern
      const filtered = result.data.filter((issue) => issue.patternIds?.includes(id));
      return { data: filtered, meta: { total: filtered.length } };
    },
    enabled: !!id,
  });

  // Get verifications for this pattern
  const { data: verificationsData } = useQuery({
    queryKey: ["verifications-by-pattern", id],
    queryFn: () => api.getVerificationsBySource("pattern", id).catch(() => ({ data: [], meta: { total: 0 } })),
    enabled: !!id,
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
  const adjustments = adjustmentsData?.data || [];
  const relatedIssues = issuesData?.data || [];
  const verifications = verificationsData?.data || [];

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

  const confidenceColor =
    pattern.confidence >= 0.7 ? "text-green-400" :
    pattern.confidence >= 0.4 ? "text-yellow-400" : "text-red-400";

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
          <div className={`text-2xl font-bold ${confidenceColor}`}>{(pattern.confidence * 100).toFixed(0)}%</div>
          <div className="text-xs text-gray-500">confidence</div>
        </div>
      </div>

      <p className="text-gray-400">{pattern.description}</p>

      {/* Confidence History */}
      {adjustments.length > 0 && (
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Confidence History</h2>
          <div className="space-y-2">
            {adjustments.slice(0, 5).map((adj) => (
              <ConfidenceAdjustmentRow key={adj.id} adjustment={adj} />
            ))}
            {adjustments.length > 5 && (
              <p className="text-xs text-gray-500">+{adjustments.length - 5} more adjustments</p>
            )}
          </div>
        </div>
      )}

      {/* Related Issues */}
      {relatedIssues.length > 0 && (
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Issues Derived from This Pattern ({relatedIssues.length})</h2>
          <div className="space-y-2">
            {relatedIssues.slice(0, 5).map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
            {relatedIssues.length > 5 && (
              <p className="text-xs text-gray-500">+{relatedIssues.length - 5} more issues</p>
            )}
          </div>
        </div>
      )}

      {/* Verifications */}
      {verifications.length > 0 && (
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Verification Results ({verifications.length})</h2>
          <div className="space-y-2">
            {verifications.slice(0, 5).map((v) => (
              <VerificationRow key={v.id} verification={v} />
            ))}
            {verifications.length > 5 && (
              <p className="text-xs text-gray-500">+{verifications.length - 5} more verifications</p>
            )}
          </div>
        </div>
      )}

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

function ConfidenceAdjustmentRow({ adjustment }: { adjustment: ConfidenceAdjustment }) {
  const delta = adjustment.adjustmentDelta;
  const isPositive = delta > 0;

  return (
    <div className="flex items-center justify-between bg-gray-800/30 rounded p-2 text-sm">
      <div className="flex items-center gap-3">
        <span className={`font-medium ${isPositive ? "text-green-400" : "text-red-400"}`}>
          {isPositive ? "+" : ""}{(delta * 100).toFixed(1)}%
        </span>
        <span className="text-gray-400">
          {(adjustment.previousValue * 100).toFixed(0)}% → {(adjustment.newValue * 100).toFixed(0)}%
        </span>
      </div>
      <div className="text-right">
        <div className="text-xs text-gray-500">{adjustment.reason}</div>
        <div className="text-xs text-gray-600">{new Date(adjustment.createdAt).toLocaleDateString()}</div>
      </div>
    </div>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  const scoreColor =
    issue.compositeScore >= 0.7 ? "text-red-400" :
    issue.compositeScore >= 0.4 ? "text-yellow-400" : "text-green-400";

  return (
    <Link
      href={`/issues/${issue.id}`}
      className="flex items-center justify-between bg-gray-800/30 rounded p-2 text-sm hover:bg-gray-800/50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{issue.headline || issue.title}</div>
        <div className="text-xs text-gray-500 truncate">{issue.summary}</div>
      </div>
      <div className={`text-right shrink-0 ml-2 ${scoreColor}`}>
        <div className="font-bold">{(issue.compositeScore * 100).toFixed(0)}</div>
        <div className="text-xs text-gray-500">score</div>
      </div>
    </Link>
  );
}

function VerificationRow({ verification }: { verification: Verification }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    corroborated: { color: "bg-green-900/50 text-green-300", label: "Corroborated" },
    contested: { color: "bg-red-900/50 text-red-300", label: "Contested" },
    partially_supported: { color: "bg-yellow-900/50 text-yellow-300", label: "Partial" },
    unverified: { color: "bg-gray-700 text-gray-300", label: "Unverified" },
    pending: { color: "bg-blue-900/50 text-blue-300", label: "Pending" },
  };

  const config = statusConfig[verification.status] || statusConfig.pending;

  return (
    <div className="bg-gray-800/30 rounded p-2 text-sm">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className={`text-xs px-2 py-0.5 rounded ${config.color}`}>
          {config.label}
        </span>
        <span className="text-xs text-gray-500">
          {(verification.adjustedConfidence * 100).toFixed(0)}% confidence
        </span>
      </div>
      <div className="text-gray-300 line-clamp-2">{verification.claimStatement}</div>
    </div>
  );
}
