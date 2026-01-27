"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api, type SourceHealth } from "@/lib/api";

export default function SourcesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [initMessage, setInitMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const queryClient = useQueryClient();

  const initMutation = useMutation({
    mutationFn: () => api.initializeSourcesFromPatterns(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["source-health"] });
      queryClient.invalidateQueries({ queryKey: ["source-health-summary"] });
      setInitMessage({
        type: "success",
        text: `Found ${data.data.domainsFound} domains. Created ${data.data.created} new source records.`,
      });
      setTimeout(() => setInitMessage(null), 5000);
    },
    onError: (error) => {
      setInitMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to initialize sources",
      });
      setTimeout(() => setInitMessage(null), 5000);
    },
  });

  const { data: summaryData } = useQuery({
    queryKey: ["source-health-summary"],
    queryFn: () => api.getSourceHealthSummary(),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["source-health", statusFilter],
    queryFn: () =>
      api.getSourceHealthList({
        limit: 100,
        healthStatus: statusFilter !== "all" ? statusFilter : undefined,
      }),
  });

  const { data: alertsData } = useQuery({
    queryKey: ["source-alerts"],
    queryFn: () => api.getSourcesWithAlerts(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Loading sources...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 border border-red-800 rounded-lg p-4">
        <p className="font-medium">Error loading sources</p>
        <p className="text-sm mt-1">
          {error instanceof Error ? error.message : "Failed to fetch source health data"}
        </p>
      </div>
    );
  }

  const sources = data?.data || [];
  const summary = summaryData?.data;
  const alerts = alertsData?.data || [];

  return (
    <div className="space-y-6">
      {initMessage && (
        <div className={`p-3 rounded-lg text-sm ${
          initMessage.type === "success"
            ? "bg-green-900/50 text-green-300 border border-green-800"
            : "bg-red-900/50 text-red-300 border border-red-800"
        }`}>
          {initMessage.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Source Health</h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-400">
            Monitoring {summary?.totalSources || sources.length} sources
          </div>
          <button
            onClick={() => initMutation.mutate()}
            disabled={initMutation.isPending}
            className="px-3 py-1.5 text-sm border border-gray-700 rounded hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {initMutation.isPending ? "Initializing..." : "Sync from Patterns"}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-5 gap-4">
          <SummaryCard label="Total Sources" value={summary.totalSources} />
          <SummaryCard label="Healthy" value={summary.healthy} color="green" />
          <SummaryCard label="Degraded" value={summary.degraded} color="yellow" />
          <SummaryCard label="Unhealthy" value={summary.unhealthy} color="red" />
          <SummaryCard label="Active Alerts" value={summary.activeAlerts} color={summary.activeAlerts > 0 ? "red" : undefined} />
        </div>
      )}

      {/* Source Health Grid (Top sources with trend) */}
      {sources.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-3">SOURCES HEALTH OVERVIEW</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {sources.slice(0, 12).map((source) => (
              <SourceHealthCard key={source.id} source={source} />
            ))}
          </div>
        </div>
      )}

      {/* Verification Accuracy Section */}
      {sources.length > 0 && (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <div className="bg-gray-800/50 px-4 py-3">
            <h2 className="font-semibold">Verification Accuracy</h2>
            <p className="text-xs text-gray-500">Source reliability based on verification results</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900">
                <tr>
                  <th className="text-left p-3 font-medium">Source</th>
                  <th className="text-center p-3 font-medium">Verified</th>
                  <th className="text-center p-3 font-medium">Corroborated</th>
                  <th className="text-center p-3 font-medium">Contested</th>
                  <th className="text-center p-3 font-medium">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sources.filter(s => s.totalVerifications > 0).slice(0, 10).map((source) => {
                  const accuracy = source.totalVerifications > 0
                    ? (source.corroboratedCount / source.totalVerifications * 100)
                    : null;
                  return (
                    <tr key={source.id} className="hover:bg-gray-800/30">
                      <td className="p-3">
                        <Link href={`/sources/${encodeURIComponent(source.domain)}`} className="text-blue-400 hover:underline">
                          {source.domain}
                        </Link>
                      </td>
                      <td className="p-3 text-center text-gray-400">{source.totalVerifications}</td>
                      <td className="p-3 text-center text-green-400">{source.corroboratedCount}</td>
                      <td className="p-3 text-center text-red-400">{source.contestedCount}</td>
                      <td className="p-3 text-center">
                        {accuracy !== null ? (
                          <span className={accuracy >= 80 ? "text-green-400" : accuracy >= 60 ? "text-yellow-400" : "text-red-400"}>
                            {accuracy.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sources.filter(s => s.totalVerifications > 0).length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gray-500">
                      No verification data available yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="border border-red-800 bg-red-900/10 rounded-lg p-4">
          <h2 className="font-semibold text-red-400 mb-3">Active Alerts ({alerts.length})</h2>
          <div className="space-y-2">
            {alerts.slice(0, 5).map((source) => (
              <div key={source.id} className="flex items-center justify-between text-sm">
                <Link href={`/sources/${encodeURIComponent(source.domain)}`} className="text-red-300 hover:underline">
                  {source.domain}
                </Link>
                <span className="text-gray-400">{source.alertReason}</span>
              </div>
            ))}
            {alerts.length > 5 && (
              <div className="text-xs text-gray-500">
                ...and {alerts.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Filter by status:</span>
        <div className="flex gap-1">
          {["all", "healthy", "degraded", "unhealthy", "unknown"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 text-sm rounded ${
                statusFilter === status
                  ? "bg-gray-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Source Table */}
      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left p-3 font-medium">Domain</th>
              <th className="text-center p-3 font-medium">Status</th>
              <th className="text-center p-3 font-medium">Success Rate</th>
              <th className="text-center p-3 font-medium">Avg Response</th>
              <th className="text-center p-3 font-medium">Total Fetches</th>
              <th className="text-center p-3 font-medium">Reliability</th>
              <th className="text-center p-3 font-medium">Last Fetch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sources.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center">
                  <p className="text-gray-400 mb-2">No sources found</p>
                  <p className="text-sm text-gray-500 mb-4">
                    Click "Sync from Patterns" to populate sources from existing pattern data,
                    or run the scout command to fetch and track new sources.
                  </p>
                  <button
                    onClick={() => initMutation.mutate()}
                    disabled={initMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {initMutation.isPending ? "Initializing..." : "Sync from Patterns"}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="text-sm text-gray-500 text-center">
          Showing {sources.length} of {data.meta.total} sources
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
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
      <div className={`text-2xl font-bold ${color ? colorClasses[color] : ""}`}>
        {value}
      </div>
    </div>
  );
}

function SourceHealthCard({ source }: { source: SourceHealth }) {
  const healthColors: Record<string, { bg: string; text: string; indicator: string }> = {
    healthy: { bg: "border-green-800", text: "text-green-400", indicator: "bg-green-500" },
    degraded: { bg: "border-yellow-800", text: "text-yellow-400", indicator: "bg-yellow-500" },
    unhealthy: { bg: "border-red-800", text: "text-red-400", indicator: "bg-red-500" },
    unknown: { bg: "border-gray-700", text: "text-gray-400", indicator: "bg-gray-500" },
  };

  const colors = healthColors[source.healthStatus] || healthColors.unknown;
  const reliability = source.dynamicReliability !== null
    ? Math.round(source.dynamicReliability * 100)
    : null;

  // Calculate a pseudo-trend based on comparing dynamic vs base reliability
  const trend = source.dynamicReliability !== null && source.baseReliability !== null
    ? source.dynamicReliability - source.baseReliability
    : null;

  return (
    <Link
      href={`/sources/${encodeURIComponent(source.domain)}`}
      className={`block border ${colors.bg} rounded-lg p-3 hover:bg-gray-800/30 transition-colors`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${colors.indicator}`} />
        <span className="text-xs font-medium truncate flex-1" title={source.domain}>
          {source.domain.length > 15 ? `${source.domain.slice(0, 12)}...` : source.domain}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className={`text-xl font-bold ${colors.text}`}>
          {reliability !== null ? `${reliability}%` : "—"}
        </span>
        {trend !== null && Math.abs(trend) > 0.01 && (
          <span className={`text-xs flex items-center ${trend > 0 ? "text-green-400" : "text-red-400"}`}>
            {trend > 0 ? "↑" : "↓"} {Math.abs(Math.round(trend * 100))}%
          </span>
        )}
      </div>
      {source.alertActive && (
        <div className="mt-1 text-xs text-red-400 truncate">
          ! {source.alertReason}
        </div>
      )}
    </Link>
  );
}

function SourceRow({ source }: { source: SourceHealth }) {
  const statusColors: Record<string, string> = {
    healthy: "bg-green-900/50 text-green-300",
    degraded: "bg-yellow-900/50 text-yellow-300",
    unhealthy: "bg-red-900/50 text-red-300",
    unknown: "bg-gray-700 text-gray-300",
  };

  const formatResponseTime = (ms: number | null) => {
    if (ms === null) return "-";
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <tr className="hover:bg-gray-800/30 transition-colors">
      <td className="p-3">
        <Link
          href={`/sources/${encodeURIComponent(source.domain)}`}
          className="text-blue-400 hover:underline flex items-center gap-2"
        >
          {source.alertActive && <span className="text-red-400">!</span>}
          {source.domain}
        </Link>
      </td>
      <td className="p-3 text-center">
        <span className={`text-xs px-2 py-1 rounded ${statusColors[source.healthStatus]}`}>
          {source.healthStatus}
        </span>
      </td>
      <td className="p-3 text-center">
        {source.successRate !== null ? (
          <span className={source.successRate >= 0.9 ? "text-green-400" : source.successRate >= 0.7 ? "text-yellow-400" : "text-red-400"}>
            {(source.successRate * 100).toFixed(1)}%
          </span>
        ) : (
          <span className="text-gray-500">-</span>
        )}
      </td>
      <td className="p-3 text-center text-gray-400">
        {formatResponseTime(source.avgResponseTimeMs)}
      </td>
      <td className="p-3 text-center text-gray-400">
        {source.totalFetches}
      </td>
      <td className="p-3 text-center">
        {source.dynamicReliability !== null ? (
          <span className={source.dynamicReliability >= 0.8 ? "text-green-400" : source.dynamicReliability >= 0.6 ? "text-yellow-400" : "text-red-400"}>
            {(source.dynamicReliability * 100).toFixed(0)}%
          </span>
        ) : (
          <span className="text-gray-500">-</span>
        )}
      </td>
      <td className="p-3 text-center text-gray-500 text-xs">
        {formatTimeAgo(source.lastFetchAt)}
      </td>
    </tr>
  );
}
