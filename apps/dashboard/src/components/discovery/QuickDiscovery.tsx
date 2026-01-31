"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, DiscoveryProfile, ManagedSource } from "@/lib/api";
import { SourceSelector } from "./SourceSelector";
import { DomainKeywordInput } from "./DomainKeywordInput";
import { DiscoveryRunList } from "./DiscoveryRunList";

interface QuickDiscoveryProps {
  onRunComplete?: () => void;
}

export function QuickDiscovery({ onRunComplete }: QuickDiscoveryProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Local configuration state (when not using a profile)
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);

  // Fetch profiles
  const { data: profilesData, isLoading: profilesLoading } = useQuery({
    queryKey: ["discoveryProfiles"],
    queryFn: () => api.getDiscoveryProfiles(),
  });

  // Fetch managed sources
  const { data: sourcesData, isLoading: sourcesLoading } = useQuery({
    queryKey: ["managedSources", { status: "active" }],
    queryFn: () => (api as typeof api & { getManagedSources: (params?: { status?: string }) => Promise<{ data: ManagedSource[] }> }).getManagedSources({ status: "active" }),
  });

  // Fetch recent discovery runs (limit 10, with running/pending prioritized)
  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["discoveryRuns"],
    queryFn: () => api.getDiscoveryRuns({ limit: 10 }),
    refetchInterval: 5000, // Refresh every 5 seconds for better real-time updates
  });

  // Create profile mutation
  const createProfileMutation = useMutation({
    mutationFn: (data: { name: string; sourceIds: string[]; domains: string[]; keywords: string[] }) =>
      api.createDiscoveryProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discoveryProfiles"] });
    },
  });

  // Run discovery mutation
  const runDiscoveryMutation = useMutation({
    mutationFn: (profileId: string) => api.runDiscoveryProfile(profileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discoveryRuns"] });
      onRunComplete?.();
    },
  });

  const profiles = profilesData?.data || [];
  const sources = sourcesData?.data || [];
  const runs = runsData?.data || [];

  // Extract unique domains from all sources for suggestions
  const domainSuggestions = useMemo(() => {
    const allDomains = sources.flatMap((s) => s.domains || []);
    return [...new Set(allDomains)].sort();
  }, [sources]);

  // Get selected profile
  const selectedProfile = selectedProfileId
    ? profiles.find((p) => p.id === selectedProfileId)
    : null;

  // Determine current configuration
  const currentConfig = selectedProfile
    ? {
        sourceIds: selectedProfile.sourceIds,
        domains: selectedProfile.domains,
        keywords: selectedProfile.keywords,
      }
    : { sourceIds, domains, keywords };

  const hasConfiguration =
    currentConfig.sourceIds.length > 0 ||
    currentConfig.domains.length > 0 ||
    currentConfig.keywords.length > 0;

  const handleRunDiscovery = async () => {
    if (selectedProfile) {
      runDiscoveryMutation.mutate(selectedProfile.id);
    } else if (hasConfiguration) {
      // Create a quick profile and run it
      const result = await createProfileMutation.mutateAsync({
        name: `Quick Discovery ${new Date().toLocaleDateString()}`,
        sourceIds,
        domains,
        keywords,
      });
      runDiscoveryMutation.mutate(result.data.id);
    }
  };

  const isRunning = runDiscoveryMutation.isPending || createProfileMutation.isPending;
  const hasRunningDiscovery = runs.some((r) => r.status === "running" || r.status === "pending");

  return (
    <section className="border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Quick Discovery</h2>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
        >
          {isExpanded ? "Hide" : "Configure"}
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Profile selector */}
      <div className="mb-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedProfileId(null)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              !selectedProfileId
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Custom
          </button>
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => setSelectedProfileId(profile.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                selectedProfileId === profile.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {profile.name}
              {profile.isDefault && (
                <span className="ml-1 text-xs text-blue-300">(Default)</span>
              )}
            </button>
          ))}
          {profilesLoading && (
            <div className="px-3 py-1.5 bg-gray-800 rounded-lg animate-pulse w-24 h-8" />
          )}
        </div>
      </div>

      {/* Configuration panel */}
      {isExpanded && !selectedProfile && (
        <div className="space-y-4 mb-4 p-4 bg-gray-800/30 rounded-lg">
          <SourceSelector
            sources={sources}
            selectedIds={sourceIds}
            onChange={setSourceIds}
            isLoading={sourcesLoading}
          />

          <DomainKeywordInput
            label="Domains"
            placeholder="Add domains (e.g., climate, health)"
            values={domains}
            onChange={setDomains}
            suggestions={domainSuggestions}
          />

          <DomainKeywordInput
            label="Keywords"
            placeholder="Add search keywords"
            values={keywords}
            onChange={setKeywords}
          />
        </div>
      )}

      {/* Selected profile summary */}
      {selectedProfile && (
        <div className="mb-4 p-3 bg-gray-800/30 rounded-lg">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="text-gray-400">Sources:</span>
            <span className="text-white">{selectedProfile.sourceIds.length}</span>
            <span className="text-gray-600 mx-1">|</span>
            <span className="text-gray-400">Domains:</span>
            <span className="text-white">{selectedProfile.domains.join(", ") || "All"}</span>
            <span className="text-gray-600 mx-1">|</span>
            <span className="text-gray-400">Keywords:</span>
            <span className="text-white">{selectedProfile.keywords.join(", ") || "None"}</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={handleRunDiscovery}
          disabled={isRunning || hasRunningDiscovery || (!selectedProfile && !hasConfiguration)}
          className={`
            px-4 py-2 rounded-lg font-medium text-sm transition-colors
            ${isRunning || hasRunningDiscovery
              ? "bg-gray-700 text-gray-400 cursor-not-allowed"
              : !selectedProfile && !hasConfiguration
              ? "bg-gray-700 text-gray-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
            }
          `}
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Starting...
            </span>
          ) : hasRunningDiscovery ? (
            "Discovery in progress..."
          ) : (
            "Run Discovery"
          )}
        </button>

        {!selectedProfile && !hasConfiguration && (
          <span className="text-sm text-gray-500">
            Select sources, domains, or keywords to run discovery
          </span>
        )}
      </div>

      {/* Recent runs */}
      {(runs.length > 0 || runsLoading) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-400">Recent Discoveries</h3>
            {runsData?.meta && runsData.meta.total > 10 && (
              <Link
                href="/playbooks/executions"
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                View all ({runsData.meta.total})
              </Link>
            )}
          </div>
          <DiscoveryRunList runs={runs} isLoading={runsLoading} />
        </div>
      )}
    </section>
  );
}
