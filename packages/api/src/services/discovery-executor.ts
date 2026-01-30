import Anthropic from "@anthropic-ai/sdk";
import {
  getDatabase,
  PlaybookExecutionRepository,
  ManagedSourceRepository,
  PatternRepository,
  IssueRepository,
  DiscoveryProfileRepository,
  type ManagedSourceRow,
} from "@orbit/db";
import { generateId, computeContentHash } from "@orbit/core";
import { eventBus } from "../events/index.js";

interface DiscoveryContext {
  profileId: string;
  profileName: string;
  sourceIds: string[];
  domains: string[];
  keywords: string[];
  excludeKeywords: string[];
  maxPatterns: number;
  maxIssues: number;
  minSourceCredibility: number;
}

interface ScoutResult {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  content: string;
  credibility: number;
}

interface DiscoveredPattern {
  title: string;
  description: string;
  patternType: "policy_gap" | "structural_inefficiency" | "feedback_loop" | "information_asymmetry" | "coordination_failure" | "other";
  domains: string[];
  confidence: number;
  sources: Array<{ sourceId: string; excerpt: string }>;
}

interface DiscoveredIssue {
  title: string;
  summary: string;
  headline: string;
  whyNow: string;
  keyNumber: string;
  rootCauses: string[];
  affectedDomains: string[];
  leveragePoints: string[];
  timeHorizon: "months" | "years" | "decades";
  propagationVelocity: "fast" | "medium" | "slow";
  scores: {
    impact: number;
    urgency: number;
    tractability: number;
    legitimacy: number;
    neglectedness: number;
  };
  patternIds: string[];
}

class DiscoveryExecutor {
  private anthropic: Anthropic;
  private isRunning = false;

  constructor() {
    this.anthropic = new Anthropic();
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Listen for discovery run events
    eventBus.on("discovery.run.started", (event) => {
      const { executionId, profileId } = event.payload as { executionId: string; profileId: string };
      this.processDiscoveryRun(executionId).catch((error) => {
        console.error(`Discovery run ${executionId} failed:`, error);
      });
    });

    // Also check for any pending runs on startup
    this.checkPendingRuns();

    console.log("Discovery executor started");
  }

  private async checkPendingRuns(): Promise<void> {
    const db = getDatabase();
    const executionRepo = new PlaybookExecutionRepository(db);

    // Find pending discovery runs
    const result = await executionRepo.findMany({ limit: 10 });
    const pendingRuns = result.data.filter(
      (r) => r.status === "pending" && r.playbookId === "discovery"
    );

    for (const run of pendingRuns) {
      this.processDiscoveryRun(run.id).catch((error) => {
        console.error(`Discovery run ${run.id} failed:`, error);
      });
    }
  }

