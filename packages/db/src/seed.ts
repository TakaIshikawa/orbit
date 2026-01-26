import { getDatabase } from "./client.js";
import {
  PatternRepository,
  IssueRepository,
  SolutionRepository,
  RunLogRepository,
} from "./repositories/index.js";
import { computeContentHash } from "@orbit/core";

const SYSTEM_AUTHOR = "system:seed";

// Helper to generate IDs
function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Helper to create base record fields
async function createBaseFields(data: object, author = SYSTEM_AUTHOR) {
  const contentHash = await computeContentHash(data);
  // For seed data, use a placeholder signature
  // In production, this would use createRecordSignature with a real private key
  const signature = `sig:seed-${contentHash.slice(7, 23)}`;

  return {
    contentHash,
    author,
    authorSignature: signature,
  };
}

async function seedPatterns(patternRepo: PatternRepository): Promise<string[]> {
  console.log("Seeding patterns...");

  const patternsData = [
    {
      id: generateId("pat"),
      title: "Regulatory Lag in AI Governance",
      description:
        "Government regulatory frameworks consistently trail technological advancement by 5-10 years, creating periods of unregulated deployment that establish entrenched practices difficult to modify retroactively.",
      patternType: "policy_gap" as const,
      domains: ["technology", "policy", "governance"],
      geographies: ["global", "us", "eu"],
      sources: [
        {
          type: "research",
          url: "https://example.org/ai-governance-gap",
          title: "The AI Governance Gap",
          reliability: 0.85,
        },
      ],
      firstObserved: new Date("2020-01-15"),
      observationFrequency: "continuous" as const,
      confidence: 0.88,
    },
    {
      id: generateId("pat"),
      title: "Information Asymmetry in Healthcare Pricing",
      description:
        "Patients consistently lack access to procedure pricing information before treatment, while providers possess complete cost data, leading to suboptimal consumer decisions and inflated costs.",
      patternType: "information_asymmetry" as const,
      domains: ["healthcare", "economics", "consumer-rights"],
      geographies: ["us"],
      sources: [
        {
          type: "report",
          url: "https://example.org/healthcare-pricing",
          title: "Healthcare Price Transparency Report",
          reliability: 0.9,
        },
      ],
      firstObserved: new Date("2015-06-01"),
      observationFrequency: "continuous" as const,
      confidence: 0.92,
    },
    {
      id: generateId("pat"),
      title: "Tragedy of the Digital Commons",
      description:
        "Open source maintainers bear disproportionate costs while benefits accrue to commercial entities, leading to burnout and abandoned critical infrastructure projects.",
      patternType: "coordination_failure" as const,
      domains: ["technology", "economics", "labor"],
      geographies: ["global"],
      sources: [
        {
          type: "observation",
          url: "https://example.org/oss-sustainability",
          title: "Open Source Sustainability Crisis",
          reliability: 0.82,
        },
      ],
      firstObserved: new Date("2018-03-20"),
      observationFrequency: "recurring" as const,
      confidence: 0.85,
    },
    {
      id: generateId("pat"),
      title: "Algorithmic Amplification of Polarization",
      description:
        "Engagement-optimizing recommendation algorithms systematically promote divisive content, creating feedback loops that increase political polarization and reduce shared factual basis.",
      patternType: "feedback_loop" as const,
      domains: ["technology", "media", "politics", "society"],
      geographies: ["global", "us"],
      sources: [
        {
          type: "research",
          url: "https://example.org/algorithmic-polarization",
          title: "Social Media and Political Polarization",
          reliability: 0.88,
        },
      ],
      firstObserved: new Date("2016-11-01"),
      observationFrequency: "continuous" as const,
      confidence: 0.9,
    },
    {
      id: generateId("pat"),
      title: "Housing Supply Bottleneck",
      description:
        "Zoning regulations, NIMBY opposition, and approval processes create structural barriers to housing construction in high-demand areas, driving affordability crises.",
      patternType: "structural_inefficiency" as const,
      domains: ["housing", "urban-planning", "economics"],
      geographies: ["us", "uk", "canada", "australia"],
      sources: [
        {
          type: "research",
          url: "https://example.org/housing-supply",
          title: "Barriers to Housing Construction",
          reliability: 0.91,
        },
      ],
      firstObserved: new Date("2010-01-01"),
      observationFrequency: "continuous" as const,
      confidence: 0.94,
    },
  ];

  const patternIds: string[] = [];

  for (const data of patternsData) {
    const baseFields = await createBaseFields(data);
    await patternRepo.create({
      ...data,
      ...baseFields,
      status: "active",
    });
    patternIds.push(data.id);
    console.log(`  Created pattern: ${data.title}`);
  }

  return patternIds;
}

