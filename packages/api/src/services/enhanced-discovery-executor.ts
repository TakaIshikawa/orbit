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
  InformationUnitRepository,
  type ManagedSourceRow,
  type IssueRow,
  type PatternRow,
  type VerificationRow,
} from "@orbit/db";
import { generateId, computeContentHash } from "@orbit/core";
import { eventBus } from "../events/index.js";
import { SourceFetcherRegistry, type FetchedContent, type FetchedItem } from "./source-fetchers/index.js";
import { getBayesianScoringService } from "./bayesian-scoring.js";
import { EpistemologicalValidationService } from "./epistemological-validation.js";
import { getInformationDecompositionService, type DecomposedUnit } from "./information-decomposition.js";

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
  enableEpistemologicalValidation?: boolean; // Run causal analysis, adversarial validation, and predictions
  enableInformationDecomposition?: boolean; // Decompose content into granularity-aware units
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

      // Log item counts and popularity metrics
      const totalItems = fetchedContent.reduce((sum, fc) => sum + fc.items.length, 0);
      const itemsWithCitations = fetchedContent.reduce(
        (sum, fc) => sum + fc.items.filter(i => i.popularity?.citationCount).length,
        0
      );
      const avgCitations = itemsWithCitations > 0
        ? Math.round(
            fetchedContent.reduce(
              (sum, fc) => sum + fc.items.reduce((s, i) => s + (i.popularity?.citationCount || 0), 0),
              0
            ) / itemsWithCitations
          )
        : 0;

      await executionRepo.appendLog(
        executionId,
        "info",
        `Fetched ${totalItems} items from ${fetchedContent.length} sources` +
        (itemsWithCitations > 0 ? ` (${itemsWithCitations} with citation data, avg ${avgCitations} citations)` : ""),
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

      // Step 4.5: Epistemological validation
      // Auto-run for high-score issues (compositeScore > 0.5) or if explicitly enabled
      const highScoreIssueIds = savedIssues
        .filter(issue => issue.compositeScore > 0.5)
        .map(issue => issue.id);

      const shouldRunValidation = context?.enableEpistemologicalValidation || highScoreIssueIds.length > 0;
      const issuesToValidate = context?.enableEpistemologicalValidation ? issueIds : highScoreIssueIds;

      if (shouldRunValidation && issuesToValidate.length > 0) {
        await executionRepo.appendLog(
          executionId,
          "info",
          `Step 4.5: Running epistemological validation for ${issuesToValidate.length} issues (causal analysis, adversarial challenges, predictions)...`,
          3
        );
        await this.runEpistemologicalValidation(issuesToValidate);
        await executionRepo.appendLog(executionId, "info", "Epistemological validation complete", 3);
      }

      // Step 4.6: Information decomposition (granularity-aware units)
      // Auto-run for high-score issues or if explicitly enabled
      let decompositionStats = { totalUnits: 0, comparisons: 0, contradictions: 0 };
      const shouldDecompose = context?.enableInformationDecomposition || highScoreIssueIds.length > 0;

      if (shouldDecompose && savedIssues.length > 0) {
        await executionRepo.appendLog(
          executionId,
          "info",
          `Step 4.6: Decomposing content into granularity-aware information units...`,
          3
        );
        decompositionStats = await this.decomposeAndCrossValidate(
          fetchedContent,
          savedIssues,
          sourcesUsed
        );
        await executionRepo.appendLog(
          executionId,
          "info",
          `Decomposition complete: ${decompositionStats.totalUnits} units, ${decompositionStats.comparisons} comparisons, ${decompositionStats.contradictions} contradictions`,
          3
        );

        // Update Bayesian P(real) based on consistency
        if (decompositionStats.totalUnits > 0) {
          const { getBayesianScoringService } = await import("./bayesian-scoring.js");
          const bayesianService = getBayesianScoringService();
          for (const issue of savedIssues) {
            await bayesianService.processConsistency(issue.id);
          }
          await executionRepo.appendLog(
            executionId,
            "info",
            `Updated Bayesian P(real) for ${savedIssues.length} issues based on consistency`,
            3
          );
        }

        // Step 4.7: Validate against accumulated knowledge base
        await executionRepo.appendLog(
          executionId,
          "info",
          "Step 4.7: Validating new units against accumulated knowledge base...",
          3
        );

        try {
          const { getKnowledgeBaseService } = await import("./knowledge-base.js");
          const kbService = getKnowledgeBaseService();

          let totalKbComparisons = 0;
          let totalKbSupport = 0;
          let totalKbContradictions = 0;

          for (const issue of savedIssues) {
            const kbResult = await kbService.validateIssueUnits(issue.id, {
              maxComparisonsPerUnit: 5,
              minFalsifiability: 0.6,
            });
            totalKbComparisons += kbResult.totalComparisons;
            if (kbResult.netConfidenceImpact > 0) totalKbSupport++;
            if (kbResult.netConfidenceImpact < 0) totalKbContradictions++;
          }

          await executionRepo.appendLog(
            executionId,
            "info",
            `Knowledge base validation: ${totalKbComparisons} cross-issue comparisons, ${totalKbSupport} issues strengthened, ${totalKbContradictions} issues weakened`,
            3
          );
        } catch (kbError) {
          await executionRepo.appendLog(
            executionId,
            "warn",
            `Knowledge base validation skipped: ${kbError instanceof Error ? kbError.message : "Unknown error"}`,
            3
          );
        }
      }

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
          decomposition: decompositionStats,
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

      // Include popularity metrics in source text for context
      const sourceText = items
        .map((item, idx) => {
          let header = `[ITEM_${idx}] "${item.title}" (${item.url})`;
          if (item.popularity?.citationCount) {
            header += ` [${item.popularity.citationCount} citations]`;
          }
          if (item.publishedAt) {
            header += ` [${item.publishedAt.toISOString().split('T')[0]}]`;
          }
          return `${header}\n${item.summary || item.content.slice(0, 500)}`;
        })
        .join("\n\n---\n\n");

      const prompt = `Extract key factual claims from this source content. Focus on claims that are:
- Specific and verifiable
- Related to systemic issues, trends, or patterns
- Supported by data or evidence in the text

SOURCE: ${content.sourceName} (credibility: ${Math.round(content.credibility * 100)}%)

CONTENT:
${sourceText}

For each claim, provide:
1. The claim statement (clear, specific, with the key data point)
2. Category: factual, statistical, causal, or predictive
3. A relevant excerpt from the source (MUST be an exact quote that supports the claim)
4. Confidence level (0-1)
5. The ITEM_N identifier that this claim comes from (e.g., "ITEM_0")

IMPORTANT: The excerpt must be a direct quote from the source that provides evidence for the claim. This is critical for verification.

Respond in JSON:
{
  "claims": [
    {
      "statement": "Clear claim statement with specific data",
      "category": "statistical",
      "excerpt": "Exact quote from source text supporting this claim",
      "confidence": 0.8,
      "itemRef": "ITEM_0"
    }
  ]
}

Extract up to 10 key claims, prioritizing those with strong evidence in the text.`;

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

    // Build pattern summaries WITH source citations
    const patternSummaries = patterns
      .map((p, i) => {
        const sourceRefs = p.sources?.slice(0, 3).map(s => `[${s.sourceName}]`).join(", ") || "No sources";
        return `[${patternIds[i]}] ${p.title}: ${p.description}
  Sources: ${sourceRefs}
  Confidence: ${p.confidence.toFixed(2)}, Cross-validation: ${p.crossValidationScore.toFixed(2)}`;
      })
      .join("\n\n");

    const prompt = `Synthesize actionable issues from these validated patterns.

PATTERNS (with confidence and cross-validation scores):
${patternSummaries}

Based on these patterns, identify up to ${context.maxIssues} distinct issues. Prioritize patterns with higher confidence and cross-validation scores.

IMPORTANT: Ground all claims in the source evidence. The keyNumber should cite a specific source. The summary should reference specific findings from sources.

For each issue provide:
1. Clear, actionable title
2. Comprehensive summary (MUST reference specific sources, e.g., "According to [Source Name], ...")
3. Short headline (one sentence)
4. Why this matters NOW (cite recent data/findings)
5. Key statistic/number (MUST include source attribution, e.g., "500K affected [World Bank, 2024]")
6. Root causes (grounded in evidence)
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

  /**
   * Run epistemological validation on issues (causal analysis, adversarial validation, predictions)
   * This is optional and can be expensive (multiple LLM calls per issue)
   */
  private async runEpistemologicalValidation(issueIds: string[]): Promise<void> {
    const validationService = new EpistemologicalValidationService();

    for (const issueId of issueIds) {
      try {
        console.log(`[Discovery] Running epistemological validation for issue ${issueId}...`);
        const result = await validationService.validateIssue(issueId);
        console.log(`[Discovery] Epistemological validation complete for ${issueId}:`);
        console.log(`  - Causal claims: ${result.causalAnalysis.claims.length}`);
        console.log(`  - Challenges: ${result.adversarialValidation.challenges.length}`);
        console.log(`  - Predictions: ${result.predictions.predictions.length}`);
        console.log(`  - Validation score: ${(result.validationScore * 100).toFixed(1)}%`);
      } catch (validationError) {
        console.error(`[Discovery] Epistemological validation failed for issue ${issueId}:`, validationError);
        // Don't fail the whole process if validation fails
      }
    }
  }

  // ============================================================================
  // Information Decomposition & Cross-Validation
  // ============================================================================

  /**
   * Decompose content into granularity-aware information units and cross-validate
   */
  private async decomposeAndCrossValidate(
    fetchedContent: FetchedContent[],
    issues: IssueRow[],
    sourcesUsed: Array<{ id: string; name: string; url: string; credibility: number; itemCount: number }>
  ): Promise<{ totalUnits: number; comparisons: number; contradictions: number }> {
    const db = getDatabase();
    const unitRepo = new InformationUnitRepository(db);
    const decompositionService = getInformationDecompositionService();

    const credibilityMap = new Map(sourcesUsed.map((s) => [s.id, s.credibility]));
    let totalUnits = 0;
    let comparisons = 0;
    let contradictions = 0;

    // Map issues to their linked patterns for domain context
    const issueIds = new Set(issues.map((i) => i.id));

    // Step 1: Decompose each source item into information units
    for (const content of fetchedContent) {
      const sourceCredibility = credibilityMap.get(content.sourceId) || content.credibility;

      for (const item of content.items.slice(0, 5)) { // Limit to top 5 items per source
        try {
          // Determine content type for source authority weighting
          const contentType = this.classifyContentType(item, content.sourceName);

          // Decompose into units
          const units = await decompositionService.decomposeItem(item, sourceCredibility, contentType);

          if (units.length === 0) continue;

          // Find the most relevant issue for this content
          const relevantIssue = this.findRelevantIssue(item, issues);

          // Save units
          const savedUnits = await unitRepo.createMany(
            units.map((unit) => ({
              sourceId: content.sourceId,
              sourceName: content.sourceName,
              sourceUrl: content.sourceUrl,
              itemUrl: item.url,
              itemTitle: item.title,
              excerpt: unit.excerpt,
              granularityLevel: unit.granularityLevel,
              granularityConfidence: unit.granularityConfidence,
              statement: unit.statement,
              temporalScope: unit.temporalScope,
              temporalSpecifics: unit.temporalSpecifics || null,
              spatialScope: unit.spatialScope,
              spatialSpecifics: unit.spatialSpecifics || null,
              domains: unit.domains,
              concepts: unit.concepts,
              measurability: unit.measurability,
              quantitativeData: unit.quantitativeData || null,
              falsifiabilityScore: unit.falsifiabilityScore,
              falsifiabilityCriteria: unit.falsifiabilityCriteria,
              priorConfidence: 0.5,
              currentConfidence: 0.5,
              sourceAuthorityForLevel: unit.sourceAuthorityForLevel,
              issueId: relevantIssue?.id || null,
            }))
          );

          totalUnits += savedUnits.length;
          console.log(`[Decomposition] Extracted ${savedUnits.length} units from "${item.title.slice(0, 50)}..."`);

        } catch (error) {
          console.error(`[Decomposition] Failed to decompose item "${item.title}":`, error);
        }
      }
    }

    // Step 2: Cross-validate units at the same granularity level
    console.log(`[Decomposition] Cross-validating ${totalUnits} units...`);

    // Get all units we just created, grouped by granularity level
    const levels = ["data_point", "observation", "statistical", "causal_claim"]; // Focus on falsifiable levels

    for (const level of levels) {
      const unitsAtLevel = await unitRepo.findByGranularityLevel(level, { limit: 50 });

      if (unitsAtLevel.length < 2) continue;

      // Compare units with sufficient comparability
      for (let i = 0; i < Math.min(unitsAtLevel.length, 20); i++) {
        const unitA = unitsAtLevel[i];
        const comparableUnits = await unitRepo.findComparableUnits(unitA, { limit: 5, minConceptOverlap: 0.2 });

        for (const unitB of comparableUnits) {
          try {
            // Convert to DecomposedUnit format for comparison
            const unitADecomposed = this.toDecomposedUnit(unitA);
            const unitBDecomposed = this.toDecomposedUnit(unitB);

            const result = await decompositionService.compareUnits(unitADecomposed, unitBDecomposed);

            // Save comparison
            await unitRepo.createComparison({
              unitAId: unitA.id,
              unitBId: unitB.id,
              granularityLevel: level as "data_point" | "observation" | "statistical" | "causal_claim" | "mechanism" | "theory" | "paradigm",
              comparabilityScore: result.comparabilityScore,
              comparabilityFactors: result.comparabilityFactors,
              relationship: result.relationship,
              agreementScore: result.agreementScore,
              contradictionType: result.contradictionType || null,
              contradictionAnalysis: result.contradictionAnalysis || null,
              netConfidenceImpact: result.netConfidenceImpact,
              impactExplanation: result.impactExplanation,
            });

            comparisons++;
            if (result.relationship === "contradicts") {
              contradictions++;
              console.log(`[Decomposition] Contradiction found at ${level}: "${unitA.statement.slice(0, 50)}..." vs "${unitB.statement.slice(0, 50)}..."`);
            }

            // Apply Bayesian update to unit confidences
            if (result.netConfidenceImpact !== 0) {
              await unitRepo.updateConfidence(
                unitA.id,
                Math.max(0, Math.min(1, unitA.currentConfidence + result.netConfidenceImpact))
              );
              await unitRepo.updateConfidence(
                unitB.id,
                Math.max(0, Math.min(1, unitB.currentConfidence + result.netConfidenceImpact))
              );
            }
          } catch (error) {
            console.error(`[Decomposition] Comparison failed:`, error);
          }
        }
      }
    }

    // Step 3: Update issue consistency based on supporting units
    for (const issue of issues) {
      try {
        const unitCountsByLevel = await unitRepo.getUnitCountsByLevel(issue.id);
        const confidenceByLevel = await unitRepo.getConfidenceByLevel(issue.id);
        const comparisonStats = await unitRepo.getComparisonStats(issue.id);

        const totalUnitCount = Object.values(unitCountsByLevel).reduce((a, b) => a + b, 0);
        if (totalUnitCount === 0) continue;

        // Compute weighted consistency (weight by falsifiability)
        const FALSIFIABILITY_WEIGHTS: Record<string, number> = {
          paradigm: 0.1, theory: 0.3, mechanism: 0.5, causal_claim: 0.6,
          statistical: 0.8, observation: 0.9, data_point: 0.95,
        };

        let weightedSum = 0;
        let totalWeight = 0;
        for (const [level, count] of Object.entries(unitCountsByLevel)) {
          const weight = FALSIFIABILITY_WEIGHTS[level] || 0.5;
          const confidence = confidenceByLevel[level] || 0.5;
          weightedSum += weight * confidence * count;
          totalWeight += weight * count;
        }

        const weightedConsistency = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
        const overallConsistency = comparisonStats.totalComparisons > 0
          ? (comparisonStats.agreements / comparisonStats.totalComparisons)
          : 0.5;

        await unitRepo.upsertConsistency("issue", issue.id, {
          supportByLevel: Object.fromEntries(
            Object.entries(unitCountsByLevel).map(([level, count]) => [
              level,
              {
                unitCount: count,
                sourceCount: 1, // TODO: count unique sources
                avgConfidence: confidenceByLevel[level] || 0.5,
                agreementRate: overallConsistency,
                contradictionCount: comparisonStats.contradictions,
              },
            ])
          ),
          overallConsistency,
          weightedConsistency,
        });

        console.log(`[Decomposition] Issue ${issue.id} consistency: ${(weightedConsistency * 100).toFixed(1)}% (${totalUnitCount} units)`);
      } catch (error) {
        console.error(`[Decomposition] Failed to update consistency for issue ${issue.id}:`, error);
      }
    }

    return { totalUnits, comparisons, contradictions };
  }

  private classifyContentType(item: FetchedItem, sourceName: string): "foundational" | "current" | "research" {
    const lowerSource = sourceName.toLowerCase();
    const lowerTitle = item.title.toLowerCase();

    // Research sources
    if (lowerSource.includes("arxiv") || lowerSource.includes("pubmed") ||
        lowerSource.includes("nature") || lowerSource.includes("science")) {
      return "research";
    }

    // Foundational (topic pages, methodology, definitions)
    if (lowerTitle.includes("introduction") || lowerTitle.includes("overview") ||
        lowerTitle.includes("methodology") || lowerTitle.includes("definition")) {
      return "foundational";
    }

    // Default to current (news, blogs, recent articles)
    return "current";
  }

  private findRelevantIssue(item: FetchedItem, issues: IssueRow[]): IssueRow | null {
    if (issues.length === 0) return null;

    const itemText = `${item.title} ${item.summary || item.content}`.toLowerCase();

    // Score each issue by domain/concept overlap
    let bestMatch: IssueRow | null = null;
    let bestScore = 0;

    for (const issue of issues) {
      let score = 0;
      for (const domain of issue.affectedDomains) {
        if (itemText.includes(domain.toLowerCase())) score += 2;
      }
      for (const cause of issue.rootCauses) {
        const causeWords = cause.toLowerCase().split(/\s+/);
        for (const word of causeWords) {
          if (word.length > 4 && itemText.includes(word)) score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = issue;
      }
    }

    return bestScore >= 2 ? bestMatch : issues[0]; // Fall back to first issue
  }

  private toDecomposedUnit(row: {
    statement: string;
    granularityLevel: string;
    granularityConfidence: number;
    temporalScope: string;
    temporalSpecifics: unknown;
    spatialScope: string;
    spatialSpecifics: unknown;
    domains: unknown;
    concepts: unknown;
    measurability: string;
    quantitativeData: unknown;
    falsifiabilityScore: number;
    falsifiabilityCriteria: unknown;
    excerpt: string;
    sourceAuthorityForLevel: number;
  }): DecomposedUnit {
    return {
      statement: row.statement,
      granularityLevel: row.granularityLevel as DecomposedUnit["granularityLevel"],
      granularityConfidence: row.granularityConfidence,
      temporalScope: row.temporalScope as DecomposedUnit["temporalScope"],
      temporalSpecifics: row.temporalSpecifics as DecomposedUnit["temporalSpecifics"],
      spatialScope: row.spatialScope as DecomposedUnit["spatialScope"],
      spatialSpecifics: row.spatialSpecifics as DecomposedUnit["spatialSpecifics"],
      domains: (row.domains as string[]) || [],
      concepts: (row.concepts as string[]) || [],
      measurability: row.measurability as DecomposedUnit["measurability"],
      quantitativeData: row.quantitativeData as DecomposedUnit["quantitativeData"],
      falsifiabilityScore: row.falsifiabilityScore,
      falsifiabilityCriteria: (row.falsifiabilityCriteria as DecomposedUnit["falsifiabilityCriteria"]) || {
        testableConditions: [],
        observableIndicators: [],
        timeframeForTest: "Unknown",
      },
      excerpt: row.excerpt,
      sourceAuthorityForLevel: row.sourceAuthorityForLevel,
    };
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
    // Build source context for grounded solutions
    const sourcesContext = issue.sources?.slice(0, 5).map(s =>
      `- ${s.sourceName}: "${s.excerpt || s.itemTitle}" (${s.itemUrl})`
    ).join("\n") || "No sources available";

    const prompt = `Generate actionable solutions for this issue, grounded in the available evidence.

ISSUE:
Title: ${issue.title}
Summary: ${issue.summary}
Headline: ${issue.headline || "Not specified"}
Why Now: ${issue.whyNow || "Not specified"}
Key Number: ${issue.keyNumber || "Not specified"}
Root Causes: ${issue.rootCauses.join(", ")}
Leverage Points: ${issue.leveragePoints.join(", ")}
Scores: Impact=${issue.scoreImpact}, Urgency=${issue.scoreUrgency}, Tractability=${issue.scoreTractability}

SOURCES (ground your solutions in this evidence):
${sourcesContext}

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