  private async processDiscoveryRun(executionId: string): Promise<void> {
    const db = getDatabase();
    const executionRepo = new PlaybookExecutionRepository(db);

    const execution = await executionRepo.findById(executionId);
    if (!execution) {
      console.error(`Execution ${executionId} not found`);
      return;
    }

    if (execution.status !== "pending") {
      console.log(`Execution ${executionId} is not pending, skipping`);
      return;
    }

    const context = execution.context?.variables as DiscoveryContext | undefined;
    if (!context) {
      await executionRepo.updateStatus(executionId, "failed", {
        error: "No discovery context found",
        completedAt: new Date(),
      });
      return;
    }

    try {
      // Mark as running
      await executionRepo.updateStatus(executionId, "running");
      await executionRepo.appendLog(executionId, "info", "Starting discovery run");

      // Step 1: Scout sources
      await executionRepo.appendLog(executionId, "info", "Step 1: Scouting sources...", 0);
      const scoutResults = await this.scoutSources(context);
      await executionRepo.incrementStep(executionId);
      await executionRepo.appendLog(
        executionId,
        "info",
        `Scouted ${scoutResults.length} sources`,
        0
      );

      if (scoutResults.length === 0) {
        await executionRepo.updateStatus(executionId, "completed", {
          completedAt: new Date(),
          output: { patternsCreated: [], issuesCreated: [], message: "No sources found matching criteria" },
        });
        await executionRepo.appendLog(executionId, "warn", "No sources found, completing early");
        return;
      }

      // Step 2: Analyze content and discover patterns
      await executionRepo.appendLog(executionId, "info", "Step 2: Analyzing content...", 1);
      const patterns = await this.analyzeForPatterns(scoutResults, context);
      await executionRepo.incrementStep(executionId);
      await executionRepo.appendLog(
        executionId,
        "info",
        `Discovered ${patterns.length} patterns`,
        1
      );

      // Save patterns to database
      const patternIds = await this.savePatterns(patterns);

      // Step 3: Synthesize issues from patterns
      await executionRepo.appendLog(executionId, "info", "Step 3: Synthesizing issues...", 2);
      const issues = await this.synthesizeIssues(patterns, patternIds, context);
      await executionRepo.incrementStep(executionId);
      await executionRepo.appendLog(
        executionId,
        "info",
        `Created ${issues.length} issues`,
        2
      );

      // Save issues to database
      const issueIds = await this.saveIssues(issues);

      // Mark as completed
      await executionRepo.updateStatus(executionId, "completed", {
        completedAt: new Date(),
        output: {
          patternsCreated: patternIds,
          issuesCreated: issueIds,
          scoutedSources: scoutResults.length,
        },
      });

      await executionRepo.appendLog(
        executionId,
        "info",
        `Discovery completed: ${patternIds.length} patterns, ${issueIds.length} issues`
      );

      // Publish completion event
      eventBus.publish("run.completed", { executionId, type: "discovery" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await executionRepo.updateStatus(executionId, "failed", {
        error: errorMessage,
        completedAt: new Date(),
      });
      await executionRepo.appendLog(executionId, "error", `Discovery failed: ${errorMessage}`);
      throw error;
    }
  }

  private async scoutSources(context: DiscoveryContext): Promise<ScoutResult[]> {
    const db = getDatabase();
    const sourceRepo = new ManagedSourceRepository(db);

    // Get active sources
    let sources: ManagedSourceRow[];

    if (context.sourceIds && context.sourceIds.length > 0) {
      // Use specific sources if provided
      const allSources = await Promise.all(
        context.sourceIds.map((id) => sourceRepo.findById(id))
      );
      sources = allSources.filter((s): s is ManagedSourceRow => s !== null && s.status === "active");
    } else {
      // Otherwise get active sources matching domains
      const result = await sourceRepo.findActive({ limit: 50 });
      sources = result.data;

      // Filter by domain if specified
      if (context.domains && context.domains.length > 0) {
        sources = sources.filter((s) =>
          s.domains?.some((d) => context.domains.includes(d))
        );
      }
    }

    // Filter by minimum credibility
    if (context.minSourceCredibility) {
      sources = sources.filter((s) => s.overallCredibility >= context.minSourceCredibility);
    }

    // For now, we'll simulate fetching content from sources
    // In a real implementation, this would make HTTP requests to the source URLs
    const results: ScoutResult[] = [];

    for (const source of sources.slice(0, 10)) {
      // Limit to 10 sources for now
      try {
        const content = await this.fetchSourceContent(source, context);
        if (content) {
          results.push({
            sourceId: source.id,
            sourceName: source.name,
            sourceUrl: source.url,
            content,
            credibility: source.overallCredibility,
          });
        }
      } catch (error) {
        console.error(`Failed to fetch content from ${source.name}:`, error);
      }
    }

    return results;
  }

  private async fetchSourceContent(
    source: ManagedSourceRow,
    context: DiscoveryContext
  ): Promise<string | null> {
    // In a real implementation, this would:
    // 1. Fetch RSS/API from the source
    // 2. Search for keywords
    // 3. Extract relevant content

    // For now, we'll generate a simulated response that describes the source
    // This allows the discovery to work without external HTTP calls
    const domainsStr = context.domains.length > 0 ? context.domains.join(", ") : "general topics";
    const keywordsStr = context.keywords.length > 0 ? context.keywords.join(", ") : "emerging trends";

    return `
Source: ${source.name} (${source.url})
Credibility: ${(source.overallCredibility * 100).toFixed(0)}%
Domains: ${source.domains?.join(", ") || "general"}

Recent content related to ${domainsStr}:
- Analyzing trends in ${keywordsStr}
- Source type: ${source.sourceType}
- Incentive structure: ${source.incentiveType}

This source provides ${source.sourceType === "research" ? "peer-reviewed research" : source.sourceType === "government" ? "official government data" : "news and analysis"}
on topics including ${source.domains?.slice(0, 3).join(", ") || "various subjects"}.
    `.trim();
  }

  private async analyzeForPatterns(
    scoutResults: ScoutResult[],
    context: DiscoveryContext
  ): Promise<DiscoveredPattern[]> {
    const sourceSummaries = scoutResults
      .map((r) => `[${r.sourceName}] (credibility: ${(r.credibility * 100).toFixed(0)}%)\n${r.content}`)
      .join("\n\n---\n\n");

    const prompt = `You are an analyst identifying systemic patterns and emerging issues from multiple sources.

DOMAINS OF INTEREST: ${context.domains.join(", ") || "all domains"}
KEYWORDS TO LOOK FOR: ${context.keywords.join(", ") || "emerging trends, systemic risks"}
KEYWORDS TO EXCLUDE: ${context.excludeKeywords.join(", ") || "none"}

SOURCE CONTENT:
${sourceSummaries}

Based on the sources above, identify up to ${context.maxPatterns} distinct patterns. For each pattern, provide:

1. A clear, specific title
2. A detailed description of the pattern
3. The pattern type (one of: policy_gap, structural_inefficiency, feedback_loop, information_asymmetry, coordination_failure, other)
4. Relevant domains
5. Confidence level (0-1)
6. Which sources support this pattern

Respond in JSON format:
{
  "patterns": [
    {
      "title": "Pattern title",
      "description": "Detailed description",
      "patternType": "policy_gap",
      "domains": ["domain1", "domain2"],
      "confidence": 0.8,
      "sources": [
        {"sourceId": "source_id", "excerpt": "relevant excerpt from source"}
      ]
    }
  ]
}

Focus on patterns that are:
- Well-supported by the source material
- Actionable (someone could potentially address them)
- Systemic (not just one-off events)`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const textContent = response.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        return [];
      }

      // Extract JSON from response
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("No JSON found in pattern analysis response");
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const patterns = parsed.patterns as DiscoveredPattern[];

      // Map source names to IDs
      return patterns.map((p) => ({
        ...p,
        sources: p.sources.map((s) => {
          const matchingSource = scoutResults.find(
            (r) => r.sourceName === s.sourceId || r.sourceId === s.sourceId
          );
          return {
            sourceId: matchingSource?.sourceId || s.sourceId,
            excerpt: s.excerpt,
          };
        }),
      }));
    } catch (error) {
      console.error("Pattern analysis failed:", error);
      return [];
    }
  }