async function seedIssues(issueRepo: IssueRepository, patternIds: string[]): Promise<string[]> {
  console.log("Seeding issues...");

  const issuesData = [
    {
      id: generateId("iss"),
      title: "AI Systems Deployed Without Safety Standards",
      summary:
        "AI systems are being deployed in critical domains (healthcare, criminal justice, hiring) without established safety standards or accountability mechanisms.",
      patternIds: [patternIds[0]],
      rootCauses: [
        "Rapid technological advancement",
        "Regulatory capture",
        "Lack of technical expertise in government",
      ],
      affectedDomains: ["technology", "policy", "healthcare", "employment"],
      leveragePoints: [
        "Mandatory impact assessments",
        "Industry standards bodies",
        "Procurement requirements",
      ],
      scoreImpact: 0.85,
      scoreUrgency: 0.9,
      scoreTractability: 0.65,
      scoreLegitimacy: 0.8,
      scoreNeglectedness: 0.6,
      compositeScore: 0.76,
      upstreamIssues: [],
      downstreamIssues: [],
      relatedIssues: [],
      timeHorizon: "years" as const,
      propagationVelocity: "fast" as const,
      issueStatus: "investigating" as const,
    },
    {
      id: generateId("iss"),
      title: "Critical Open Source Infrastructure Underfunded",
      summary:
        "Core internet infrastructure depends on volunteer-maintained open source projects that lack sustainable funding, creating systemic risk.",
      patternIds: [patternIds[2]],
      rootCauses: [
        "Free rider problem",
        "Invisible infrastructure",
        "Corporate externalization of costs",
      ],
      affectedDomains: ["technology", "economics", "security"],
      leveragePoints: [
        "Corporate contribution requirements",
        "Government funding programs",
        "Foundation support",
      ],
      scoreImpact: 0.75,
      scoreUrgency: 0.7,
      scoreTractability: 0.8,
      scoreLegitimacy: 0.85,
      scoreNeglectedness: 0.75,
      compositeScore: 0.77,
      upstreamIssues: [],
      downstreamIssues: [],
      relatedIssues: [],
      timeHorizon: "years" as const,
      propagationVelocity: "medium" as const,
      issueStatus: "identified" as const,
    },
    {
      id: generateId("iss"),
      title: "Erosion of Shared Epistemic Foundation",
      summary:
        "Algorithmic content curation and information silos are fragmenting shared understanding of facts, undermining democratic deliberation.",
      patternIds: [patternIds[3]],
      rootCauses: [
        "Engagement optimization",
        "Attention economy",
        "Platform market concentration",
      ],
      affectedDomains: ["media", "politics", "society", "technology"],
      leveragePoints: [
        "Algorithmic transparency requirements",
        "Platform interoperability",
        "Media literacy education",
      ],
      scoreImpact: 0.9,
      scoreUrgency: 0.85,
      scoreTractability: 0.5,
      scoreLegitimacy: 0.75,
      scoreNeglectedness: 0.55,
      compositeScore: 0.71,
      upstreamIssues: [],
      downstreamIssues: [],
      relatedIssues: [],
      timeHorizon: "decades" as const,
      propagationVelocity: "fast" as const,
      issueStatus: "investigating" as const,
    },
  ];

  const issueIds: string[] = [];

  for (const data of issuesData) {
    const baseFields = await createBaseFields(data);
    await issueRepo.create({
      ...data,
      ...baseFields,
      status: "active",
    });
    issueIds.push(data.id);
    console.log(`  Created issue: ${data.title}`);
  }

  return issueIds;
}

