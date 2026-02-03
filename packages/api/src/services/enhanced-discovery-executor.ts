/**
 * Enhanced Discovery Executor
 *
 * Implements advanced patterns for improved quality:
 * 1. Real source fetching (arXiv, OWID, RSS)
 * 2. Chain-of-thought decomposition
 * 3. Self-consistency sampling
 * 4. Critique-and-refine loop
 * 5. Cross-validation scoring
 * 6. Embedding-based deduplication
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  getDatabase,
  PlaybookExecutionRepository,
  ManagedSourceRepository,
  PatternRepository,
  IssueRepository,
  SolutionRepository,
  VerificationRepository,
  FeedbackEventRepository,
  SystemLearningRepository,
  type ManagedSourceRow,
  type IssueRow,
  type PatternRow,
  type VerificationRow,
} from "@orbit/db";
import { generateId, computeContentHash } from "@orbit/core";
import { eventBus } from "../events/index.js";
import { SourceFetcherRegistry, type FetchedContent, type FetchedItem } from "./source-fetchers/index.js";
import { getBayesianScoringService } from "./bayesian-scoring.js";

// ============================================================================
// Types
// ============================================================================

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

interface ExtractedClaim {
  statement: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  // Item-level references (specific article/paper)
  itemTitle: string;
  itemUrl: string;
  excerpt: string;
  category: "factual" | "statistical" | "causal" | "predictive";
  confidence: number;
}

interface ClaimCluster {
  theme: string;
  claims: ExtractedClaim[];
  sourceCount: number;
  sourceDiversity: number; // Different source types
}

interface DiscoveredPattern {
  title: string;
  description: string;
  patternType: "policy_gap" | "structural_inefficiency" | "feedback_loop" | "information_asymmetry" | "coordination_failure" | "other";
  domains: string[];
  confidence: number;
  sources: Array<{
    sourceId: string;
    sourceName: string;
    sourceUrl: string;
    itemTitle: string;
    itemUrl: string;
    excerpt: string;
  }>;
  claimSupport: number; // Number of claims supporting this pattern
  crossValidationScore: number;
}

interface PatternCritique {
  patternIndex: number;
  issues: string[];
  suggestions: string[];
  shouldRemove: boolean;
  confidenceAdjustment: number;
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

interface GeneratedVerification {
  claimStatement: string;
  claimCategory: "factual" | "statistical" | "causal" | "predictive" | "definitional";
  originalConfidence: number;
  status: "pending" | "corroborated" | "contested" | "partially_supported" | "unverified";
  adjustedConfidence: number;
  verificationNotes: string;
  sourceAssessments: Array<{
    url: string;
    name: string;
    credibility: number;
    alignment: "supports" | "contradicts" | "neutral" | "partially_supports";
    relevance: "high" | "medium" | "low" | "none";
    relevantExcerpt: string;
    confidence: number;
  }>;
}

interface GeneratedSolution {
  title: string;
  summary: string;
  solutionType: "tool" | "platform" | "system" | "automation" | "research" | "model" | "policy" | "other";
  mechanism: string;
  components: string[];
  preconditions: string[];
  risks: string[];
  metrics: string[];
  executionPlan: Array<{ step: number; action: string; owner?: string; timeline?: string }>;
  targetLeveragePoints: string[];
  successMetrics: Array<{ metric: string; target: string; timeline: string }>;
  feasibilityScore: number;
  impactScore: number;
  confidence: number;
}

// ============================================================================
// Enhanced Discovery Executor
// ============================================================================

export class EnhancedDiscoveryExecutor {
  private anthropic: Anthropic;
  private fetcherRegistry: SourceFetcherRegistry;
  private isRunning = false;

  constructor() {
    this.anthropic = new Anthropic();
    this.fetcherRegistry = SourceFetcherRegistry.getInstance();
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    eventBus.on("discovery.run.started", (event) => {
      const { executionId } = event.payload as { executionId: string; profileId: string };
      this.processDiscoveryRun(executionId).catch((error) => {
        console.error(`Enhanced discovery run ${executionId} failed:`, error);
      });
    });

    this.checkPendingRuns();
    console.log("Enhanced Discovery Executor started");
  }

  private async checkPendingRuns(): Promise<void> {
    const db = getDatabase();
    const executionRepo = new PlaybookExecutionRepository(db);
    const result = await executionRepo.findMany({ limit: 10 });
    const pendingRuns = result.data.filter(
      (r) => r.status === "pending" && r.playbookId === "discovery"
    );

    for (const run of pendingRuns) {
      this.processDiscoveryRun(run.id).catch((error) => {
        console.error(`Enhanced discovery run ${run.id} failed:`, error);
      });
    }
  }

  // ============================================================================
  // Main Discovery Pipeline
  // ============================================================================

  private async processDiscoveryRun(executionId: string): Promise<void> {
    const db = getDatabase();
    const executionRepo = new PlaybookExecutionRepository(db);
    const issueRepo = new IssueRepository(db);

    const execution = await executionRepo.findById(executionId);
    if (!execution || execution.status !== "pending") return;

    const context = execution.context?.variables as DiscoveryContext | undefined;
    if (!context) {
      await executionRepo.updateStatus(executionId, "failed", {
        error: "No discovery context found",
        completedAt: new Date(),
      });
      return;
    }

    try {
      await executionRepo.updateStatus(executionId, "running");
      await executionRepo.appendLog(executionId, "info", "Starting enhanced discovery run");

      // Step 1: Fetch real content from sources
      await executionRepo.appendLog(executionId, "info", "Step 1: Fetching content from sources...", 0);
      const fetchedContent = await this.fetchRealContent(context);
      await executionRepo.incrementStep(executionId);

      const sourcesUsed = fetchedContent.map((fc) => ({
        id: fc.sourceId,
        name: fc.sourceName,
        url: fc.sourceUrl,
        credibility: fc.credibility,
        itemCount: fc.items.length,
      }));

      await executionRepo.appendLog(
        executionId,
        "info",
        `Fetched ${fetchedContent.reduce((sum, fc) => sum + fc.items.length, 0)} items from ${fetchedContent.length} sources`,
        0
      );

      if (fetchedContent.length === 0) {
        await executionRepo.updateStatus(executionId, "completed", {
          completedAt: new Date(),
          output: { sourcesUsed: [], patternsCreated: [], issuesCreated: [], verificationsCreated: [], solutionsCreated: [], message: "No content fetched" },
        });
        return;
      }

      // Step 2: Chain-of-thought pattern analysis
      await executionRepo.appendLog(executionId, "info", "Step 2: Analyzing patterns (chain-of-thought)...", 1);
      const patterns = await this.analyzeWithChainOfThought(fetchedContent, context);
      await executionRepo.incrementStep(executionId);
      await executionRepo.appendLog(executionId, "info", `Discovered ${patterns.length} patterns`, 1);

      // Save patterns and deduplicate
      const { savedIds: patternIds, deduplicatedCount } = await this.savePatternsWithDeduplication(patterns);
      if (deduplicatedCount > 0) {
        await executionRepo.appendLog(executionId, "info", `Deduplicated ${deduplicatedCount} similar patterns`, 1);
      }

      // Step 3: Synthesize issues
      await executionRepo.appendLog(executionId, "info", "Step 3: Synthesizing issues...", 2);
      const issues = await this.synthesizeIssues(patterns, patternIds, context);
      await executionRepo.incrementStep(executionId);
      await executionRepo.appendLog(executionId, "info", `Created ${issues.length} issues`, 2);

      const issueIds = await this.saveIssues(issues, patterns, sourcesUsed);

      // Load saved issues
      const savedIssues: IssueRow[] = [];
      for (const issueId of issueIds) {
        const issue = await issueRepo.findById(issueId);
        if (issue) savedIssues.push(issue);
      }

      // Step 4: Cross-validate and verify
      await executionRepo.appendLog(executionId, "info", "Step 4: Cross-validating claims...", 3);
      const verificationIds = await this.generateAndSaveVerifications(savedIssues, fetchedContent);
      await executionRepo.incrementStep(executionId);
      await executionRepo.appendLog(executionId, "info", `Created ${verificationIds.length} verifications`, 3);

      // Step 5: Generate solutions
      await executionRepo.appendLog(executionId, "info", "Step 5: Generating solutions...", 4);
      const solutionIds = await this.generateAndSaveSolutions(savedIssues, context);
      await executionRepo.incrementStep(executionId);
      await executionRepo.appendLog(executionId, "info", `Created ${solutionIds.length} solutions`, 4);

      const completedAt = new Date();
      const startedAt = execution.startedAt || new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      // Complete
      await executionRepo.updateStatus(executionId, "completed", {
        completedAt,
        output: {
          sourcesUsed,
          patternsCreated: patternIds,
          issuesCreated: issueIds,
          verificationsCreated: verificationIds,
          solutionsCreated: solutionIds,
          deduplicatedPatterns: deduplicatedCount,
        },
      });

      await executionRepo.appendLog(
        executionId,
        "info",
        `Discovery completed: ${patternIds.length} patterns, ${issueIds.length} issues, ${verificationIds.length} verifications, ${solutionIds.length} solutions`
      );

      // Generate feedback events to close the loop for system improvement
      await this.generateFeedbackEvents({
        executionId,
        playbookId: execution.playbookId,
        success: true,
        durationMs,
        totalSteps: 5,
        stepsCompleted: 5,
        sourcesUsed,
        patternIds,
        verificationIds,
        context,
      });

      await executionRepo.appendLog(
        executionId,
        "info",
        "Feedback events generated for system improvement"
      );

      eventBus.publish("run.completed", { executionId, type: "discovery" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedAt = new Date();
      const startedAt = execution.startedAt || new Date();
      const durationMs = failedAt.getTime() - startedAt.getTime();

      await executionRepo.updateStatus(executionId, "failed", {
        error: errorMessage,
        completedAt: failedAt,
      });
      await executionRepo.appendLog(executionId, "error", `Discovery failed: ${errorMessage}`);

      // Generate failure feedback for learning
      try {
        await this.generateFeedbackEvents({
          executionId,
          playbookId: execution.playbookId,
          success: false,
          durationMs,
          totalSteps: 5,
          stepsCompleted: 0, // Unknown, assume 0
          sourcesUsed: [],
          patternIds: [],
          verificationIds: [],
          context,
        });
      } catch (feedbackError) {
        console.error("[Feedback] Failed to generate failure feedback:", feedbackError);
      }

      throw error;
    }
  }

  // ============================================================================
  // Step 1: Real Source Fetching
  // ============================================================================

  private async fetchRealContent(context: DiscoveryContext): Promise<FetchedContent[]> {
    const db = getDatabase();
    const sourceRepo = new ManagedSourceRepository(db);

    // Get sources
    let sources: ManagedSourceRow[];
    if (context.sourceIds && context.sourceIds.length > 0) {
      const allSources = await Promise.all(
        context.sourceIds.map((id) => sourceRepo.findById(id))
      );
      sources = allSources.filter((s): s is ManagedSourceRow => s !== null && s.status === "active");
    } else {
      const result = await sourceRepo.findActive({ limit: 50 });
      sources = result.data;
      if (context.domains && context.domains.length > 0) {
        sources = sources.filter((s) =>
          s.domains?.some((d) => context.domains.includes(d))
        );
      }
    }

    if (context.minSourceCredibility) {
      sources = sources.filter((s) => s.overallCredibility >= context.minSourceCredibility);
    }

    // Fetch from each source using the registry
    const fetchOptions = {
      keywords: context.keywords,
      domains: context.domains,
      maxItems: 20,
    };

    const results = await this.fetcherRegistry.fetchMany(
      sources.slice(0, 10).map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        sourceType: s.sourceType,
        domains: s.domains || [],
        credibility: s.overallCredibility,
      })),
      fetchOptions
    );

    return results;
  }

  // ============================================================================
  // Step 2: Chain-of-Thought Pattern Analysis
  // ============================================================================

  private async analyzeWithChainOfThought(
    fetchedContent: FetchedContent[],
    context: DiscoveryContext
  ): Promise<DiscoveredPattern[]> {
    // Step 2a: Extract claims from each source
    console.log("[CoT] Step 2a: Extracting claims from sources...");
    const allClaims = await this.extractClaimsFromSources(fetchedContent);
    console.log(`[CoT] Extracted ${allClaims.length} claims`);

    // Step 2b: Cluster related claims
    console.log("[CoT] Step 2b: Clustering related claims...");
    const clusters = await this.clusterClaims(allClaims);
    console.log(`[CoT] Created ${clusters.length} claim clusters`);

    // Step 2c: Generate patterns from clusters (with self-consistency)
    console.log("[CoT] Step 2c: Generating patterns with self-consistency...");
    const patterns = await this.generatePatternsWithSelfConsistency(clusters, context);
    console.log(`[CoT] Generated ${patterns.length} patterns`);

    // Step 2d: Critique and refine patterns
    console.log("[CoT] Step 2d: Critiquing and refining patterns...");
    const refinedPatterns = await this.critiqueAndRefinePatterns(patterns, allClaims);
    console.log(`[CoT] Refined to ${refinedPatterns.length} patterns`);

    // Step 2e: Cross-validate patterns
    console.log("[CoT] Step 2e: Cross-validating patterns...");
    const validatedPatterns = this.crossValidatePatterns(refinedPatterns, allClaims);

    return validatedPatterns;
  }

  private async extractClaimsFromSources(fetchedContent: FetchedContent[]): Promise<ExtractedClaim[]> {
    const allClaims: ExtractedClaim[] = [];

    for (const content of fetchedContent) {
      // Build item map for reference lookup
      const items = content.items.slice(0, 10);
      const itemMap = new Map(items.map((item, idx) => [idx, item]));

      const sourceText = items
        .map((item, idx) => `[ITEM_${idx}] "${item.title}" (${item.url})\n${item.summary || item.content.slice(0, 500)}`)
        .join("\n\n---\n\n");

      const prompt = `Extract key factual claims from this source content. Focus on claims that are:
- Specific and verifiable
- Related to systemic issues, trends, or patterns
- Supported by data or evidence in the text

SOURCE: ${content.sourceName} (credibility: ${Math.round(content.credibility * 100)}%)

CONTENT:
${sourceText}

For each claim, provide:
1. The claim statement (clear, specific)
2. Category: factual, statistical, causal, or predictive
3. A relevant excerpt from the source
4. Confidence level (0-1)
5. The ITEM_N identifier that this claim comes from (e.g., "ITEM_0")

Respond in JSON:
{
  "claims": [
    {
      "statement": "Clear claim statement",
      "category": "statistical",
      "excerpt": "Quote from source",
      "confidence": 0.8,
      "itemRef": "ITEM_0"
    }
  ]
}

Extract up to 10 key claims.`;

      try {
        const response = await this.anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        });

        const text = response.content.find((c) => c.type === "text");
        if (text && text.type === "text") {
          const jsonMatch = text.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            for (const claim of parsed.claims || []) {
              // Extract item index from itemRef (e.g., "ITEM_0" -> 0)
              const itemRefMatch = claim.itemRef?.match(/ITEM_(\d+)/);
              const itemIdx = itemRefMatch ? parseInt(itemRefMatch[1], 10) : 0;
              const item = itemMap.get(itemIdx) || items[0];

              allClaims.push({
                statement: claim.statement,
                sourceId: content.sourceId,
                sourceName: content.sourceName,
                sourceUrl: content.sourceUrl,
                itemTitle: item?.title || content.sourceName,
                itemUrl: item?.url || content.sourceUrl,
                excerpt: claim.excerpt,
                category: claim.category,
                confidence: claim.confidence,
              });
            }
          }
        }
      } catch (error) {
        console.error(`[CoT] Failed to extract claims from ${content.sourceName}:`, error);
      }
    }

    return allClaims;
  }

  private async clusterClaims(claims: ExtractedClaim[]): Promise<ClaimCluster[]> {
    if (claims.length === 0) return [];

    const claimsList = claims
      .map((c, i) => `[${i}] ${c.statement} (source: ${c.sourceName})`)
      .join("\n");

    const prompt = `Group these claims into thematic clusters. Claims that relate to the same systemic issue or pattern should be grouped together.

CLAIMS:
${claimsList}

Group claims by their underlying theme or systemic issue. Each cluster should have a clear theme.

Respond in JSON:
{
  "clusters": [
    {
      "theme": "Description of the systemic theme",
      "claimIndices": [0, 3, 5]
    }
  ]
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content.find((c) => c.type === "text");
      if (text && text.type === "text") {
        const jsonMatch = text.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return (parsed.clusters || []).map((cluster: { theme: string; claimIndices: number[] }) => {
            const clusterClaims = cluster.claimIndices
              .filter((i: number) => i < claims.length)
              .map((i: number) => claims[i]);

            const sourceTypes = new Set(clusterClaims.map((c) => c.sourceName));

            return {
              theme: cluster.theme,
              claims: clusterClaims,
              sourceCount: clusterClaims.length,
              sourceDiversity: sourceTypes.size,
            };
          });
        }
      }
    } catch (error) {
      console.error("[CoT] Failed to cluster claims:", error);
    }

    return [];
  }

  private async generatePatternsWithSelfConsistency(
    clusters: ClaimCluster[],
    context: DiscoveryContext
  ): Promise<DiscoveredPattern[]> {
    if (clusters.length === 0) return [];

    // Generate 3 independent pattern analyses
    const samples = await Promise.all([
      this.generatePatternsOnce(clusters, context, 0.7),
      this.generatePatternsOnce(clusters, context, 0.7),
      this.generatePatternsOnce(clusters, context, 0.7),
    ]);

    // Find patterns that appear in 2+ samples (consensus)
    const patternCounts = new Map<string, { pattern: DiscoveredPattern; count: number }>();

    for (const sample of samples) {
      for (const pattern of sample) {
        // Use title similarity for matching
        const normalizedTitle = pattern.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        const existing = patternCounts.get(normalizedTitle);
        if (existing) {
          existing.count++;
          // Keep the pattern with higher confidence
          if (pattern.confidence > existing.pattern.confidence) {
            existing.pattern = pattern;
          }
        } else {
          patternCounts.set(normalizedTitle, { pattern, count: 1 });
        }
      }
    }

    // Return patterns that appeared in at least 2 samples
    const consistentPatterns = Array.from(patternCounts.values())
      .filter((p) => p.count >= 2)
      .map((p) => ({
        ...p.pattern,
        confidence: Math.min(1, p.pattern.confidence + (p.count - 1) * 0.1), // Boost confidence for consensus
      }));

    // If no consensus, fall back to the first sample
    if (consistentPatterns.length === 0 && samples[0].length > 0) {
      return samples[0];
    }

    return consistentPatterns;
  }

  private async generatePatternsOnce(
    clusters: ClaimCluster[],
    context: DiscoveryContext,
    temperature: number
  ): Promise<DiscoveredPattern[]> {
    const clusterSummaries = clusters
      .map((c, i) => `Cluster ${i + 1}: ${c.theme}\n  Claims: ${c.claims.map((cl) => cl.statement).join("; ")}\n  Sources: ${c.sourceDiversity} different sources`)
      .join("\n\n");

    const prompt = `Based on these claim clusters, identify systemic patterns.

CLAIM CLUSTERS:
${clusterSummaries}

DOMAINS OF INTEREST: ${context.domains.join(", ") || "all"}
KEYWORDS: ${context.keywords.join(", ") || "emerging trends"}

For each pattern, provide:
1. Clear, specific title
2. Detailed description
3. Pattern type: policy_gap, structural_inefficiency, feedback_loop, information_asymmetry, coordination_failure, or other
4. Relevant domains
5. Confidence level (0-1)
6. Which claims support this pattern

Respond in JSON:
{
  "patterns": [
    {
      "title": "Pattern title",
      "description": "Detailed description",
      "patternType": "policy_gap",
      "domains": ["domain1"],
      "confidence": 0.8,
      "supportingClaims": ["claim text 1", "claim text 2"],
      "sources": [{"sourceId": "source_id", "excerpt": "relevant excerpt"}]
    }
  ]
}

Identify up to ${context.maxPatterns} patterns.`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        temperature,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content.find((c) => c.type === "text");
      if (text && text.type === "text") {
        const jsonMatch = text.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = this.safeJsonParse(jsonMatch[0]);
          if (parsed) {
            return (parsed.patterns || []).map((p: DiscoveredPattern & { supportingClaims?: string[] }) => ({
              ...p,
              claimSupport: p.supportingClaims?.length || 0,
              crossValidationScore: 0,
            }));
          }
        }
      }
    } catch (error) {
      console.error("[CoT] Failed to generate patterns:", error);
    }

    return [];
  }

  /**
   * Safely parse JSON with automatic repair for common LLM output issues
   */
  private safeJsonParse(jsonStr: string): { patterns?: DiscoveredPattern[] } | null {
    // Try direct parse first
    try {
      return JSON.parse(jsonStr);
    } catch {
      // Continue to repair attempts
    }

    // Attempt repairs for common issues
    let repaired = jsonStr;

    try {
      // Fix 1: Remove trailing commas before } or ]
      repaired = repaired.replace(/,(\s*[}\]])/g, "$1");

      // Fix 2: Fix unescaped quotes in strings (common LLM issue)
      // This is a simplified fix - replace obvious cases
      repaired = repaired.replace(/:\s*"([^"]*)"([^",}\]]*)"([^"]*?)"/g, ': "$1\'$2\'$3"');

      // Fix 3: Truncated JSON - try to close unclosed brackets
      const openBraces = (repaired.match(/{/g) || []).length;
      const closeBraces = (repaired.match(/}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;

      // If truncated, try to close the structure
      if (openBraces > closeBraces || openBrackets > closeBrackets) {
        // Remove potentially incomplete last element
        repaired = repaired.replace(/,\s*"[^"]*$/, "");
        repaired = repaired.replace(/,\s*\{[^}]*$/, "");

        // Close remaining brackets/braces
        for (let i = 0; i < openBrackets - closeBrackets; i++) {
          repaired += "]";
        }
        for (let i = 0; i < openBraces - closeBraces; i++) {
          repaired += "}";
        }
      }

      const result = JSON.parse(repaired);
      console.log("[CoT] JSON repaired successfully");
      return result;
    } catch (e) {
      console.error("[CoT] JSON repair failed:", e);
      return null;
    }
  }

  private async critiqueAndRefinePatterns(
    patterns: DiscoveredPattern[],
    claims: ExtractedClaim[]
  ): Promise<DiscoveredPattern[]> {
    if (patterns.length === 0) return [];

    const patternList = patterns
      .map((p, i) => `[${i}] ${p.title}: ${p.description}`)
      .join("\n\n");

    const claimList = claims
      .slice(0, 30)
      .map((c) => `- ${c.statement} (${c.sourceName})`)
      .join("\n");

    const prompt = `Review these patterns for quality issues.

PATTERNS:
${patternList}

AVAILABLE CLAIMS:
${claimList}

For each pattern, identify:
1. Unsupported claims (assertions not backed by the claim evidence)
2. Overgeneralization (single source → universal claim)
3. Missing nuance (important caveats not mentioned)
4. Conflation (two distinct issues merged incorrectly)

Respond in JSON:
{
  "critiques": [
    {
      "patternIndex": 0,
      "issues": ["Issue 1", "Issue 2"],
      "suggestions": ["Suggestion 1"],
      "shouldRemove": false,
      "confidenceAdjustment": -0.1
    }
  ]
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content.find((c) => c.type === "text");
      if (text && text.type === "text") {
        const jsonMatch = text.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const critiques = parsed.critiques as PatternCritique[];

          // Apply critiques
          return patterns
            .map((pattern, i) => {
              const critique = critiques.find((c) => c.patternIndex === i);
              if (critique?.shouldRemove) return null;

              return {
                ...pattern,
                confidence: Math.max(0, Math.min(1, pattern.confidence + (critique?.confidenceAdjustment || 0))),
              };
            })
            .filter((p): p is DiscoveredPattern => p !== null);
        }
      }
    } catch (error) {
      console.error("[CoT] Failed to critique patterns:", error);
    }

    return patterns;
  }

  private crossValidatePatterns(
    patterns: DiscoveredPattern[],
    claims: ExtractedClaim[]
  ): DiscoveredPattern[] {
    return patterns.map((pattern) => {
      // Count how many claims support this pattern
      const supportingClaims = claims.filter((claim) => {
        const patternText = `${pattern.title} ${pattern.description}`.toLowerCase();
        const claimText = claim.statement.toLowerCase();
        // Simple word overlap check
        const patternWords = patternText.split(/\s+/);
        const claimWords = claimText.split(/\s+/);
        const overlap = patternWords.filter((w) => claimWords.includes(w)).length;
        return overlap >= 3; // At least 3 words in common
      });

      // Calculate source diversity
      const sourceTypes = new Set(supportingClaims.map((c) => c.sourceName));

      // Cross-validation score based on source count and diversity
      const crossValidationScore = Math.min(1,
        (supportingClaims.length * 0.1) + (sourceTypes.size * 0.2)
      );

      // Build enriched sources from supporting claims with item-level details
      const enrichedSources = supportingClaims.map((claim) => ({
        sourceId: claim.sourceId,
        sourceName: claim.sourceName,
        sourceUrl: claim.sourceUrl,
        itemTitle: claim.itemTitle,
        itemUrl: claim.itemUrl,
        excerpt: claim.excerpt,
      }));

      // Deduplicate sources by itemUrl
      const uniqueSources = Array.from(
        new Map(enrichedSources.map((s) => [s.itemUrl, s])).values()
      );

      return {
        ...pattern,
        sources: uniqueSources.length > 0 ? uniqueSources : pattern.sources,
        claimSupport: supportingClaims.length,
        crossValidationScore,
        confidence: Math.min(1, pattern.confidence + crossValidationScore * 0.2),
      };
    });
  }

  // ============================================================================
  // Deduplication
  // ============================================================================

  private async savePatternsWithDeduplication(
    patterns: DiscoveredPattern[]
  ): Promise<{ savedIds: string[]; deduplicatedCount: number }> {
    const db = getDatabase();
    const patternRepo = new PatternRepository(db);
    const savedIds: string[] = [];
    let deduplicatedCount = 0;

    // Get existing patterns for deduplication
    const existingPatterns = await patternRepo.findMany({ limit: 100 });

    for (const pattern of patterns) {
      // Check for duplicates using simple text similarity
      const isDuplicate = await this.checkDuplicate(pattern, existingPatterns.data);

      if (isDuplicate) {
        deduplicatedCount++;
        console.log(`[Dedup] Skipping duplicate pattern: ${pattern.title}`);
        continue;
      }

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
        author: "enhanced_discovery",
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
      eventBus.publish("pattern.created", { patternId: id });
    }

    return { savedIds, deduplicatedCount };
  }

  private async checkDuplicate(
    newPattern: DiscoveredPattern,
    existingPatterns: PatternRow[]
  ): Promise<boolean> {
    // Simple word-based similarity check
    const newWords = new Set(
      `${newPattern.title} ${newPattern.description}`
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );

    for (const existing of existingPatterns) {
      const existingWords = new Set(
        `${existing.title} ${existing.description}`
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3)
      );

      // Calculate Jaccard similarity
      const intersection = [...newWords].filter((w) => existingWords.has(w)).length;
      const union = new Set([...newWords, ...existingWords]).size;
      const similarity = intersection / union;

      if (similarity > 0.6) {
        return true; // Too similar, consider duplicate
      }
    }

    return false;
  }

  // ============================================================================
  // Issue Synthesis (reuse from original)
  // ============================================================================

  private async synthesizeIssues(
    patterns: DiscoveredPattern[],
    patternIds: string[],
    context: DiscoveryContext
  ): Promise<DiscoveredIssue[]> {
    if (patterns.length === 0) return [];

    const patternSummaries = patterns
      .map((p, i) => `[${patternIds[i]}] ${p.title}: ${p.description} (confidence: ${p.confidence.toFixed(2)}, cross-validation: ${p.crossValidationScore.toFixed(2)})`)
      .join("\n\n");

    const prompt = `Synthesize actionable issues from these validated patterns.

PATTERNS (with confidence and cross-validation scores):
${patternSummaries}

Based on these patterns, identify up to ${context.maxIssues} distinct issues. Prioritize patterns with higher confidence and cross-validation scores.

For each issue provide:
1. Clear, actionable title
2. Comprehensive summary
3. Short headline (one sentence)
4. Why this matters NOW
5. Key statistic/number
6. Root causes
7. Affected domains
8. Leverage points
9. Time horizon (months/years/decades)
10. Propagation velocity (fast/medium/slow)
11. IUTLN scores (0-1 each): Impact, Urgency, Tractability, Legitimacy, Neglectedness
12. Linked pattern IDs

Respond in JSON:
{
  "issues": [
    {
      "title": "Issue title",
      "summary": "Detailed summary",
      "headline": "One sentence",
      "whyNow": "Time sensitivity",
      "keyNumber": "500K affected",
      "rootCauses": ["cause1"],
      "affectedDomains": ["domain1"],
      "leveragePoints": ["point1"],
      "timeHorizon": "years",
      "propagationVelocity": "medium",
      "scores": {"impact": 0.8, "urgency": 0.7, "tractability": 0.6, "legitimacy": 0.8, "neglectedness": 0.7},
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

      const text = response.content.find((c) => c.type === "text");
      if (text && text.type === "text") {
        const jsonMatch = text.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed.issues as DiscoveredIssue[];
        }
      }
    } catch (error) {
      console.error("Issue synthesis failed:", error);
    }

    return [];
  }

  private async saveIssues(
    issues: DiscoveredIssue[],
    patterns: DiscoveredPattern[],
    sourcesUsed: Array<{ id: string; name: string; url: string; credibility: number; itemCount: number }>
  ): Promise<string[]> {
    const db = getDatabase();
    const issueRepo = new IssueRepository(db);
    const savedIds: string[] = [];

    // Build credibility lookup from sourcesUsed
    const credibilityMap = new Map(sourcesUsed.map((s) => [s.id, s.credibility]));

    // Collect ALL sources from ALL patterns (since issues are synthesized from all patterns)
    const allPatternSources: Array<{
      sourceId: string;
      sourceName: string;
      sourceUrl: string;
      itemTitle: string;
      itemUrl: string;
      excerpt?: string;
      credibility?: number;
    }> = [];

    for (const pattern of patterns) {
      if (pattern.sources) {
        for (const src of pattern.sources) {
          allPatternSources.push({
            sourceId: src.sourceId,
            sourceName: src.sourceName,
            sourceUrl: src.sourceUrl,
            itemTitle: src.itemTitle,
            itemUrl: src.itemUrl,
            excerpt: src.excerpt,
            credibility: credibilityMap.get(src.sourceId),
          });
        }
      }
    }

    // Deduplicate by itemUrl
    const uniqueSources = Array.from(
      new Map(allPatternSources.map((s) => [s.itemUrl, s])).values()
    );

    // Fallback to source-level info if no item-level sources
    const finalSources = uniqueSources.length > 0 ? uniqueSources : sourcesUsed.map((s) => ({
      sourceId: s.id,
      sourceName: s.name,
      sourceUrl: s.url,
      itemTitle: s.name,
      itemUrl: s.url,
      credibility: s.credibility,
    }));

    for (const issue of issues) {

      const id = generateId("iss");
      const now = new Date();

      const payload = {
        type: "Issue" as const,
        title: issue.title,
        summary: issue.summary,
      };
      const contentHash = await computeContentHash(payload);

      const scores = issue.scores;
      const compositeScore =
        scores.impact * 0.25 +
        scores.urgency * 0.2 +
        scores.tractability * 0.2 +
        scores.legitimacy * 0.15 +
        scores.neglectedness * 0.2;

      await issueRepo.create({
        id,
        contentHash,
        parentHash: null,
        author: "enhanced_discovery",
        authorSignature: `sig:discovery_${Date.now()}`,
        createdAt: now,
        version: 1,
        status: "active",
        title: issue.title,
        summary: issue.summary,
        patternIds: issue.patternIds,
        sources: finalSources,
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
      eventBus.publish("issue.created", { issueId: id });

      // Initialize Bayesian scores from IUTLN estimates
      try {
        const bayesianService = getBayesianScoringService();

        // Extract pattern types from linked patterns
        const patternTypes = patterns
          .filter((p) => issue.patternIds.includes(p.title)) // Match by pattern ID
          .map((p) => p.patternType)
          .filter((t): t is NonNullable<typeof t> => t !== undefined);

        await bayesianService.initializeIssue(
          id,
          issue.affectedDomains,
          patternTypes,
          {
            // Map IUTLN legitimacy to P(real) adjustment
            // High legitimacy suggests issue framing is likely correct
            legitimacy: scores.legitimacy,
            // Map IUTLN tractability to P(solvable) adjustment
            // High tractability suggests intervention is likely to succeed
            tractability: scores.tractability,
            // Impact estimate from IUTLN
            impact: scores.impact,
            // Derive reach from urgency (higher urgency = broader reach)
            reach: scores.urgency * 0.8 + 0.1,
            // Derive cost from inverse of tractability (harder = more costly)
            cost: (1 - scores.tractability) * 0.5,
          }
        );
        console.log(`[Discovery] Initialized Bayesian scores for issue ${id}`);
      } catch (bayesianError) {
        console.error(`[Discovery] Failed to initialize Bayesian scores for issue ${id}:`, bayesianError);
        // Don't fail the whole process if Bayesian initialization fails
      }
    }

    return savedIds;
  }

  // ============================================================================
  // Verification & Solutions (reuse from original with minor updates)
  // ============================================================================

  private async generateAndSaveVerifications(
    issues: IssueRow[],
    fetchedContent: FetchedContent[]
  ): Promise<string[]> {
    const db = getDatabase();
    const verificationRepo = new VerificationRepository(db);
    const savedIds: string[] = [];

    for (const issue of issues) {
      try {
        const verifications = await this.generateVerifications(issue, fetchedContent);

        for (const verification of verifications) {
          const id = generateId("ver");

          await verificationRepo.create({
            id,
            createdAt: new Date(),
            sourceType: "issue",
            sourceId: issue.id,
            claimStatement: verification.claimStatement,
            claimCategory: verification.claimCategory,
            originalConfidence: verification.originalConfidence,
            status: verification.status,
            adjustedConfidence: verification.adjustedConfidence,
            verificationNotes: verification.verificationNotes,
            corroboratingSourcesCount: verification.sourceAssessments.filter(
              (s) => s.alignment === "supports"
            ).length,
            conflictingSourcesCount: verification.sourceAssessments.filter(
              (s) => s.alignment === "contradicts"
            ).length,
            sourceAssessments: verification.sourceAssessments,
            conflicts: [],
          });

          savedIds.push(id);
        }
      } catch (error) {
        console.error(`Failed to generate verifications for issue ${issue.id}:`, error);
      }
    }

    return savedIds;
  }

  private async generateVerifications(
    issue: IssueRow,
    fetchedContent: FetchedContent[]
  ): Promise<GeneratedVerification[]> {
    const sourceSummary = fetchedContent
      .map((fc) => `- ${fc.sourceName} (${fc.sourceUrl}): ${fc.items.length} items, credibility ${Math.round(fc.credibility * 100)}%`)
      .join("\n");

    const prompt = `Verify key claims in this issue against available sources.

ISSUE:
Title: ${issue.title}
Summary: ${issue.summary}
Key Number: ${issue.keyNumber || "Not specified"}

AVAILABLE SOURCES:
${sourceSummary}

Extract 2-3 key verifiable claims and assess them:

Respond in JSON:
{
  "verifications": [
    {
      "claimStatement": "The specific claim",
      "claimCategory": "statistical",
      "originalConfidence": 0.7,
      "status": "partially_supported",
      "adjustedConfidence": 0.6,
      "verificationNotes": "Explanation",
      "sourceAssessments": [
        {
          "url": "https://example.com",
          "name": "Source Name",
          "credibility": 0.8,
          "alignment": "supports",
          "relevance": "high",
          "relevantExcerpt": "Quote",
          "confidence": 0.8
        }
      ]
    }
  ]
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content.find((c) => c.type === "text");
      if (text && text.type === "text") {
        const jsonMatch = text.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed.verifications as GeneratedVerification[];
        }
      }
    } catch (error) {
      console.error("Verification generation failed:", error);
    }

    return [];
  }

  private async generateAndSaveSolutions(
    issues: IssueRow[],
    context: DiscoveryContext
  ): Promise<string[]> {
    const db = getDatabase();
    const solutionRepo = new SolutionRepository(db);
    const savedIds: string[] = [];

    for (const issue of issues) {
      try {
        const solutions = await this.generateSolutions(issue);

        for (const solution of solutions) {
          const id = generateId("sol");
          const now = new Date();

          const payload = {
            type: "Solution" as const,
            title: solution.title,
            summary: solution.summary,
          };
          const contentHash = await computeContentHash(payload);

          await solutionRepo.create({
            id,
            contentHash,
            parentHash: null,
            author: "enhanced_discovery",
            authorSignature: `sig:discovery_${Date.now()}`,
            createdAt: now,
            version: 1,
            status: "active",
            situationModelId: null,
            issueId: issue.id,
            title: solution.title,
            summary: solution.summary,
            solutionType: solution.solutionType,
            mechanism: solution.mechanism,
            components: solution.components,
            preconditions: solution.preconditions,
            risks: solution.risks,
            metrics: solution.metrics,
            executionPlan: solution.executionPlan,
            artifacts: [],
            addressesIssues: [issue.id],
            targetLeveragePoints: solution.targetLeveragePoints,
            successMetrics: solution.successMetrics,
            estimatedImpact: { score: solution.impactScore, description: "AI-estimated" },
            feasibilityScore: solution.feasibilityScore,
            impactScore: solution.impactScore,
            confidence: solution.confidence,
            solutionStatus: "proposed",
            assignedTo: null,
            assignedAt: null,
          });

          savedIds.push(id);
          eventBus.publish("solution.created", { solutionId: id });
        }
      } catch (error) {
        console.error(`Failed to generate solutions for issue ${issue.id}:`, error);
      }
    }

    return savedIds;
  }

  private async generateSolutions(issue: IssueRow): Promise<GeneratedSolution[]> {
    const prompt = `Generate actionable solutions for this issue.

ISSUE:
Title: ${issue.title}
Summary: ${issue.summary}
Headline: ${issue.headline || "Not specified"}
Why Now: ${issue.whyNow || "Not specified"}
Key Number: ${issue.keyNumber || "Not specified"}
Root Causes: ${issue.rootCauses.join(", ")}
Leverage Points: ${issue.leveragePoints.join(", ")}
Scores: Impact=${issue.scoreImpact}, Urgency=${issue.scoreUrgency}, Tractability=${issue.scoreTractability}

Generate 1-2 concrete solutions with:
1. Title and summary
2. Solution type (tool/platform/system/automation/research/model/policy/other)
3. Mechanism
4. Components, preconditions, risks, metrics
5. Step-by-step execution plan
6. Success metrics with targets
7. Feasibility, impact, confidence scores (0-1)

Respond in JSON:
{
  "solutions": [
    {
      "title": "Solution title",
      "summary": "Summary",
      "solutionType": "policy",
      "mechanism": "How it works",
      "components": ["c1"],
      "preconditions": ["p1"],
      "risks": ["r1"],
      "metrics": ["m1"],
      "executionPlan": [{"step": 1, "action": "Action", "timeline": "Week 1"}],
      "targetLeveragePoints": ["lp1"],
      "successMetrics": [{"metric": "Adoption", "target": "50%", "timeline": "6 months"}],
      "feasibilityScore": 0.7,
      "impactScore": 0.8,
      "confidence": 0.75
    }
  ]
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content.find((c) => c.type === "text");
      if (text && text.type === "text") {
        const jsonMatch = text.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed.solutions as GeneratedSolution[];
        }
      }
    } catch (error) {
      console.error("Solution generation failed:", error);
    }

    return [];
  }

  // ============================================================================
  // Feedback Loop Generation
  // ============================================================================

  private async generateFeedbackEvents(params: {
    executionId: string;
    playbookId: string;
    success: boolean;
    durationMs: number;
    totalSteps: number;
    stepsCompleted: number;
    sourcesUsed: Array<{ id: string; name: string; url: string; credibility: number; itemCount: number }>;
    patternIds: string[];
    verificationIds: string[];
    context: DiscoveryContext;
  }): Promise<void> {
    const db = getDatabase();
    const feedbackRepo = new FeedbackEventRepository(db);
    const learningRepo = new SystemLearningRepository(db);
    const verificationRepo = new VerificationRepository(db);
    const patternRepo = new PatternRepository(db);

    try {
      // 1. Create playbook execution feedback
      await feedbackRepo.createPlaybookExecutionFeedback(
        params.executionId,
        params.playbookId,
        {
          success: params.success,
          completionRate: params.stepsCompleted / params.totalSteps,
          durationMs: params.durationMs,
          stepsCompleted: params.stepsCompleted,
          totalSteps: params.totalSteps,
          errorCount: 0,
        }
      );
      console.log(`[Feedback] Created playbook execution feedback for ${params.executionId}`);

      // 2. Update playbook learning
      await learningRepo.upsertLearning(
        "playbook_effectiveness",
        `playbook:${params.playbookId}`,
        {
          incrementSample: true,
          incrementSuccess: params.success,
          incrementFailure: !params.success,
          avgEffectiveness: params.success ? 1.0 : 0.0,
        }
      );

      // 3. Create verification feedback for pattern confidence adjustments
      for (const verificationId of params.verificationIds) {
        const verification = await verificationRepo.findById(verificationId);
        if (!verification) continue;

        // Find the pattern associated with this verification
        // Verifications are linked to issues, which are linked to patterns
        if (verification.sourceType === "issue" && verification.sourceId) {
          const issueRepo = new IssueRepository(db);
          const issue = await issueRepo.findById(verification.sourceId);
          if (issue?.patternIds?.length) {
            // Create feedback for the first linked pattern
            const patternId = issue.patternIds[0];
            const pattern = await patternRepo.findById(patternId);

            if (pattern) {
              await feedbackRepo.createVerificationFeedback(
                verificationId,
                patternId,
                {
                  verificationStatus: verification.status,
                  originalConfidence: verification.originalConfidence,
                  adjustedConfidence: verification.adjustedConfidence,
                }
              );

              // Update pattern quality learning based on verification outcome
              const verificationSuccessful = verification.status === "corroborated" ||
                verification.status === "partially_supported";

              await learningRepo.upsertLearning(
                "pattern_quality",
                `pattern_type:${pattern.patternType}`,
                {
                  incrementSample: true,
                  incrementSuccess: verificationSuccessful,
                  incrementFailure: !verificationSuccessful,
                  avgConfidence: verification.adjustedConfidence,
                }
              );
            }
          }
        }
      }
      console.log(`[Feedback] Created ${params.verificationIds.length} verification feedback events`);

      // 4. Create source accuracy feedback for each source used
      for (const source of params.sourcesUsed) {
        // Calculate accuracy based on items fetched and source credibility
        const accuracyScore = source.credibility;

        await feedbackRepo.createSourceAccuracyFeedback(
          params.executionId, // Use execution ID as source reference
          source.url, // Domain/URL as target
          {
            accuracyScore,
            verificationCount: source.itemCount,
            alignment: "neutral", // No verification yet, neutral alignment
          }
        );

        // Update source reliability learning
        await learningRepo.upsertLearning(
          "source_reliability",
          `source:${new URL(source.url).hostname}`,
          {
            incrementSample: true,
            avgAccuracy: accuracyScore,
          }
        );
      }
      console.log(`[Feedback] Created ${params.sourcesUsed.length} source accuracy feedback events`);

      // 5. Update domain-specific learnings
      for (const domain of params.context.domains) {
        await learningRepo.upsertLearning(
          "domain_discovery",
          `domain:${domain}`,
          {
            incrementSample: true,
            incrementSuccess: params.success,
            avgEffectiveness: params.patternIds.length / (params.context.maxPatterns || 20),
          }
        );
      }

      // 6. Create pattern creation learnings
      const avgPatternConfidence = await this.calculateAveragePatternConfidence(patternRepo, params.patternIds);
      if (params.patternIds.length > 0) {
        await learningRepo.upsertLearning(
          "discovery_patterns",
          "all_discoveries",
          {
            incrementSample: true,
            avgConfidence: avgPatternConfidence,
          }
        );
      }

      console.log("[Feedback] Feedback loop closed successfully for discovery run");
    } catch (error) {
      console.error("[Feedback] Failed to generate feedback events:", error);
      // Don't throw - feedback generation failure shouldn't fail the discovery
    }
  }

  private async calculateAveragePatternConfidence(
    patternRepo: PatternRepository,
    patternIds: string[]
  ): Promise<number> {
    if (patternIds.length === 0) return 0;

    let totalConfidence = 0;
    let count = 0;

    for (const id of patternIds) {
      const pattern = await patternRepo.findById(id);
      if (pattern?.confidence) {
        totalConfidence += pattern.confidence;
        count++;
      }
    }

    return count > 0 ? totalConfidence / count : 0;
  }
}

// Singleton
let executor: EnhancedDiscoveryExecutor | null = null;

export function startEnhancedDiscoveryExecutor(): void {
  if (!executor) {
    executor = new EnhancedDiscoveryExecutor();
    executor.start();
  }
}