  private async savePatterns(patterns: DiscoveredPattern[]): Promise<string[]> {
    const db = getDatabase();
    const patternRepo = new PatternRepository(db);
    const savedIds: string[] = [];

    for (const pattern of patterns) {
      const id = generateId("pat");
      const now = new Date();

      const payload = {
        type: "Pattern" as const,
        title: pattern.title,
        description: pattern.description,
        patternType: pattern.patternType,
        domains: pattern.domains,
      };
      const contentHash = await computeContentHash(payload);

      await patternRepo.create({
        id,
        contentHash,
        parentHash: null,
        author: "discovery_executor",
        authorSignature: `sig:discovery_${Date.now()}`,
        createdAt: now,
        version: 1,
        status: "active",
        title: pattern.title,
        description: pattern.description,
        patternType: pattern.patternType,
        domains: pattern.domains,
        geographies: [],
        sources: pattern.sources,
        firstObserved: now,
        observationFrequency: "recurring",
        clusterId: null,
        confidence: pattern.confidence,
      });

      savedIds.push(id);

      // Publish pattern created event
      eventBus.publish("pattern.created", { patternId: id });
    }

    return savedIds;
  }

  private async synthesizeIssues(
    patterns: DiscoveredPattern[],
    patternIds: string[],
    context: DiscoveryContext
  ): Promise<DiscoveredIssue[]> {
    if (patterns.length === 0) {
      return [];
    }

    const patternSummaries = patterns
      .map((p, i) => `[${patternIds[i]}] ${p.title}: ${p.description}`)
      .join("\n\n");

    const prompt = `You are synthesizing actionable issues from identified patterns.

PATTERNS IDENTIFIED:
${patternSummaries}

Based on these patterns, identify up to ${context.maxIssues} distinct issues that should be addressed. For each issue:

1. Create a clear, actionable title
2. Write a comprehensive summary
3. Create a short headline (one sentence, no jargon)
4. Explain why this matters NOW (time sensitivity)
5. Identify a key statistic or number that anchors the issue
6. List root causes
7. Identify affected domains
8. Suggest leverage points for intervention
9. Estimate time horizon (months, years, or decades)
10. Estimate propagation velocity (fast, medium, slow)
11. Score the following (0-1 each):
    - Impact: How significant are the consequences?
    - Urgency: How time-sensitive is action?
    - Tractability: How feasible is solving this?
    - Legitimacy: How appropriate for intervention?
    - Neglectedness: How under-addressed is this?
12. Link to relevant pattern IDs from above

Respond in JSON format:
{
  "issues": [
    {
      "title": "Issue title",
      "summary": "Detailed summary",
      "headline": "One sentence headline",
      "whyNow": "Time sensitivity explanation",
      "keyNumber": "500K affected",
      "rootCauses": ["cause1", "cause2"],
      "affectedDomains": ["domain1"],
      "leveragePoints": ["point1"],
      "timeHorizon": "years",
      "propagationVelocity": "medium",
      "scores": {
        "impact": 0.8,
        "urgency": 0.7,
        "tractability": 0.6,
        "legitimacy": 0.8,
        "neglectedness": 0.7
      },
      "patternIds": ["pat_xxx"]
    }
  ]
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const textContent = response.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        return [];
      }

      // Extract JSON from response
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("No JSON found in issue synthesis response");
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.issues as DiscoveredIssue[];
    } catch (error) {
      console.error("Issue synthesis failed:", error);
      return [];
    }
  }

  private async saveIssues(issues: DiscoveredIssue[]): Promise<string[]> {
    const db = getDatabase();
    const issueRepo = new IssueRepository(db);
    const savedIds: string[] = [];

    for (const issue of issues) {
      const id = generateId("iss");
      const now = new Date();

      const payload = {
        type: "Issue" as const,
        title: issue.title,
        summary: issue.summary,
      };
      const contentHash = await computeContentHash(payload);

      // Calculate composite score
      const scores = issue.scores;
      const compositeScore =
        (scores.impact * 0.25 +
          scores.urgency * 0.2 +
          scores.tractability * 0.2 +
          scores.legitimacy * 0.15 +
          scores.neglectedness * 0.2);

      await issueRepo.create({
        id,
        contentHash,
        parentHash: null,
        author: "discovery_executor",
        authorSignature: `sig:discovery_${Date.now()}`,
        createdAt: now,
        version: 1,
        status: "active",
        title: issue.title,
        summary: issue.summary,
        patternIds: issue.patternIds,
        headline: issue.headline,
        whyNow: issue.whyNow,
        keyNumber: issue.keyNumber,
        simpleStatus: "needs_attention",
        rootCauses: issue.rootCauses,
        affectedDomains: issue.affectedDomains,
        leveragePoints: issue.leveragePoints,
        scoreImpact: scores.impact,
        scoreUrgency: scores.urgency,
        scoreTractability: scores.tractability,
        scoreLegitimacy: scores.legitimacy,
        scoreNeglectedness: scores.neglectedness,
        compositeScore,
        upstreamIssues: [],
        downstreamIssues: [],
        relatedIssues: [],
        timeHorizon: issue.timeHorizon,
        propagationVelocity: issue.propagationVelocity,
        issueStatus: "identified",
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      });

      savedIds.push(id);

      // Publish issue created event
      eventBus.publish("issue.created", { issueId: id });
    }

    return savedIds;
  }
}

// Singleton instance
let executor: DiscoveryExecutor | null = null;

export function startDiscoveryExecutor(): void {
  if (!executor) {
    executor = new DiscoveryExecutor();
    executor.start();
  }
}

export { DiscoveryExecutor };
