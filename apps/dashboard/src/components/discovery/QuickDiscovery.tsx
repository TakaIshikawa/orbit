"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ManagedSource } from "@/lib/api";
import { SourceSelector } from "./SourceSelector";
import { DomainKeywordInput } from "./DomainKeywordInput";
import { DiscoveryRunList } from "./DiscoveryRunList";

interface QuickDiscoveryProps {
  onRunComplete?: () => void;
}

export function QuickDiscovery({ onRunComplete }: QuickDiscoveryProps) {
  const queryClient = useQueryClient();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [showAllRuns, setShowAllRuns] = useState(false);

  // Local configuration state
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);

  // Fetch managed sources
  const { data: sourcesData, isLoading: sourcesLoading } = useQuery({
    queryKey: ["managedSources", { status: "active" }],
    queryFn: () => (api as typeof api & { getManagedSources: (params?: { status?: string }) => Promise<{ data: ManagedSource[] }> }).getManagedSources({ status: "active" }),
  });

  // Fetch recent discovery runs (limit 10, with running/pending prioritized)
  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["discoveryRuns"],
    queryFn: () => api.getDiscoveryRuns({ limit: 10 }),
    refetchInterval: 5000,
  });

  // Create profile mutation
  const createProfileMutation = useMutation({
    mutationFn: (data: { name: string; sourceIds: string[]; domains: string[]; keywords: string[] }) =>
      api.createDiscoveryProfile(data),
  });

  // Run discovery mutation
  const runDiscoveryMutation = useMutation({
    mutationFn: (profileId: string) => api.runDiscoveryProfile(profileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discoveryRuns"] });
      setIsConfigOpen(false);
      onRunComplete?.();
    },
  });

  const sources = sourcesData?.data || [];
  const runs = runsData?.data || [];

  // Show only 3 runs by default, all when expanded
  const displayedRuns = showAllRuns ? runs : runs.slice(0, 3);
  const hasMoreRuns = runs.length > 3;

  // Extract unique domains from all sources for suggestions
  const domainSuggestions = useMemo(() => {
    const allDomains = sources.flatMap((s) => s.domains || []);
    return [...new Set(allDomains)].sort();
  }, [sources]);

  const hasConfiguration =
    sourceIds.length > 0 || domains.length > 0 || keywords.length > 0;

  const handleRunDiscovery = async () => {
    if (hasConfiguration) {
      const result = await createProfileMutation.mutateAsync({
        name: `Quick Discovery ${new Date().toLocaleDateString()}`,
        sourceIds,
        domains,
        keywords,
      });
      runDiscoveryMutation.mutate(result.data.id);
    }
  };

  const handleClearConfig = () => {
    setSourceIds([]);
    setDomains([]);
    setKeywords([]);
  };

  const isRunning = runDiscoveryMutation.isPending || createProfileMutation.isPending;
  const hasRunningDiscovery = runs.some((r) => r.status === "running" || r.status === "pending");

  return (
    <div className="space-y-6">
      {/* Discovery Runner Section */}
      <section className="border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Run Discovery</h2>
        </div>

        {/* Current configuration summary or empty state */}
        {hasConfiguration ? (
          <div className="mb-4 p-4 bg-gray-800/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-300">Current Configuration</span>
              <button
                type="button"
                onClick={() => setIsConfigOpen(true)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Edit
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {sourceIds.length > 0 && (
                <span className="px-2 py-1 bg-gray-700 rounded text-gray-300">
                  {sourceIds.length} source{sourceIds.length !== 1 ? "s" : ""}
                </span>
              )}
              {domains.map((d) => (
                <span key={d} className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded">
                  {d}
                </span>
              ))}
              {keywords.map((k) => (
                <span key={k} className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded">
                  {k}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm mb-4">
            Configure sources, domains, and keywords to start a discovery run.
          </p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsConfigOpen(true)}
            className="px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configure
          </button>

          <button
            type="button"
            onClick={handleRunDiscovery}
            disabled={isRunning || hasRunningDiscovery || !hasConfiguration}
            className={`
              px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2
              ${isRunning || hasRunningDiscovery || !hasConfiguration
                ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
              }
            `}
          >
            {isRunning ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Starting...
              </>
            ) : hasRunningDiscovery ? (
              <>
                <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                </svg>
                In Progress...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Run Discovery
              </>
            )}
          </button>
        </div>
      </section>

      {/* Recent Discoveries Section */}
      {(runs.length > 0 || runsLoading) && (
        <section className="border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Recent Discoveries</h2>
            {runsData?.meta && runsData.meta.total > 10 && (
              <Link
                href="/issues"
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                View all issues
              </Link>
            )}
          </div>

          <DiscoveryRunList runs={displayedRuns} isLoading={runsLoading} />

          {/* Expand/Collapse button */}
          {hasMoreRuns && !runsLoading && (
            <button
              type="button"
              onClick={() => setShowAllRuns(!showAllRuns)}
              className="mt-3 w-full py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              {showAllRuns ? (
                <>
                  Show less
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </>
              ) : (
                <>
                  Show {runs.length - 3} more
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>
          )}
        </section>
      )}

      {/* Configuration Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsConfigOpen(false)}
          />

          {/* Modal */}
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Configure Discovery</h3>
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <SourceSelector
                sources={sources}
                selectedIds={sourceIds}
                onChange={setSourceIds}
                isLoading={sourcesLoading}
              />

              <DomainKeywordInput
                label="Domains"
                placeholder="Add domains (e.g., climate, health, ai)"
                values={domains}
                onChange={setDomains}
                suggestions={domainSuggestions}
              />

              <DomainKeywordInput
                label="Keywords"
                placeholder="Add search keywords (e.g., emerging risks)"
                values={keywords}
                onChange={setKeywords}
              />
            </div>

            <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 px-6 py-4 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClearConfig}
                className="text-sm text-gray-400 hover:text-white"
              >
                Clear all
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsConfigOpen(false);
                    if (hasConfiguration) {
                      handleRunDiscovery();
                    }
                  }}
                  disabled={!hasConfiguration || isRunning || hasRunningDiscovery}
                  className={`
                    px-4 py-2 rounded-lg font-medium text-sm transition-colors
                    ${!hasConfiguration || isRunning || hasRunningDiscovery
                      ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                    }
                  `}
                >
                  Save & Run
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
