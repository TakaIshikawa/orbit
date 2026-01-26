"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, type SourceFetchLog } from "@/lib/api";

export default function SourceDetailPage() {
  const params = useParams();
  const domain = decodeURIComponent(params.domain as string);

  const { data: healthData, isLoading, error } = useQuery({
    queryKey: ["source-health", domain],
    queryFn: () => api.getSourceHealth(domain),
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["source-fetch-logs", domain],
    queryFn: () => api.getSourceFetchLogs(domain, { limit: 50 }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Loading source...</div>
      </div>
    );
  }

  if (error || !healthData) {
    return (
      <div className="text-red-400 border border-red-800 rounded-lg p-4">
        <p className="font-medium">Error loading source</p>
        <p className="text-sm mt-1">
          {error instanceof Error ? error.message : "Source not found"}
        </p>
        <Link href="/sources" className="text-blue-400 text-sm mt-2 inline-block hover:underline">
          Back to sources
        </Link>
      </div>
    );
  }

  const source = healthData.data;
  const logs = logsData?.data || [];

  const statusColors: Record<string, string> = {
    healthy: "bg-green-900/50 text-green-300 border-green-800",
    degraded: "bg-yellow-900/50 text-yellow-300 border-yellow-800",
    unhealthy: "bg-red-900/50 text-red-300 border-red-800",
    unknown: "bg-gray-700 text-gray-300 border-gray-600",
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/sources" className="hover:text-white">Sources</Link>
        <span>/</span>
        <span className="text-gray-300">{domain}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{domain}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`text-sm px-2 py-1 rounded border ${statusColors[source.healthStatus]}`}>
              {source.healthStatus}
            </span>
            {source.alertActive && (
              <span className="text-sm px-2 py-1 rounded bg-red-900/50 text-red-300 border border-red-800">
                Alert: {source.alertReason}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Reliability Score</div>
          <div className={`text-3xl font-bold ${
            (source.dynamicReliability ?? 0) >= 0.8 ? "text-green-400" :
            (source.dynamicReliability ?? 0) >= 0.6 ? "text-yellow-400" : "text-red-400"
          }`}>
            {source.dynamicReliability !== null
              ? `${(source.dynamicReliability * 100).toFixed(0)}%`
              : "N/A"
            }
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Success Rate"
          value={source.successRate !== null ? `${(source.successRate * 100).toFixed(1)}%` : "N/A"}
          color={source.successRate !== null && source.successRate >= 0.9 ? "green" : source.successRate !== null && source.successRate >= 0.7 ? "yellow" : "red"}
        />
        <StatCard
          label="Total Fetches"
          value={source.totalFetches.toString()}
          subValue={`${source.successfulFetches} success / ${source.failedFetches} failed`}
        />
        <StatCard
          label="Avg Response Time"
          value={source.avgResponseTimeMs !== null ? formatResponseTime(source.avgResponseTimeMs) : "N/A"}
          subValue={source.p95ResponseTimeMs !== null ? `p95: ${formatResponseTime(source.p95ResponseTimeMs)}` : undefined}
        />
        <StatCard
          label="Verifications"
          value={source.totalVerifications.toString()}
          subValue={`${source.corroboratedCount} corroborated / ${source.contestedCount} contested`}
        />
      </div>

      {/* Error Breakdown */}
      {source.errorsByType && Object.keys(source.errorsByType).length > 0 && (
        <div className="border border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3">Error Breakdown</h2>
          <div className="flex flex-wrap gap-4">
            {Object.entries(source.errorsByType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <span className={`text-sm px-2 py-1 rounded ${getErrorTypeColor(type)}`}>
                  {type.replace("_", " ")}
                </span>
                <span className="text-gray-400">{count as number}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reliability Details */}
      <div className="border border-gray-800 rounded-lg p-4">
        <h2 className="font-semibold mb-3">Reliability Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Base Reliability</span>
            <div className="font-medium">
              {source.baseReliability !== null
                ? `${(source.baseReliability * 100).toFixed(0)}%`
                : "Not set"
              }
            </div>
          </div>
          <div>
            <span className="text-gray-500">Dynamic Reliability</span>
            <div className="font-medium">
              {source.dynamicReliability !== null
                ? `${(source.dynamicReliability * 100).toFixed(0)}%`
                : "Not calculated"
              }
            </div>
          </div>
          <div>
            <span className="text-gray-500">Confidence</span>
            <div className="font-medium">
              {source.reliabilityConfidence !== null
                ? `${(source.reliabilityConfidence * 100).toFixed(0)}%`
                : "N/A"
              }
            </div>
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          Dynamic reliability is calculated from fetch success rate and response times.
          Blended score = 70% base + 30% dynamic (weighted by confidence).
        </div>
      </div>

      {/* Metadata */}
      <div className="border border-gray-800 rounded-lg p-4">
        <h2 className="font-semibold mb-3">Metadata</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">Window Period</dt>
          <dd>{source.windowDays} days</dd>
          <dt className="text-gray-500">Last Fetch</dt>
          <dd>{source.lastFetchAt ? new Date(source.lastFetchAt).toLocaleString() : "Never"}</dd>
          <dt className="text-gray-500">Last Calculated</dt>
          <dd>{new Date(source.lastCalculatedAt).toLocaleString()}</dd>
          <dt className="text-gray-500">First Seen</dt>
          <dd>{new Date(source.createdAt).toLocaleString()}</dd>
        </dl>
      </div>

      {/* Fetch Logs */}
      <div className="border border-gray-800 rounded-lg p-4">
        <h2 className="font-semibold mb-3">Recent Fetch Logs</h2>
        {logsLoading ? (
          <div className="text-gray-500 text-center py-4">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="text-gray-500 text-center py-4">No fetch logs available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50">
                <tr>
                  <th className="text-left p-2 font-medium">Time</th>
                  <th className="text-left p-2 font-medium">URL</th>
                  <th className="text-center p-2 font-medium">Status</th>
                  <th className="text-center p-2 font-medium">HTTP</th>
                  <th className="text-center p-2 font-medium">Response Time</th>
                  <th className="text-center p-2 font-medium">Size</th>
                  <th className="text-left p-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {logs.map((log) => (
                  <FetchLogRow key={log.id} log={log} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {logsData && logsData.meta.total > logs.length && (
          <div className="text-sm text-gray-500 text-center mt-3">
            Showing {logs.length} of {logsData.meta.total} logs
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subValue,
  color,
}: {
  label: string;
  value: string;
  subValue?: string;
  color?: "green" | "yellow" | "red";
}) {
  const colorClasses = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
  };

  return (
    <div className="border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color ? colorClasses[color] : ""}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-gray-500 mt-1">{subValue}</div>
      )}
    </div>
  );
}

function FetchLogRow({ log }: { log: SourceFetchLog }) {
  const statusColors: Record<string, string> = {
    success: "bg-green-900/50 text-green-300",
    timeout: "bg-yellow-900/50 text-yellow-300",
    http_error: "bg-red-900/50 text-red-300",
    network_error: "bg-red-900/50 text-red-300",
    blocked: "bg-orange-900/50 text-orange-300",
    rate_limited: "bg-purple-900/50 text-purple-300",
  };

  return (
    <tr className="hover:bg-gray-800/30 transition-colors">
      <td className="p-2 text-gray-400 whitespace-nowrap">
        {new Date(log.fetchedAt).toLocaleString()}
      </td>
      <td className="p-2 max-w-xs truncate" title={log.url}>
        <span className="text-gray-300">{log.url}</span>
      </td>
      <td className="p-2 text-center">
        <span className={`text-xs px-2 py-1 rounded ${statusColors[log.status]}`}>
          {log.status}
        </span>
      </td>
      <td className="p-2 text-center text-gray-400">
        {log.httpStatusCode || "-"}
      </td>
      <td className="p-2 text-center text-gray-400">
        {log.responseTimeMs !== null ? formatResponseTime(log.responseTimeMs) : "-"}
      </td>
      <td className="p-2 text-center text-gray-400">
        {log.contentLength !== null ? formatBytes(log.contentLength) : "-"}
      </td>
      <td className="p-2 text-red-400 text-xs max-w-xs truncate" title={log.error || undefined}>
        {log.error || "-"}
      </td>
    </tr>
  );
}

function formatResponseTime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getErrorTypeColor(type: string): string {
  switch (type) {
    case "timeout":
      return "bg-yellow-900/50 text-yellow-300";
    case "http_error":
      return "bg-red-900/50 text-red-300";
    case "network_error":
      return "bg-red-900/50 text-red-300";
    case "blocked":
      return "bg-orange-900/50 text-orange-300";
    case "rate_limited":
      return "bg-purple-900/50 text-purple-300";
    default:
      return "bg-gray-700 text-gray-300";
  }
}