async function seedSolutions(solutionRepo: SolutionRepository): Promise<string[]> {
  console.log("Seeding solutions...");

  const solutionsData = [
    {
      id: generateId("sol"),
      situationModelId: "sm-placeholder-1",
      title: "AI Impact Assessment Framework",
      summary:
        "A standardized framework for assessing AI system impacts before deployment, with mandatory review for high-risk applications.",
      solutionType: "system" as const,
      mechanism:
        "Establishes a tiered review process based on risk level, with public reporting requirements and enforcement mechanisms.",
      components: [
        {
          name: "Risk Classification System",
          description: "Categorizes AI applications by potential harm",
          complexity: "medium",
        },
        {
          name: "Assessment Protocol",
          description: "Standardized evaluation methodology",
          complexity: "high",
        },
        {
          name: "Reporting Portal",
          description: "Public database of assessments",
          complexity: "low",
        },
      ],
      preconditions: ["Legislative authority", "Technical expertise pool", "Industry buy-in"],
      risks: [
        {
          description: "Regulatory capture by industry",
          likelihood: "medium",
          impact: "high",
        },
        {
          description: "Innovation chilling effect",
          likelihood: "low",
          impact: "medium",
        },
      ],
      metrics: [
        { name: "Assessment completion rate", target: "95%" },
        { name: "Time to review", target: "<30 days" },
      ],
      executionPlan: [],
      artifacts: [],
      addressesIssues: [],
      solutionStatus: "proposed" as const,
    },
    {
      id: generateId("sol"),
      situationModelId: "sm-placeholder-2",
      title: "Open Source Sustainability Fund",
      summary:
        "A pooled funding mechanism where companies contribute based on open source usage, with transparent allocation to maintainers.",
      solutionType: "platform" as const,
      mechanism:
        "Companies audit dependencies and contribute proportionally; funds distributed via transparent governance to projects based on criticality and need.",
      components: [
        {
          name: "Dependency Auditor",
          description: "Scans codebases to identify OSS usage",
          complexity: "medium",
        },
        {
          name: "Contribution Calculator",
          description: "Determines fair contribution amounts",
          complexity: "medium",
        },
        {
          name: "Distribution Governance",
          description: "Democratic fund allocation process",
          complexity: "high",
        },
      ],
      preconditions: ["Initial corporate commitments", "Legal framework", "Community trust"],
      risks: [
        {
          description: "Insufficient participation",
          likelihood: "medium",
          impact: "high",
        },
        {
          description: "Governance disputes",
          likelihood: "medium",
          impact: "medium",
        },
      ],
      metrics: [
        { name: "Corporate participation", target: "100 companies" },
        { name: "Annual funding", target: "$50M" },
      ],
      executionPlan: [],
      artifacts: [],
      addressesIssues: [],
      solutionStatus: "approved" as const,
    },
  ];

  const solutionIds: string[] = [];

  for (const data of solutionsData) {
    const baseFields = await createBaseFields(data);
    await solutionRepo.create({
      ...data,
      ...baseFields,
      status: "active",
    });
    solutionIds.push(data.id);
    console.log(`  Created solution: ${data.title}`);
  }

  return solutionIds;
}

