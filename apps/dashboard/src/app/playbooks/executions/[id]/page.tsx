"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type PlaybookStepExecution, type PlaybookExecution } from "@/lib/api";
import Link from "next/link";

interface ArtifactSummary {
  patterns: string[];
  issues: string[];
  solutions: string[];
  briefs: string[];
  verifications: number;
}

interface SourceUsed {
  id: string;
  name: string;
  url: string;
  credibility: number;
}

export default function ExecutionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["playbook-execution", id],
    queryFn: () => api.getPlaybookExecution(id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Loading execution...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/playbooks" className="text-blue-400 hover:underline text-sm">
          &larr; Back to playbooks
        </Link>
        <div className="text-red-400 border border-red-800 rounded-lg p-4">
          <p className="font-medium">Error loading execution</p>
          <p className="text-sm mt-1">{error instanceof Error ? error.message : "Not found"}</p>
        </div>
      </div>
    );
  }

  const execution = data.data as PlaybookExecution & { steps: PlaybookStepExecution[] };

  // Extract artifacts created during execution
  const artifacts = extractArtifacts(execution);

  // Safely extract context values
  const ctx = execution.context;
  const hasContext: boolean = !!(ctx && (ctx.patternId || ctx.issueId || ctx.briefId));

  const statusColors: Record<string, string> = {
    pending: "bg-gray-700 text-gray-300",
    running: "bg-blue-900/50 text-blue-300",
    paused: "bg-yellow-900/50 text-yellow-300",
    completed: "bg-green-900/50 text-green-300",
    failed: "bg-red-900/50 text-red-300",
    cancelled: "bg-gray-700 text-gray-300",
    skipped: "bg-gray-700 text-gray-300",
  };

  const stepStatusColors: Record<string, string> = {
    pending: "border-gray-600 bg-gray-900",
    running: "border-blue-500 bg-blue-900/20",
    completed: "border-green-500 bg-green-900/20",
    failed: "border-red-500 bg-red-900/20",
    skipped: "border-gray-600 bg-gray-900/50",
  };

  const duration = execution.completedAt
    ? new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/playbooks/${execution.playbookId}`} className="text-blue-400 hover:underline text-sm">
          &larr; Back to playbook
        </Link>
      </div>

      {/* Header */}
      <div className="border border-gray-800 rounded-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">Execution</h1>
              <span className={`text-xs px-2 py-1 rounded ${statusColors[execution.status]}`}>
                {execution.status}
              </span>
            </div>
            <p className="text-gray-400 text-sm font-mono">{execution.id}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Triggered By</span>
            <p className="font-medium">{execution.triggeredBy}</p>
          </div>
          <div>
            <span className="text-gray-500">Progress</span>
            <p className="font-medium">{execution.currentStep}/{execution.totalSteps} steps</p>
          </div>
          <div>
            <span className="text-gray-500">Started</span>
            <p className="font-medium">{new Date(execution.startedAt).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-gray-500">Duration</span>
            <p className="font-medium">
              {duration !== null ? `${(duration / 1000).toFixed(1)}s` : "In progress"}
            </p>
          </div>
        </div>

        {execution.error && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-lg">
            <span className="text-red-400 text-sm font-medium">Error: </span>
            <span className="text-red-300 text-sm">{execution.error}</span>
          </div>
        )}
      </div>

      {hasContext && (
        <div className="border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Context</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {ctx.patternId && (
              <div>
                <span className="text-gray-500">Pattern ID</span>
                <Link href={`/patterns/${ctx.patternId}`} className="text-blue-400 hover:underline font-mono text-sm block">
                  {ctx.patternId}
                </Link>
              </div>
            )}
            {ctx.issueId && (
              <div>
                <span className="text-gray-500">Issue ID</span>
                <Link href={`/issues/${ctx.issueId}`} className="text-blue-400 hover:underline font-mono text-sm block">
                  {ctx.issueId}
                </Link>
              </div>
            )}
            {ctx.briefId && (
              <div>
                <span className="text-gray-500">Brief ID</span>
                <Link href={`/briefs/${ctx.briefId}`} className="text-blue-400 hover:underline font-mono text-sm block">
                  {ctx.briefId}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sources Used */}
      {Array.isArray((execution.output as { sourcesUsed?: unknown })?.sourcesUsed) &&
       ((execution.output as { sourcesUsed?: SourceUsed[] }).sourcesUsed ?? []).length > 0 && (
        <div className="border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Sources Used</h2>
          <div className="space-y-3">
            {(execution.output.sourcesUsed as SourceUsed[]).map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {source.name}
                  </a>
                  <p className="text-sm text-gray-500 truncate">{source.url}</p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <div className="text-right">
                    <div className={`text-sm font-medium ${
                      source.credibility >= 0.8 ? "text-green-400" :
                      source.credibility >= 0.6 ? "text-yellow-400" :
                      "text-orange-400"
                    }`}>
                      {Math.round(source.credibility * 100)}%
                    </div>
                    <div className="text-xs text-gray-500">credibility</div>
                  </div>
                  <Link
                    href={`/sources/${source.id}`}
                    className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                    title="View source details"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Artifacts Created */}
      {(artifacts.patterns.length > 0 || artifacts.issues.length > 0 || artifacts.solutions.length > 0 || artifacts.briefs.length > 0 || artifacts.verifications > 0) && (
        <div className="border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Artifacts Created</h2>
          <div className="space-y-4">
            {artifacts.patterns.length > 0 && (
              <ArtifactGroup
                label="Patterns"
                ids={artifacts.patterns}
                linkPrefix="/patterns"
                color="purple"
              />
            )}
            {artifacts.issues.length > 0 && (
              <ArtifactGroup
                label="Issues"
                ids={artifacts.issues}
                linkPrefix="/issues"
                color="red"
              />
            )}
            {artifacts.solutions.length > 0 && (
              <ArtifactGroup
                label="Solutions"
                ids={artifacts.solutions}
                linkPrefix="/solutions"
                color="green"
              />
            )}
            {artifacts.briefs.length > 0 && (
              <ArtifactGroup
                label="Briefs"
                ids={artifacts.briefs}
                linkPrefix="/briefs"
                color="blue"
              />
            )}
            {artifacts.verifications > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Verifications:</span>
                <span className="text-sm font-medium text-yellow-400">{artifacts.verifications}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Steps */}
      <div className="border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Steps</h2>
        {execution.steps.length === 0 ? (
          <p className="text-gray-500 text-sm">No steps executed yet</p>
        ) : (
          <div className="space-y-3">
            {execution.steps.map((step, idx) => (
              <StepCard key={step.id} step={step} index={idx} statusColors={stepStatusColors} />
            ))}
          </div>
        )}
      </div>

      {/* Logs */}
      {execution.logs && execution.logs.length > 0 && (
        <div className="border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Logs</h2>
          <div className="space-y-1 font-mono text-sm max-h-96 overflow-y-auto">
            {execution.logs.map((log, idx) => (
              <div key={idx} className="flex gap-3 py-1">
                <span className="text-gray-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 w-12 ${
                  log.level === "error" ? "text-red-400" :
                  log.level === "warn" ? "text-yellow-400" :
                  "text-gray-400"
                }`}>
                  [{log.level}]
                </span>
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output */}
      {execution.output && Object.keys(execution.output).length > 0 && (
        <div className="border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Output</h2>
          <pre className="text-sm text-gray-300 bg-gray-900 p-4 rounded-lg overflow-auto max-h-96">
            {JSON.stringify(execution.output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function StepCard({ step, index, statusColors }: { step: PlaybookStepExecution; index: number; statusColors: Record<string, string> }) {
  const duration = step.completedAt && step.startedAt
    ? new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
    : step.durationMs;

  // Extract any artifact IDs from step output
  const stepArtifacts = extractStepArtifacts(step.output);

  return (
    <div className={`border rounded-lg p-4 ${statusColors[step.status] || statusColors.pending}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 flex items-center justify-center bg-gray-800 rounded text-sm">
            {index + 1}
          </div>
          <span className="font-medium">{step.stepName}</span>
          <span className="text-xs px-2 py-0.5 bg-gray-800 rounded text-gray-400">
            {step.actionType}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {duration !== null && (
            <span className="text-xs text-gray-500">{duration}ms</span>
          )}
          <span className={`text-xs px-2 py-1 rounded ${
            step.status === "completed" ? "bg-green-900/50 text-green-300" :
            step.status === "failed" ? "bg-red-900/50 text-red-300" :
            step.status === "running" ? "bg-blue-900/50 text-blue-300" :
            step.status === "skipped" ? "bg-gray-700 text-gray-400" :
            "bg-gray-700 text-gray-300"
          }`}>
            {step.status}
          </span>
        </div>
      </div>

      {/* Step Artifacts Summary */}
      {stepArtifacts.total > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 mb-2">
          {stepArtifacts.patterns > 0 && (
            <span className="text-xs px-2 py-0.5 bg-purple-900/30 text-purple-300 rounded">
              {stepArtifacts.patterns} pattern{stepArtifacts.patterns !== 1 ? "s" : ""}
            </span>
          )}
          {stepArtifacts.issues > 0 && (
            <span className="text-xs px-2 py-0.5 bg-red-900/30 text-red-300 rounded">
              {stepArtifacts.issues} issue{stepArtifacts.issues !== 1 ? "s" : ""}
            </span>
          )}
          {stepArtifacts.solutions > 0 && (
            <span className="text-xs px-2 py-0.5 bg-green-900/30 text-green-300 rounded">
              {stepArtifacts.solutions} solution{stepArtifacts.solutions !== 1 ? "s" : ""}
            </span>
          )}
          {stepArtifacts.verifications > 0 && (
            <span className="text-xs px-2 py-0.5 bg-yellow-900/30 text-yellow-300 rounded">
              {stepArtifacts.verifications} verification{stepArtifacts.verifications !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {step.error && (
        <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded text-sm">
          <span className="text-red-400">Error: </span>
          <span className="text-red-300">{step.error}</span>
        </div>
      )}

      {step.output && Object.keys(step.output).length > 0 && (
        <details className="mt-2">
          <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
            View output
          </summary>
          <pre className="mt-2 text-xs text-gray-400 bg-gray-900 p-2 rounded overflow-auto max-h-48">
            {JSON.stringify(step.output, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function ArtifactGroup({
  label,
  ids,
  linkPrefix,
  color,
}: {
  label: string;
  ids: string[];
  linkPrefix: string;
  color: "purple" | "red" | "green" | "blue" | "yellow";
}) {
  const colorClasses = {
    purple: "bg-purple-900/30 text-purple-300 hover:bg-purple-900/50",
    red: "bg-red-900/30 text-red-300 hover:bg-red-900/50",
    green: "bg-green-900/30 text-green-300 hover:bg-green-900/50",
    blue: "bg-blue-900/30 text-blue-300 hover:bg-blue-900/50",
    yellow: "bg-yellow-900/30 text-yellow-300 hover:bg-yellow-900/50",
  };

  return (
    <div>
      <span className="text-sm text-gray-400 mr-2">{label}:</span>
      <div className="flex flex-wrap gap-2 mt-1">
        {ids.slice(0, 10).map((id) => (
          <Link
            key={id}
            href={`${linkPrefix}/${id}`}
            className={`text-xs px-2 py-1 rounded font-mono transition-colors ${colorClasses[color]}`}
          >
            {id.length > 20 ? `${id.slice(0, 8)}...${id.slice(-8)}` : id}
          </Link>
        ))}
        {ids.length > 10 && (
          <span className="text-xs text-gray-500">+{ids.length - 10} more</span>
        )}
      </div>
    </div>
  );
}

function extractArtifacts(execution: PlaybookExecution & { steps: PlaybookStepExecution[] }): ArtifactSummary {
  const artifacts: ArtifactSummary = {
    patterns: [],
    issues: [],
    solutions: [],
    briefs: [],
    verifications: 0,
  };

  // Extract from execution output
  if (execution.output) {
    extractFromObject(execution.output, artifacts);
  }

  // Extract from step outputs
  for (const step of execution.steps || []) {
    if (step.output) {
      extractFromObject(step.output, artifacts);
    }
  }

  // Deduplicate
  artifacts.patterns = [...new Set(artifacts.patterns)];
  artifacts.issues = [...new Set(artifacts.issues)];
  artifacts.solutions = [...new Set(artifacts.solutions)];
  artifacts.briefs = [...new Set(artifacts.briefs)];

  return artifacts;
}

function extractFromObject(obj: Record<string, unknown>, artifacts: ArtifactSummary) {
  const str = JSON.stringify(obj);

  // Extract pattern IDs (pat_xxx format)
  const patternMatches = str.match(/pat_[a-zA-Z0-9]+/g);
  if (patternMatches) {
    artifacts.patterns.push(...patternMatches);
  }

  // Extract issue IDs (iss_xxx format)
  const issueMatches = str.match(/iss_[a-zA-Z0-9]+/g);
  if (issueMatches) {
    artifacts.issues.push(...issueMatches);
  }

  // Extract solution IDs (sol_xxx format)
  const solutionMatches = str.match(/sol_[a-zA-Z0-9]+/g);
  if (solutionMatches) {
    artifacts.solutions.push(...solutionMatches);
  }

  // Extract brief IDs (brf_xxx format)
  const briefMatches = str.match(/brf_[a-zA-Z0-9]+/g);
  if (briefMatches) {
    artifacts.briefs.push(...briefMatches);
  }

  // Check for verification counts
  if (typeof obj === "object" && obj !== null) {
    if ("verificationsCreated" in obj && typeof obj.verificationsCreated === "number") {
      artifacts.verifications += obj.verificationsCreated;
    }
    if ("verificationCount" in obj && typeof obj.verificationCount === "number") {
      artifacts.verifications += obj.verificationCount;
    }
  }
}

function extractStepArtifacts(output: Record<string, unknown>): { patterns: number; issues: number; solutions: number; verifications: number; total: number } {
  const result = { patterns: 0, issues: 0, solutions: 0, verifications: 0, total: 0 };

  if (!output) return result;

  const str = JSON.stringify(output);

  // Count unique IDs
  const patternMatches = str.match(/pat_[a-zA-Z0-9]+/g);
  const issueMatches = str.match(/iss_[a-zA-Z0-9]+/g);
  const solutionMatches = str.match(/sol_[a-zA-Z0-9]+/g);

  result.patterns = patternMatches ? new Set(patternMatches).size : 0;
  result.issues = issueMatches ? new Set(issueMatches).size : 0;
  result.solutions = solutionMatches ? new Set(solutionMatches).size : 0;

  // Check for verification counts
  if (typeof output === "object" && output !== null) {
    if ("verificationsCreated" in output && typeof output.verificationsCreated === "number") {
      result.verifications = output.verificationsCreated;
    }
    if ("verificationCount" in output && typeof output.verificationCount === "number") {
      result.verifications = output.verificationCount;
    }
  }

  result.total = result.patterns + result.issues + result.solutions + result.verifications;
  return result;
}
