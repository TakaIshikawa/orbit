"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Home() {
  // Fetch counts for pipeline stages
  const { data: patternsData } = useQuery({
    queryKey: ["patterns", { limit: 1 }],
    queryFn: () => api.getPatterns({ limit: 1 }),
  });

  const { data: issuesData } = useQuery({
    queryKey: ["issues", { limit: 1 }],
    queryFn: () => api.getIssues({ limit: 1 }),
  });

  const { data: briefsData } = useQuery({
    queryKey: ["briefs", { limit: 1 }],
    queryFn: () => api.getBriefs({ limit: 1 }),
  });

  const { data: solutionsData } = useQuery({
    queryKey: ["solutions", { limit: 1 }],
    queryFn: () => api.getSolutions({ limit: 1 }),
  });

  const { data: verificationsData } = useQuery({
    queryKey: ["verifications", { limit: 1 }],
    queryFn: () => api.getVerifications({ limit: 1 }),
  });

  // Fetch automation counts
  const { data: playbooksData } = useQuery({
    queryKey: ["playbooks", { limit: 1 }],
    queryFn: () => api.getPlaybooks({ limit: 1 }),
  });

  const { data: schedulerData } = useQuery({
    queryKey: ["scheduledJobs"],
    queryFn: () => api.getScheduledJobs({ limit: 1 }),
  });

  // Fetch monitoring data
  const { data: feedbackStats } = useQuery({
    queryKey: ["feedbackStats"],
    queryFn: () => api.getFeedbackStats(),
  });

  const { data: sourceHealth, isError: sourceHealthError } = useQuery({
    queryKey: ["sourceHealthSummary"],
    queryFn: () => api.getSourceHealthSummary(),
    retry: 1,
  });

  const { data: runsData } = useQuery({
    queryKey: ["runs", { limit: 1 }],
    queryFn: () => api.getRuns({ limit: 1 }),
  });

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.getAgents(),
  });

  // Calculate pipeline stats
  const pipelineStats = {
    patterns: patternsData?.meta?.total ?? 0,
    issues: issuesData?.meta?.total ?? 0,
    briefs: briefsData?.meta?.total ?? 0,
    solutions: solutionsData?.meta?.total ?? 0,
    verifications: verificationsData?.meta?.total ?? 0,
  };

  const automationStats = {
    playbooks: playbooksData?.meta?.total ?? 0,
    scheduledJobs: schedulerData?.meta?.total ?? 0,
  };

  const monitoringStats = {
    sourcesTotal: sourceHealth?.data?.totalSources ?? null,
    sourcesHealthy: sourceHealth?.data?.healthy ?? null,
    sourcesDegraded: sourceHealth?.data ? (sourceHealth.data.degraded + sourceHealth.data.unhealthy) : null,
    sourcesError: sourceHealthError,
    feedbackPending: feedbackStats?.data?.pendingCount ?? 0,
    feedbackProcessed: feedbackStats?.data?.processedLast24h ?? 0,
    runs: runsData?.meta?.total ?? 0,
    agents: agentsData?.data?.length ?? 0,
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Orbit Dashboard</h1>
        <p className="text-gray-400 mt-2">
          Systemic Issue Discovery → AI Analysis → Solution Pipeline
        </p>
      </div>

      {/* Pipeline Section */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xl font-semibold">Pipeline</h2>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
            Scout → Analyze → Brief → Plan → Verify
          </span>
        </div>

        <div className="relative">
          {/* Pipeline flow visualization */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-800 -translate-y-1/2 z-0" />

          <div className="grid grid-cols-5 gap-4 relative z-10">
            <PipelineStageCard
              step={1}
              title="Patterns"
              description="Discovered from sources"
              href="/patterns"
              count={pipelineStats.patterns}
              color="blue"
            />
            <PipelineStageCard
              step={2}
              title="Issues"
              description="IUTLN scored"
              href="/issues"
              count={pipelineStats.issues}
              color="purple"
            />
            <PipelineStageCard
              step={3}
              title="Briefs"
              description="Problem analysis"
              href="/briefs"
              count={pipelineStats.briefs}
              color="orange"
            />
            <PipelineStageCard
              step={4}
              title="Solutions"
              description="Proposed actions"
              href="/solutions"
              count={pipelineStats.solutions}
              color="green"
            />
            <PipelineStageCard
              step={5}
              title="Verifications"
              description="Evidence checked"
              href="/verifications"
              count={pipelineStats.verifications}
              color="cyan"
            />
          </div>
        </div>
      </section>

      {/* Two-column layout for Automation and Monitoring */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Automation Section */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Automation</h2>
          <div className="space-y-4">
            <AutomationCard
              title="Playbooks"
              description="Reusable workflow templates"
              href="/playbooks"
              count={automationStats.playbooks}
              icon="📖"
            />
            <AutomationCard
              title="Scheduler"
              description="Scheduled jobs and triggers"
              href="/scheduler"
              count={automationStats.scheduledJobs}
              icon="🕐"
            />
          </div>
        </section>

        {/* Monitoring Section */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Monitoring</h2>
          <div className="grid grid-cols-2 gap-4">
            <MonitoringCard
              title="Sources"
              href="/sources"
              icon="🌐"
              stats={monitoringStats.sourcesError ? [
                { label: "Status", value: "No data", color: "gray" },
              ] : [
                { label: "Healthy", value: monitoringStats.sourcesHealthy ?? "—", color: "green" },
                { label: "Degraded", value: monitoringStats.sourcesDegraded ?? "—", color: "yellow" },
              ]}
            />
            <MonitoringCard
              title="Feedback"
              href="/feedback"
              icon="🔄"
              stats={[
                { label: "Pending", value: monitoringStats.feedbackPending, color: "yellow" },
                { label: "Processed (24h)", value: monitoringStats.feedbackProcessed, color: "green" },
              ]}
            />
            <MonitoringCard
              title="Runs"
              href="/runs"
              icon="▶"
              stats={[
                { label: "Total", value: monitoringStats.runs, color: "blue" },
              ]}
            />
            <MonitoringCard
              title="Agents"
              href="/agents"
              icon="⚙"
              stats={[
                { label: "Registered", value: monitoringStats.agents, color: "purple" },
              ]}
            />
          </div>
        </section>
      </div>

      {/* Workflow Guide */}
      <section className="border border-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Workflow Guide</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <WorkflowStep
            number="1"
            title="Scout"
            command="npm run scout"
            description="Discover patterns from research, news, and reports"
          />
          <WorkflowStep
            number="2"
            title="Analyze"
            command="npm run analyze"
            description="Synthesize patterns into IUTLN-scored issues"
          />
          <WorkflowStep
            number="3"
            title="Brief"
            command="npm run brief"
            description="Generate problem briefs with system mapping"
          />
          <WorkflowStep
            number="4"
            title="Plan"
            command="npm run plan"
            description="Design solutions with feasibility analysis"
          />
          <WorkflowStep
            number="5"
            title="Verify"
            command="npm run verify"
            description="Cross-reference claims against sources"
          />
          <WorkflowStep
            number="→"
            title="Automate"
            command="npm run playbook"
            description="Orchestrate multi-stage workflows"
          />
        </div>
      </section>
    </div>
  );
}

function PipelineStageCard({
  step,
  title,
  description,
  href,
  count,
  color,
}: {
  step: number;
  title: string;
  description: string;
  href: string;
  count: number;
  color: "blue" | "purple" | "orange" | "green" | "cyan";
}) {
  const colors = {
    blue: "border-blue-500/50 bg-blue-500/10",
    purple: "border-purple-500/50 bg-purple-500/10",
    orange: "border-orange-500/50 bg-orange-500/10",
    green: "border-green-500/50 bg-green-500/10",
    cyan: "border-cyan-500/50 bg-cyan-500/10",
  };

  const stepColors = {
    blue: "bg-blue-500",
    purple: "bg-purple-500",
    orange: "bg-orange-500",
    green: "bg-green-500",
    cyan: "bg-cyan-500",
  };

  return (
    <Link
      href={href}
      className={`block border rounded-lg p-4 hover:border-gray-600 transition-colors ${colors[color]}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-6 h-6 rounded-full ${stepColors[color]} text-white text-xs font-bold flex items-center justify-center`}>
          {step}
        </span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="text-3xl font-bold mb-1">{count}</div>
      <p className="text-gray-400 text-xs">{description}</p>
    </Link>
  );
}

function AutomationCard({
  title,
  description,
  href,
  count,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  count: number;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
    >
      <span className="text-2xl">{icon}</span>
      <div className="flex-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-gray-400 text-sm">{description}</p>
      </div>
      <span className="text-2xl font-bold text-gray-500">{count}</span>
    </Link>
  );
}

function MonitoringCard({
  title,
  href,
  icon,
  stats,
}: {
  title: string;
  href: string;
  icon: string;
  stats: Array<{ label: string; value: number | string; color: "green" | "yellow" | "blue" | "purple" | "gray" }>;
}) {
  const colors = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    blue: "text-blue-400",
    purple: "text-purple-400",
    gray: "text-gray-500",
  };

  return (
    <Link
      href={href}
      className="block border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="space-y-1">
        {stats.map((stat, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-400">{stat.label}</span>
            <span className={`font-medium ${colors[stat.color]}`}>{stat.value}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

function WorkflowStep({
  number,
  title,
  command,
  description,
}: {
  number: string;
  title: string;
  command: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-gray-800 text-gray-400 text-xs font-bold flex items-center justify-center">
          {number}
        </span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <code className="block bg-gray-800 px-3 py-1.5 rounded text-sm text-gray-300">
        {command}
      </code>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  );
}