async function seedRunLogs(runLogRepo: RunLogRepository): Promise<void> {
  console.log("Seeding run logs...");

  const runLogsData = [
    {
      id: generateId("run"),
      decisionId: "dec-placeholder-1",
      agentId: "scout-agent-1",
      triggeredBy: { type: "manual", ref: "user:admin" },
      startedAt: new Date(Date.now() - 3600000),
      completedAt: new Date(Date.now() - 3500000),
      llmCalls: [
        {
          callId: 1,
          model: "claude-3-opus",
          tokens: { input: 1500, output: 800 },
          latencyMs: 2500,
        },
        {
          callId: 2,
          model: "claude-3-opus",
          tokens: { input: 2000, output: 1200 },
          latencyMs: 3200,
        },
      ],
      decisions: [
        {
          step: 1,
          reasoning: "Analyzing policy gap patterns",
          actionChosen: "search_sources",
          confidence: 0.9,
        },
      ],
      toolCalls: [],
      runStatus: "success" as const,
      error: null,
      artifacts: [],
      stateChanges: ["created:pattern:pat-001"],
    },
    {
      id: generateId("run"),
      decisionId: "dec-placeholder-2",
      agentId: "triage-agent-1",
      triggeredBy: { type: "event", ref: "pattern:created" },
      startedAt: new Date(Date.now() - 7200000),
      completedAt: new Date(Date.now() - 7100000),
      llmCalls: [
        {
          callId: 1,
          model: "claude-3-sonnet",
          tokens: { input: 800, output: 400 },
          latencyMs: 1200,
        },
      ],
      decisions: [
        {
          step: 1,
          reasoning: "Evaluating pattern severity",
          actionChosen: "score_pattern",
          confidence: 0.85,
        },
      ],
      toolCalls: [],
      runStatus: "success" as const,
      error: null,
      artifacts: [],
      stateChanges: ["created:issue:iss-001"],
    },
    {
      id: generateId("run"),
      decisionId: "dec-placeholder-3",
      agentId: "analyst-agent-1",
      triggeredBy: { type: "manual", ref: "user:admin" },
      startedAt: new Date(Date.now() - 1800000),
      completedAt: null,
      llmCalls: [
        {
          callId: 1,
          model: "claude-3-opus",
          tokens: { input: 3000, output: 1500 },
          latencyMs: 4500,
        },
      ],
      decisions: [],
      toolCalls: [],
      runStatus: "running" as const,
      error: null,
      artifacts: [],
      stateChanges: [],
    },
    {
      id: generateId("run"),
      decisionId: "dec-placeholder-4",
      agentId: "planner-agent-1",
      triggeredBy: { type: "cron", ref: "daily-planning" },
      startedAt: new Date(Date.now() - 86400000),
      completedAt: new Date(Date.now() - 86300000),
      llmCalls: [
        {
          callId: 1,
          model: "claude-3-opus",
          tokens: { input: 2500, output: 2000 },
          latencyMs: 5000,
        },
        {
          callId: 2,
          model: "claude-3-opus",
          tokens: { input: 1800, output: 1500 },
          latencyMs: 4200,
        },
        {
          callId: 3,
          model: "claude-3-sonnet",
          tokens: { input: 500, output: 300 },
          latencyMs: 800,
        },
      ],
      decisions: [
        {
          step: 1,
          reasoning: "Analyzing situation model",
          actionChosen: "identify_interventions",
          confidence: 0.88,
        },
        {
          step: 2,
          reasoning: "Evaluating solution options",
          actionChosen: "generate_solution",
          confidence: 0.82,
        },
      ],
      toolCalls: [],
      runStatus: "success" as const,
      error: null,
      artifacts: ["sol-001"],
      stateChanges: ["created:solution:sol-001"],
    },
  ];

  for (const data of runLogsData) {
    const baseFields = await createBaseFields(data);
    await runLogRepo.create({
      ...data,
      ...baseFields,
      status: "active",
    });
    console.log(`  Created run log: ${data.id} (${data.agentId})`);
  }
}

export async function seed() {
  console.log("Starting database seed...\n");

  const db = getDatabase();

  const patternRepo = new PatternRepository(db);
  const issueRepo = new IssueRepository(db);
  const solutionRepo = new SolutionRepository(db);
  const runLogRepo = new RunLogRepository(db);

  try {
    const patternIds = await seedPatterns(patternRepo);
    const issueIds = await seedIssues(issueRepo, patternIds);
    await seedSolutions(solutionRepo);
    await seedRunLogs(runLogRepo);

    console.log("\nSeed completed successfully!");
    console.log(`  - ${patternIds.length} patterns`);
    console.log(`  - ${issueIds.length} issues`);
    console.log(`  - 2 solutions`);
    console.log(`  - 4 run logs`);
  } catch (error) {
    console.error("Seed failed:", error);
    throw error;
  }
}

// Run if executed directly
seed().catch(console.error);
