"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api, type SourceHealth, type ManagedSource, type ManagedSourceAssessment } from "@/lib/api";

type TabType = "health" | "managed";

export default function SourcesPage() {
  const [activeTab, setActiveTab] = useState<TabType>("managed");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [managedStatusFilter, setManagedStatusFilter] = useState<"active" | "paused" | "removed" | "all">("active");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<ManagedSource | null>(null);
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
        <h1 className="text-2xl font-bold">Sources</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("managed")}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              activeTab === "managed"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Managed Sources
          </button>
          <button
            onClick={() => setActiveTab("health")}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              activeTab === "health"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Health Monitoring
          </button>
        </div>
      </div>

      {activeTab === "managed" ? (
        <ManagedSourcesTab
          statusFilter={managedStatusFilter}
          setStatusFilter={setManagedStatusFilter}
          showAddModal={showAddModal}
          setShowAddModal={setShowAddModal}
          selectedSource={selectedSource}
          setSelectedSource={setSelectedSource}
        />
      ) : (
        <HealthMonitoringTab
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          initMutation={initMutation}
        />
      )}
    </div>
  );
}

function ManagedSourcesTab({
  statusFilter,
  setStatusFilter,
  showAddModal,
  setShowAddModal,
  selectedSource,
  setSelectedSource,
}: {
  statusFilter: "active" | "paused" | "removed" | "all";
  setStatusFilter: (v: "active" | "paused" | "removed" | "all") => void;
  showAddModal: boolean;
  setShowAddModal: (v: boolean) => void;
  selectedSource: ManagedSource | null;
  setSelectedSource: (v: ManagedSource | null) => void;
}) {
  const queryClient = useQueryClient();

  const { data: statsData } = useQuery({
    queryKey: ["managed-source-stats"],
    queryFn: () => (api as unknown as { getManagedSourceStats: () => Promise<{ data: { byStatus: { active: number; paused: number; removed: number }; byDebiasedTier: { tier1: number; tier2: number; tier3: number; below: number }; total: number } }> }).getManagedSourceStats(),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["managed-sources", statusFilter],
    queryFn: () => (api as unknown as { getManagedSources: (params: { limit: number; status?: string }) => Promise<{ data: ManagedSource[]; meta: { total: number } }> }).getManagedSources({
      limit: 100,
      status: statusFilter !== "all" ? statusFilter : undefined,
    }),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => (api as unknown as { pauseManagedSource: (id: string) => Promise<{ data: ManagedSource }> }).pauseManagedSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-sources"] });
      queryClient.invalidateQueries({ queryKey: ["managed-source-stats"] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => (api as unknown as { resumeManagedSource: (id: string) => Promise<{ data: ManagedSource }> }).resumeManagedSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-sources"] });
      queryClient.invalidateQueries({ queryKey: ["managed-source-stats"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => (api as unknown as { removeManagedSource: (id: string) => Promise<{ data: ManagedSource }> }).removeManagedSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-sources"] });
      queryClient.invalidateQueries({ queryKey: ["managed-source-stats"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => (api as unknown as { restoreManagedSource: (id: string) => Promise<{ data: ManagedSource }> }).restoreManagedSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-sources"] });
      queryClient.invalidateQueries({ queryKey: ["managed-source-stats"] });
    },
  });

  const stats = statsData?.data;
  const sources = data?.data || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Loading managed sources...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 border border-red-800 rounded-lg p-4">
        <p className="font-medium">Error loading sources</p>
        <p className="text-sm mt-1">
          {error instanceof Error ? error.message : "Failed to fetch managed sources"}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Active" value={stats.byStatus.active} color="green" />
          <StatCard label="Paused" value={stats.byStatus.paused} color="yellow" />
          <StatCard label="Removed" value={stats.byStatus.removed} color="red" />
          <StatCard label="Tier 1 (70%+)" value={stats.byDebiasedTier.tier1} color="green" />
          <StatCard label="Tier 2 (60-70%)" value={stats.byDebiasedTier.tier2} color="yellow" />
          <StatCard label="Tier 3 (50-60%)" value={stats.byDebiasedTier.tier3} />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Filter:</span>
          {(["all", "active", "paused", "removed"] as const).map((status) => (
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
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Add Source
        </button>
      </div>

      {/* Sources Table */}
      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left p-3 font-medium">Source</th>
              <th className="text-center p-3 font-medium">Status</th>
              <th className="text-center p-3 font-medium">Credibility</th>
              <th className="text-center p-3 font-medium">Debiased</th>
              <th className="text-center p-3 font-medium">Type</th>
              <th className="text-center p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sources.map((source) => (
              <tr key={source.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="p-3">
                  <div>
                    <button
                      onClick={() => setSelectedSource(source)}
                      className="text-blue-400 hover:underline font-medium"
                    >
                      {source.name}
                    </button>
                    <div className="text-xs text-gray-500">{source.domain}</div>
                  </div>
                </td>
                <td className="p-3 text-center">
                  <StatusBadge status={source.status} />
                </td>
                <td className="p-3 text-center">
                  <ScoreBadge score={source.overallCredibility} />
                </td>
                <td className="p-3 text-center">
                  <ScoreBadge score={source.debiasedScore} />
                </td>
                <td className="p-3 text-center text-gray-400 capitalize">
                  {source.sourceType.replace("_", " ")}
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => setSelectedSource(source)}
                      className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
                    >
                      View
                    </button>
                    {source.status === "active" && (
                      <button
                        onClick={() => pauseMutation.mutate(source.id)}
                        disabled={pauseMutation.isPending}
                        className="px-2 py-1 text-xs bg-yellow-800 hover:bg-yellow-700 rounded"
                      >
                        Pause
                      </button>
                    )}
                    {source.status === "paused" && (
                      <>
                        <button
                          onClick={() => resumeMutation.mutate(source.id)}
                          disabled={resumeMutation.isPending}
                          className="px-2 py-1 text-xs bg-green-800 hover:bg-green-700 rounded"
                        >
                          Resume
                        </button>
                        <button
                          onClick={() => removeMutation.mutate(source.id)}
                          disabled={removeMutation.isPending}
                          className="px-2 py-1 text-xs bg-red-800 hover:bg-red-700 rounded"
                        >
                          Remove
                        </button>
                      </>
                    )}
                    {source.status === "removed" && (
                      <button
                        onClick={() => restoreMutation.mutate(source.id)}
                        disabled={restoreMutation.isPending}
                        className="px-2 py-1 text-xs bg-blue-800 hover:bg-blue-700 rounded"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center">
                  <p className="text-gray-400 mb-2">No managed sources found</p>
                  <p className="text-sm text-gray-500 mb-4">
                    Add sources to track their trustworthiness and bias assessments.
                  </p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    + Add First Source
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Source Modal */}
      {showAddModal && (
        <AddSourceModal onClose={() => setShowAddModal(false)} />
      )}

      {/* Source Detail Modal */}
      {selectedSource && (
        <SourceDetailModal
          source={selectedSource}
          onClose={() => setSelectedSource(null)}
        />
      )}
    </>
  );
}

function HealthMonitoringTab({
  statusFilter,
  setStatusFilter,
  initMutation,
}: {
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  initMutation: ReturnType<typeof useMutation<{ data: { domainsFound: number; created: number; existing: number } }, Error, void>>;
}) {
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

  const sources = data?.data || [];
  const summary = summaryData?.data;
  const alerts = alertsData?.data || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Loading source health...</div>
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

  return (
    <>
      <div className="flex items-center justify-end">
        <button
          onClick={() => initMutation.mutate()}
          disabled={initMutation.isPending}
          className="px-3 py-1.5 text-sm border border-gray-700 rounded hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {initMutation.isPending ? "Syncing..." : "Sync from Patterns"}
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-5 gap-4">
          <StatCard label="Total Sources" value={summary.totalSources} />
          <StatCard label="Healthy" value={summary.healthy} color="green" />
          <StatCard label="Degraded" value={summary.degraded} color="yellow" />
          <StatCard label="Unhealthy" value={summary.unhealthy} color="red" />
          <StatCard label="Active Alerts" value={summary.activeAlerts} color={summary.activeAlerts > 0 ? "red" : undefined} />
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sources.map((source) => (
              <HealthSourceRow key={source.id} source={source} />
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-400">
                  No sources found. Click "Sync from Patterns" to populate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: "green" | "yellow" | "red" }) {
  const colorClasses = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
  };

  return (
    <div className="border border-gray-800 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color ? colorClasses[color] : ""}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-900/50 text-green-300",
    paused: "bg-yellow-900/50 text-yellow-300",
    removed: "bg-red-900/50 text-red-300",
  };

  return (
    <span className={`text-xs px-2 py-1 rounded ${colors[status] || "bg-gray-700 text-gray-300"}`}>
      {status}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400";
  return <span className={`font-medium ${color}`}>{pct}%</span>;
}

function HealthSourceRow({ source }: { source: SourceHealth }) {
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

  return (
    <tr className="hover:bg-gray-800/30 transition-colors">
      <td className="p-3">
        <Link href={`/sources/${encodeURIComponent(source.domain)}`} className="text-blue-400 hover:underline">
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
      <td className="p-3 text-center text-gray-400">{formatResponseTime(source.avgResponseTimeMs)}</td>
      <td className="p-3 text-center text-gray-400">{source.totalFetches}</td>
      <td className="p-3 text-center">
        {source.dynamicReliability !== null ? (
          <span className={source.dynamicReliability >= 0.8 ? "text-green-400" : source.dynamicReliability >= 0.6 ? "text-yellow-400" : "text-red-400"}>
            {(source.dynamicReliability * 100).toFixed(0)}%
          </span>
        ) : (
          <span className="text-gray-500">-</span>
        )}
      </td>
    </tr>
  );
}

function AddSourceModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    domain: "",
    name: "",
    url: "",
    description: "",
    sourceType: "research" as ManagedSource["sourceType"],
    incentiveType: "academic" as ManagedSource["incentiveType"],
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => (api as unknown as { createManagedSource: (data: typeof formData) => Promise<{ data: ManagedSource }> }).createManagedSource(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-sources"] });
      queryClient.invalidateQueries({ queryKey: ["managed-source-stats"] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create source");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createMutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold mb-4">Add New Source</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-800 text-red-300 rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Domain *</label>
            <input
              type="text"
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="Source Name"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">URL *</label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              placeholder="https://example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Source Type</label>
              <select
                value={formData.sourceType}
                onChange={(e) => setFormData({ ...formData, sourceType: e.target.value as ManagedSource["sourceType"] })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              >
                <option value="research">Research</option>
                <option value="news">News</option>
                <option value="government">Government</option>
                <option value="ngo">NGO</option>
                <option value="think_tank">Think Tank</option>
                <option value="industry">Industry</option>
                <option value="aggregator">Aggregator</option>
                <option value="preprint">Preprint</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Incentive Type</label>
              <select
                value={formData.incentiveType}
                onChange={(e) => setFormData({ ...formData, incentiveType: e.target.value as ManagedSource["incentiveType"] })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
              >
                <option value="academic">Academic</option>
                <option value="nonprofit">Nonprofit</option>
                <option value="commercial">Commercial</option>
                <option value="government">Government</option>
                <option value="advocacy">Advocacy</option>
                <option value="wire_service">Wire Service</option>
                <option value="aggregator">Aggregator</option>
                <option value="platform">Platform</option>
                <option value="independent">Independent</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
            >
              {createMutation.isPending ? "Adding..." : "Add Source"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SourceDetailModal({ source, onClose }: { source: ManagedSource; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "assessment" | "history">("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [assessment, setAssessment] = useState<ManagedSourceAssessment>({
    factualAccuracy: source.factualAccuracy,
    methodologicalRigor: source.methodologicalRigor,
    transparencyScore: source.transparencyScore,
    independenceScore: source.independenceScore,
    ideologicalTransparency: source.ideologicalTransparency,
    fundingTransparency: source.fundingTransparency,
    conflictDisclosure: source.conflictDisclosure,
    perspectiveDiversity: source.perspectiveDiversity,
    geographicNeutrality: source.geographicNeutrality,
    temporalNeutrality: source.temporalNeutrality,
    selectionBiasResistance: source.selectionBiasResistance,
    quantificationBias: source.quantificationBias,
  });

  const { data: historyData } = useQuery({
    queryKey: ["source-history", source.id],
    queryFn: () => (api as unknown as { getManagedSourceHistory: (id: string) => Promise<{ data: { id: string; sourceId: string; assessmentSnapshot: Record<string, number>; changedFields: string[]; changeReason: string | null; assessedBy: string | null; recordedAt: string }[] }> }).getManagedSourceHistory(source.id),
    enabled: activeTab === "history",
  });

  const updateMutation = useMutation({
    mutationFn: (data: ManagedSourceAssessment) =>
      (api as unknown as { updateManagedSourceAssessment: (id: string, data: ManagedSourceAssessment) => Promise<{ data: ManagedSource }> }).updateManagedSourceAssessment(source.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-sources"] });
      queryClient.invalidateQueries({ queryKey: ["source-history", source.id] });
      setIsEditing(false);
    },
  });

  const assessmentFields: Array<{ key: keyof ManagedSourceAssessment; label: string; description: string }> = [
    { key: "factualAccuracy", label: "Factual Accuracy", description: "How accurate are the facts reported?" },
    { key: "methodologicalRigor", label: "Methodological Rigor", description: "How rigorous is the methodology?" },
    { key: "transparencyScore", label: "Transparency", description: "How transparent is the source about methods?" },
    { key: "independenceScore", label: "Independence", description: "Freedom from commercial/political pressure" },
    { key: "ideologicalTransparency", label: "Ideological Transparency", description: "Discloses ideological stance?" },
    { key: "fundingTransparency", label: "Funding Transparency", description: "Discloses funding sources?" },
    { key: "conflictDisclosure", label: "Conflict Disclosure", description: "Discloses conflicts of interest?" },
    { key: "perspectiveDiversity", label: "Perspective Diversity", description: "Represents multiple viewpoints?" },
    { key: "geographicNeutrality", label: "Geographic Neutrality", description: "Avoids geographic/cultural bias?" },
    { key: "temporalNeutrality", label: "Temporal Neutrality", description: "Avoids recency bias?" },
    { key: "selectionBiasResistance", label: "Selection Bias Resistance", description: "Avoids cherry-picking?" },
    { key: "quantificationBias", label: "Quantification Awareness", description: "Acknowledges unmeasurable factors?" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{source.name}</h2>
            <div className="text-sm text-gray-400">{source.domain}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-800 flex">
          {(["overview", "assessment", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm ${
                activeTab === tab
                  ? "border-b-2 border-blue-500 text-blue-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Overall Credibility</div>
                  <div className="text-3xl font-bold">
                    <ScoreBadge score={source.overallCredibility} />
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Debiased Score</div>
                  <div className="text-3xl font-bold">
                    <ScoreBadge score={source.debiasedScore} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Status:</span>{" "}
                  <StatusBadge status={source.status} />
                </div>
                <div>
                  <span className="text-gray-500">Source Type:</span>{" "}
                  <span className="text-gray-300 capitalize">{source.sourceType.replace("_", " ")}</span>
                </div>
                <div>
                  <span className="text-gray-500">Incentive Type:</span>{" "}
                  <span className="text-gray-300 capitalize">{source.incentiveType.replace("_", " ")}</span>
                </div>
                <div>
                  <span className="text-gray-500">Assessment Version:</span>{" "}
                  <span className="text-gray-300">{source.assessmentVersion}</span>
                </div>
              </div>

              {source.description && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">Description</div>
                  <p className="text-gray-300">{source.description}</p>
                </div>
              )}

              {source.notes && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">Notes</div>
                  <p className="text-gray-300">{source.notes}</p>
                </div>
              )}

              <div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline text-sm"
                >
                  {source.url} →
                </a>
              </div>
            </div>
          )}

          {activeTab === "assessment" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                {isEditing ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => updateMutation.mutate(assessment)}
                      disabled={updateMutation.isPending}
                      className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
                    >
                      {updateMutation.isPending ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 rounded"
                  >
                    Edit Assessment
                  </button>
                )}
              </div>

              <div className="grid gap-3">
                {assessmentFields.map(({ key, label, description }) => (
                  <div key={key} className="bg-gray-800/50 rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <div className="font-medium text-sm">{label}</div>
                        <div className="text-xs text-gray-500">{description}</div>
                      </div>
                      {isEditing ? (
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={Math.round((assessment[key] ?? 0.5) * 100)}
                          onChange={(e) => setAssessment({ ...assessment, [key]: parseInt(e.target.value) / 100 })}
                          className="w-32"
                        />
                      ) : null}
                      <div className="text-lg font-bold">
                        <ScoreBadge score={isEditing ? (assessment[key] ?? 0.5) : source[key]} />
                      </div>
                    </div>
                    {!isEditing && (
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            source[key] >= 0.7 ? "bg-green-500" : source[key] >= 0.5 ? "bg-yellow-500" : "bg-red-500"
                          }`}
                          style={{ width: `${source[key] * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-3">
              {historyData?.data && historyData.data.length > 0 ? (
                historyData.data.map((entry) => (
                  <div key={entry.id} className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-gray-400">
                        {new Date(entry.recordedAt).toLocaleString()}
                      </div>
                      {entry.assessedBy && (
                        <div className="text-xs text-gray-500">by {entry.assessedBy}</div>
                      )}
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-500">Changed:</span>{" "}
                      <span className="text-yellow-400">{entry.changedFields.join(", ")}</span>
                    </div>
                    {entry.changeReason && (
                      <div className="text-sm text-gray-400 mt-1">{entry.changeReason}</div>
                    )}
                    <div className="mt-2 text-xs text-gray-500">
                      Debiased: {Math.round(entry.assessmentSnapshot.debiasedScore * 100)}% |
                      Credibility: {Math.round(entry.assessmentSnapshot.overallCredibility * 100)}%
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-400 py-8">
                  No assessment history yet
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
