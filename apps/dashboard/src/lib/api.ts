// Default port matches .env PORT setting; use NEXT_PUBLIC_API_URL for custom config
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4921";

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface SingleResponse<T> {
  data: T;
}

// Pattern types
export interface Pattern {
  id: string;
  contentHash: string;
  author: string;
  createdAt: string;
  version: number;
  status: string;
  title: string;
  description: string;
  patternType: string;
  domains: string[];
  geographies: string[];
  sources: Array<{
    type: string;
    url: string;
    title: string;
    reliability: number;
  }>;
  firstObserved: string;
  observationFrequency: string;
  clusterId: string | null;
  confidence: number;
}

// Issue types
export type SimpleStatus = "needs_attention" | "being_worked" | "blocked" | "watching" | "resolved";

export interface Issue {
  id: string;
  contentHash: string;
  author: string;
  createdAt: string;
  version: number;
  status: string;
  title: string;
  summary: string;
  // Condensed display fields (human-readable summaries)
  headline?: string | null;
  whyNow?: string | null;
  keyNumber?: string | null;
  simpleStatus?: SimpleStatus | null;
  // Core fields
  patternIds: string[];
  sources: Array<{
    sourceId: string;
    sourceName: string;
    sourceUrl: string;
    itemTitle: string;
    itemUrl: string;
    excerpt?: string;
    credibility?: number;
  }>;
  affectedDomains: string[];
  rootCauses: string[];
  leveragePoints: string[];
  scoreImpact: number;
  scoreUrgency: number;
  scoreTractability: number;
  scoreLegitimacy: number;
  scoreNeglectedness: number;
  compositeScore: number;
  upstreamIssues: string[];
  downstreamIssues: string[];
  relatedIssues: string[];
  timeHorizon: string;
  propagationVelocity: string;
  issueStatus: string;
  // Archive fields
  isArchived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;
}

// Solution types
export interface Solution {
  id: string;
  contentHash: string;
  author: string;
  createdAt: string;
  version: number;
  status: string;
  situationModelId: string | null;
  issueId: string | null;
  title: string;
  summary: string;
  solutionType: string;
  mechanism: string;
  targetLeveragePoints?: string[];
  components: Array<{ name: string; description: string; complexity: string }>;
  risks: Array<{ description: string; likelihood: string; impact: string; mitigation?: string }>;
  executionPlan?: {
    steps: Array<{ phase: number; name: string; description: string; deliverables: string[] }>;
    totalPhases: number;
  };
  successMetrics?: Array<{ metric: string; target: string; measurementMethod: string }>;
  estimatedImpact?: { scope: string; magnitude: string; timeToImpact: string };
  feasibilityScore?: number;
  impactScore?: number;
  confidence?: number;
  solutionStatus: string;
  assignedTo?: string | null;
  assignedAt?: string | null;
}

// Dashboard types
export interface ActionableIssue extends Issue {
  actionability: number;
  solutionCount: number;
  hasFeasibleSolution: boolean;
}

export interface ActiveWorkSolution extends Solution {
  daysSinceStarted: number | null;
}

export interface SolutionWithEffectiveness extends Solution {
  effectiveness: {
    overallScore: number | null;
    metricsAchieved: number;
    metricsMissed: number;
    impactVariance: number | null;
  } | null;
}

export interface DashboardSummary {
  topActionableIssues: ActionableIssue[];
  activeWork: ActiveWorkSolution[];
  recentOutcomes: SolutionWithEffectiveness[];
}

export interface MyWork {
  inProgress: ActiveWorkSolution[];
  completed: SolutionWithEffectiveness[];
  totalInProgress: number;
  totalCompleted: number;
}

// RunLog types
export interface RunLog {
  id: string;
  contentHash: string;
  author: string;
  createdAt: string;
  decisionId: string;
  agentId: string;
  triggeredBy: { type: string; ref: string };
  startedAt: string;
  completedAt: string | null;
  llmCalls: Array<{
    callId: number;
    model: string;
    tokens: { input: number; output: number };
    latencyMs: number;
  }>;
  runStatus: string;
  error: string | null;
  artifacts?: Array<{
    type: string;
    content: string;
  }>;
}

// Agent types
export interface Agent {
  id: string;
  name: string;
  agentType: string;
  description: string;
  status: "active" | "stopped" | "error";
  config: Record<string, unknown>;
  createdAt: string;
  lastInvokedAt: string | null;
  invocationCount: number;
}

export interface AgentType {
  type: string;
  name: string;
  description: string;
}

// ProblemBrief types
export interface ProblemBrief {
  id: string;
  contentHash: string;
  author: string;
  createdAt: string;
  version: number;
  status: string;
  issueId: string;
  goals: Array<{
    description: string;
    priority: "must" | "should" | "could";
    measurable?: boolean;
    successCriteria?: string;
  }>;
  constraints: Array<{
    type: "resource" | "time" | "political" | "technical" | "ethical" | "legal";
    description: string;
    hard: boolean;
    workaround?: string;
  }>;
  uncertainties: Array<{
    area: string;
    description: string;
    impact: "low" | "medium" | "high";
    resolvable?: boolean;
    resolutionApproach?: string;
  }>;
  actionSpace: Array<{
    category: string;
    actions: string[];
    feasibility: "low" | "medium" | "high";
    timeframe: "immediate" | "short_term" | "medium_term" | "long_term";
  }>;
  requiredEvidence: Array<{
    question: string;
    evidenceType: "quantitative" | "qualitative" | "mixed";
    sources: string[];
    priority: "critical" | "important" | "nice_to_have";
  }>;
}

// SituationModel types
export interface SituationModel {
  id: string;
  contentHash: string;
  author: string;
  createdAt: string;
  version: number;
  status: string;
  problemBriefId: string;
  claims: Array<{ id: string; statement: string; confidence: number; claimType: string }>;
  evidence: Array<{ id: string; type: string; source: string; summary: string; reliability: number }>;
  systemMap: {
    actors: Array<{ id: string; name: string; role: string; interests: string[]; influence: number }>;
    relationships: Array<{ from: string; to: string; type: string }>;
    feedbackLoops: Array<{ description: string; reinforcing: boolean; nodes: string[] }>;
  };
  keyInsights: string[];
  recommendedLeveragePoints: string[];
}

// Decision types
export interface Decision {
  id: string;
  contentHash: string;
  author: string;
  createdAt: string;
  version: number;
  status: string;
  solutionId: string;
  decision: string;
  rationale: string;
  modifications: string | null;
  autonomyLevel: string;
  approvals: Array<{ actorId: string; approvedAt: string; scope: string }>;
  guardrails: Array<{ type: string; limit: string; enforcement: string }>;
  runId: string | null;
}

// Verification types
export interface Verification {
  id: string;
  createdAt: string;
  sourceType: string;
  sourceId: string;
  claimStatement: string;
  claimCategory: "factual" | "statistical" | "causal" | "predictive" | "definitional";
  originalConfidence: number;
  status: "pending" | "corroborated" | "contested" | "partially_supported" | "unverified";
  adjustedConfidence: number;
  verificationNotes: string | null;
  corroboratingSourcesCount: number;
  conflictingSourcesCount: number;
  sourceAssessments: Array<{
    url: string;
    name: string;
    credibility: number;
    alignment: "supports" | "contradicts" | "neutral" | "partially_supports";
    relevance: "high" | "medium" | "low" | "none";
    relevantExcerpt: string;
    confidence: number;
  }>;
  conflicts: Array<{
    description: string;
    severity: "minor" | "moderate" | "major";
    sources: string[];
  }>;
}

export interface VerificationSummary {
  totalClaims: number;
  corroborated: number;
  contested: number;
  partiallySupported: number;
  unverified: number;
  averageConfidence: number;
}

// Source Health types
export interface SourceHealth {
  id: string;
  domain: string;
  healthStatus: "healthy" | "degraded" | "unhealthy" | "unknown";
  successRate: number | null;
  totalFetches: number;
  failedFetches: number;
  successfulFetches: number;
  avgResponseTimeMs: number | null;
  p95ResponseTimeMs: number | null;
  minResponseTimeMs: number | null;
  maxResponseTimeMs: number | null;
  errorsByType: {
    timeout?: number;
    http_error?: number;
    network_error?: number;
    blocked?: number;
    rate_limited?: number;
  } | null;
  baseReliability: number | null;
  dynamicReliability: number | null;
  reliabilityConfidence: number | null;
  totalVerifications: number;
  corroboratedCount: number;
  contestedCount: number;
  alertActive: boolean;
  alertReason: string | null;
  alertSince: string | null;
  windowStartAt: string | null;
  windowDays: number;
  lastFetchAt: string | null;
  lastCalculatedAt: string;
  createdAt: string;
}

export interface SourceFetchLog {
  id: string;
  domain: string;
  url: string;
  fetchedAt: string;
  status: "success" | "timeout" | "http_error" | "network_error" | "blocked" | "rate_limited";
  httpStatusCode: number | null;
  responseTimeMs: number | null;
  contentLength: number | null;
  error: string | null;
  errorType: string | null;
  jobId: string | null;
  agentId: string | null;
}

export interface SourceHealthSummary {
  totalSources: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  unknown: number;
  activeAlerts: number;
}

// Feedback types
export interface FeedbackEvent {
  id: string;
  feedbackType: "verification_result" | "solution_outcome" | "source_accuracy" | "playbook_execution" | "manual_correction";
  sourceEntityType: string;
  sourceEntityId: string;
  targetEntityType: string;
  targetEntityId: string;
  feedbackData: Record<string, unknown>;
  status: "pending" | "processed" | "failed" | "skipped";
  processedAt: string | null;
  appliedAdjustment: boolean;
  adjustmentDetails: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ConfidenceAdjustment {
  id: string;
  entityType: string;
  entityId: string;
  field: string;
  previousValue: number;
  newValue: number;
  adjustmentDelta: number;
  reason: string;
  triggeredByEventId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface SystemLearning {
  id: string;
  category: string;  // API returns "category" not "learningCategory"
  learningKey: string;
  sampleSize: number;
  successCount: number;
  failureCount: number;
  successRate: number | null;
  avgConfidence: number | null;
  avgEffectiveness: number | null;
  avgAccuracy: number | null;
  insights: Array<{
    insight: string;
    confidence: number;
    observedAt: string;
    sourceEntityIds: string[];
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationRun {
  id: string;
  createdAt: string;
  completedAt: string | null;
  periodStart: string;
  periodEnd: string;
  metrics: {
    patternsCreated?: number;
    patternsVerified?: number;
    avgPatternConfidence?: number;
    patternVerificationRate?: number;
    issuesCreated?: number;
    issuesResolved?: number;
    avgResolutionTime?: number;
    avgCompositeScore?: number;
    solutionsProposed?: number;
    solutionsCompleted?: number;
    avgEffectiveness?: number;
    solutionsExceedingEstimate?: number;
    sourcesMonitored?: number;
    avgSourceHealth?: number;
    degradedSources?: number;
    avgVerificationAccuracy?: number;
    feedbackEventsProcessed?: number;
    adjustmentsMade?: number;
    avgAdjustmentMagnitude?: number;
  };
  recommendations: Array<{ area: string; recommendation: string; priority: "high" | "medium" | "low"; expectedImpact: string }>;
  trends?: Record<string, unknown> | null;
}

export interface FeedbackStats {
  pendingCount: number;
  processedLast24h: number;
  adjustmentsMadeLast24h: number;
  learningsCount: number;
  byType: {
    verification_result: number;
    solution_outcome: number;
    source_accuracy: number;
    playbook_execution: number;
    manual_correction: number;
  };
}

export interface AdjustmentStats {
  totalAdjustments: number;
  positiveAdjustments: number;
  negativeAdjustments: number;
  avgAdjustmentMagnitude: number;
}

// Scheduler types
export interface ScheduledJob {
  id: string;
  name: string;
  jobType: "scout" | "analyze" | "brief" | "verify" | "plan" | "pipeline";
  cronExpression: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface JobRun {
  id: string;
  jobId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  output: string | null;
  error: string | null;
  stats: {
    patternsCreated?: number;
    issuesCreated?: number;
    solutionsCreated?: number;
    briefsCreated?: number;
    verificationsCreated?: number;
    sourcesProcessed?: number;
  };
}

// Artifact types
export interface Artifact {
  id: string;
  contentHash: string;
  author: string;
  createdAt: string;
  version: number;
  status: string;
  solutionId: string;
  runId: string;
  title: string;
  artifactType: string;
  contentRef: { storage: string; location: string; contentHash: string };
  format: string;
  sizeBytes: number;
  derivedFrom: string[];
  artifactStatus: string;
}

// Playbook types
export interface PlaybookStep {
  name: string;
  description?: string;
  action: {
    type: "scout" | "analyze" | "brief" | "verify" | "plan" | "notify" | "condition" | "wait" | "human_review";
    config: Record<string, unknown>;
  };
  continueOnError?: boolean;
}

export interface PlaybookTrigger {
  type: "manual" | "pattern_created" | "issue_created" | "schedule" | "webhook";
  conditions?: {
    patternTypes?: string[];
    domains?: string[];
    minConfidence?: number;
    minScore?: number;
  };
  schedule?: string;
}

export interface Playbook {
  id: string;
  contentHash: string;
  author: string;
  createdAt: string;
  version: number;
  status: string;
  name: string;
  description: string;
  triggers: PlaybookTrigger[];
  applicableTo: {
    patternTypes?: string[];
    domains?: string[];
  };
  steps: PlaybookStep[];
  timesUsed: number;
  successRate: number | null;
  playbookStatus: "draft" | "active" | "deprecated";
  isEnabled: boolean;
}

export interface PlaybookExecution {
  id: string;
  playbookId: string;
  triggeredBy: string;
  triggerRef: string | null;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string | null;
  context: {
    patternId?: string;
    issueId?: string;
    briefId?: string;
    variables?: Record<string, unknown>;
  };
  currentStep: number;
  totalSteps: number;
  output: Record<string, unknown>;
  error: string | null;
  logs: Array<{
    timestamp: string;
    level: "info" | "warn" | "error";
    message: string;
    stepIndex?: number;
  }>;
}

export interface PlaybookStepExecution {
  id: string;
  executionId: string;
  stepIndex: number;
  stepName: string;
  actionType: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  config: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
}

// API client
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(error.error?.message || error.message || "Request failed");
    }

    return res.json();
  }

  // Patterns
  async getPatterns(params?: {
    limit?: number;
    offset?: number;
    patternType?: string;
    status?: string;
    search?: string;
  }): Promise<PaginatedResponse<Pattern>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.patternType) searchParams.set("patternType", params.patternType);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.search) searchParams.set("search", params.search);

    const query = searchParams.toString();
    return this.request(`/patterns${query ? `?${query}` : ""}`);
  }

  async getPattern(id: string): Promise<SingleResponse<Pattern>> {
    return this.request(`/patterns/${id}`);
  }

  async createPattern(data: Partial<Pattern>): Promise<SingleResponse<Pattern>> {
    return this.request("/patterns", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Issues
  async getIssues(params?: {
    limit?: number;
    offset?: number;
    status?: string;
    minScore?: number;
    includeArchived?: boolean;
  }): Promise<PaginatedResponse<Issue>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.status) searchParams.set("status", params.status);
    if (params?.minScore) searchParams.set("minScore", params.minScore.toString());
    if (params?.includeArchived) searchParams.set("includeArchived", "true");

    const query = searchParams.toString();
    return this.request(`/issues${query ? `?${query}` : ""}`);
  }

  async getIssue(id: string): Promise<SingleResponse<Issue>> {
    return this.request(`/issues/${id}`);
  }

  async createIssue(data: Partial<Issue>): Promise<SingleResponse<Issue>> {
    return this.request("/issues", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async summarizeIssue(id: string): Promise<{
    data: {
      issue: Issue;
      summary: {
        headline: string;
        whyNow: string;
        keyNumber: string;
        simpleStatus: SimpleStatus;
      };
    };
  }> {
    return this.request(`/issues/${id}/summarize`, {
      method: "POST",
    });
  }

  async summarizeAllIssues(): Promise<{
    data: {
      processed: number;
      total: number;
      results: Array<{ id: string; headline: string; error?: string }>;
    };
  }> {
    return this.request("/issues/summarize-all", {
      method: "POST",
    });
  }

  async archiveIssue(id: string, reason?: string): Promise<SingleResponse<Issue>> {
    return this.request(`/issues/${id}/archive`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  async unarchiveIssue(id: string): Promise<SingleResponse<Issue>> {
    return this.request(`/issues/${id}/unarchive`, {
      method: "POST",
    });
  }

  // Solutions
  async getSolutions(params?: {
    limit?: number;
    offset?: number;
    issueId?: string;
    solutionType?: string;
    solutionStatus?: string;
  }): Promise<PaginatedResponse<Solution>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.issueId) searchParams.set("issueId", params.issueId);
    if (params?.solutionType) searchParams.set("solutionType", params.solutionType);
    if (params?.solutionStatus) searchParams.set("solutionStatus", params.solutionStatus);

    const query = searchParams.toString();
    return this.request(`/solutions${query ? `?${query}` : ""}`);
  }

  async getSolution(id: string): Promise<SingleResponse<Solution>> {
    return this.request(`/solutions/${id}`);
  }

  async getSolutionsByIssue(issueId: string): Promise<PaginatedResponse<Solution>> {
    return this.getSolutions({ issueId, limit: 20 });
  }

  // Runs
  async getRuns(params?: {
    limit?: number;
    offset?: number;
    agentId?: string;
    runStatus?: string;
  }): Promise<PaginatedResponse<RunLog>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.agentId) searchParams.set("agentId", params.agentId);
    if (params?.runStatus) searchParams.set("runStatus", params.runStatus);

    const query = searchParams.toString();
    return this.request(`/runs${query ? `?${query}` : ""}`);
  }

  async getRun(id: string): Promise<SingleResponse<RunLog>> {
    return this.request(`/runs/${id}`);
  }

  // Playbooks
  async getPlaybooks(params?: {
    limit?: number;
    offset?: number;
    playbookStatus?: string;
    search?: string;
  }): Promise<PaginatedResponse<Playbook>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.playbookStatus) searchParams.set("playbookStatus", params.playbookStatus);
    if (params?.search) searchParams.set("search", params.search);

    const query = searchParams.toString();
    return this.request(`/playbooks${query ? `?${query}` : ""}`);
  }

  async getPlaybook(id: string): Promise<SingleResponse<Playbook>> {
    return this.request(`/playbooks/${id}`);
  }

  async enablePlaybook(id: string): Promise<SingleResponse<Playbook>> {
    return this.request(`/playbooks/${id}/enable`, { method: "PATCH" });
  }

  async disablePlaybook(id: string): Promise<SingleResponse<Playbook>> {
    return this.request(`/playbooks/${id}/disable`, { method: "PATCH" });
  }

  async forkPlaybook(id: string): Promise<SingleResponse<Playbook>> {
    return this.request(`/playbooks/${id}/fork`, { method: "POST" });
  }

  async createPlaybook(data: {
    name: string;
    description: string;
    steps?: Array<{ name: string; action: { type: string; config: Record<string, unknown> } }>;
    triggers?: Array<{ type: string; schedule?: string }>;
    applicableTo?: Record<string, unknown>;
    playbookStatus?: string;
  }): Promise<SingleResponse<Playbook>> {
    return this.request("/playbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async deletePlaybook(id: string): Promise<{ data: { deleted: boolean; id: string } }> {
    return this.request(`/playbooks/${id}`, { method: "DELETE" });
  }

  async runPlaybook(id: string): Promise<{ data: { executionId: string; playbookId: string; status: string; message: string } }> {
    return this.request(`/playbooks/${id}/run`, { method: "POST" });
  }

  async getPlaybookExecutions(playbookId: string, params?: {
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<PlaybookExecution>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    const query = searchParams.toString();
    return this.request(`/playbooks/${playbookId}/executions${query ? `?${query}` : ""}`);
  }

  async getAllPlaybookExecutions(params?: {
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<PlaybookExecution>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    const query = searchParams.toString();
    return this.request(`/playbooks/executions${query ? `?${query}` : ""}`);
  }

  async getPlaybookExecution(execId: string): Promise<SingleResponse<PlaybookExecution & { steps: PlaybookStepExecution[] }>> {
    return this.request(`/playbooks/executions/${execId}`);
  }

  // Agents
  async getAgents(params?: {
    limit?: number;
    offset?: number;
    agentType?: string;
    status?: string;
  }): Promise<PaginatedResponse<Agent>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.agentType) searchParams.set("agentType", params.agentType);
    if (params?.status) searchParams.set("status", params.status);

    const query = searchParams.toString();
    return this.request(`/agents${query ? `?${query}` : ""}`);
  }

  async getAgent(id: string): Promise<SingleResponse<Agent>> {
    return this.request(`/agents/${id}`);
  }

  async getAgentTypes(): Promise<{ data: AgentType[] }> {
    return this.request("/agents/types");
  }

  async createAgent(data: { name: string; agentType: string; description?: string; config?: Record<string, unknown> }): Promise<SingleResponse<Agent>> {
    return this.request("/agents", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async invokeAgent(id: string, input: Record<string, unknown>, async_exec = true): Promise<SingleResponse<{ runId: string; status: string; message: string }>> {
    return this.request(`/agents/${id}/invoke`, {
      method: "POST",
      body: JSON.stringify({ input, async: async_exec }),
    });
  }

  async stopAgent(id: string): Promise<SingleResponse<Agent>> {
    return this.request(`/agents/${id}/stop`, { method: "POST" });
  }

  // Problem Briefs
  async getBriefs(params?: { limit?: number; offset?: number; issueId?: string }): Promise<PaginatedResponse<ProblemBrief>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.issueId) searchParams.set("issueId", params.issueId);

    const query = searchParams.toString();
    return this.request(`/briefs${query ? `?${query}` : ""}`);
  }

  async getBrief(id: string): Promise<SingleResponse<ProblemBrief>> {
    return this.request(`/briefs/${id}`);
  }

  async getBriefByIssue(issueId: string): Promise<SingleResponse<ProblemBrief>> {
    return this.request(`/briefs/by-issue/${issueId}`);
  }

  // Situation Models
  async getSituations(params?: { limit?: number; offset?: number; problemBriefId?: string }): Promise<PaginatedResponse<SituationModel>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.problemBriefId) searchParams.set("problemBriefId", params.problemBriefId);

    const query = searchParams.toString();
    return this.request(`/situations${query ? `?${query}` : ""}`);
  }

  async getSituation(id: string): Promise<SingleResponse<SituationModel>> {
    return this.request(`/situations/${id}`);
  }

  async getSituationByBrief(briefId: string): Promise<SingleResponse<SituationModel>> {
    return this.request(`/situations/by-brief/${briefId}`);
  }

  // Decisions
  async getDecisions(params?: { limit?: number; offset?: number; solutionId?: string }): Promise<PaginatedResponse<Decision>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.solutionId) searchParams.set("solutionId", params.solutionId);

    const query = searchParams.toString();
    return this.request(`/decisions${query ? `?${query}` : ""}`);
  }

  async getDecision(id: string): Promise<SingleResponse<Decision>> {
    return this.request(`/decisions/${id}`);
  }

  // Artifacts
  async getArtifacts(params?: { limit?: number; offset?: number; solutionId?: string; runId?: string }): Promise<PaginatedResponse<Artifact>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.solutionId) searchParams.set("solutionId", params.solutionId);
    if (params?.runId) searchParams.set("runId", params.runId);

    const query = searchParams.toString();
    return this.request(`/artifacts${query ? `?${query}` : ""}`);
  }

  async getArtifact(id: string): Promise<SingleResponse<Artifact>> {
    return this.request(`/artifacts/${id}`);
  }

  // Verifications
  async getVerifications(params?: {
    limit?: number;
    offset?: number;
    sourceType?: string;
    sourceId?: string;
    status?: string;
  }): Promise<PaginatedResponse<Verification>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.sourceType) searchParams.set("sourceType", params.sourceType);
    if (params?.sourceId) searchParams.set("sourceId", params.sourceId);
    if (params?.status) searchParams.set("status", params.status);

    const query = searchParams.toString();
    return this.request(`/verifications${query ? `?${query}` : ""}`);
  }

  async getVerification(id: string): Promise<SingleResponse<Verification>> {
    return this.request(`/verifications/${id}`);
  }

  async getVerificationsBySource(sourceType: string, sourceId: string): Promise<{ data: Verification[]; meta: { total: number } }> {
    return this.request(`/verifications/by-source/${sourceType}/${sourceId}`);
  }

  async getVerificationSummary(sourceType: string, sourceId: string): Promise<SingleResponse<VerificationSummary>> {
    return this.request(`/verifications/summary/${sourceType}/${sourceId}`);
  }

  async getVerificationsByIssue(issueId: string): Promise<{ data: Verification[]; meta: { total: number; issueId: string; patternCount: number; hasBrief: boolean } }> {
    return this.request(`/verifications/by-issue/${issueId}`);
  }

  // Scheduler
  async getScheduledJobs(params?: {
    limit?: number;
    offset?: number;
    enabled?: boolean;
  }): Promise<PaginatedResponse<ScheduledJob>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.enabled !== undefined) searchParams.set("enabled", params.enabled.toString());

    const query = searchParams.toString();
    return this.request(`/scheduler/jobs${query ? `?${query}` : ""}`);
  }

  async getScheduledJob(id: string): Promise<SingleResponse<ScheduledJob>> {
    return this.request(`/scheduler/jobs/${id}`);
  }

  async createScheduledJob(data: {
    name: string;
    jobType: ScheduledJob["jobType"];
    cronExpression: string;
    enabled?: boolean;
    config?: Record<string, unknown>;
  }): Promise<SingleResponse<ScheduledJob>> {
    return this.request("/scheduler/jobs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async enableJob(id: string): Promise<SingleResponse<ScheduledJob>> {
    return this.request(`/scheduler/jobs/${id}/enable`, { method: "PATCH" });
  }

  async disableJob(id: string): Promise<SingleResponse<ScheduledJob>> {
    return this.request(`/scheduler/jobs/${id}/disable`, { method: "PATCH" });
  }

  async getJobRuns(params?: {
    limit?: number;
    offset?: number;
    jobId?: string;
  }): Promise<PaginatedResponse<JobRun>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.jobId) searchParams.set("jobId", params.jobId);

    const query = searchParams.toString();
    return this.request(`/scheduler/runs${query ? `?${query}` : ""}`);
  }

  async getRecentRuns(): Promise<{ data: JobRun[] }> {
    return this.request("/scheduler/runs/recent");
  }

  async getJobRun(id: string): Promise<SingleResponse<JobRun>> {
    return this.request(`/scheduler/runs/${id}`);
  }

  // Health
  async getHealth(): Promise<{ status: string; timestamp: string; version: string }> {
    return this.request("/health");
  }

  // Source Health
  async getSourceHealthList(params?: {
    limit?: number;
    offset?: number;
    healthStatus?: string;
  }): Promise<PaginatedResponse<SourceHealth>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.healthStatus) searchParams.set("healthStatus", params.healthStatus);

    const query = searchParams.toString();
    return this.request(`/sources/health${query ? `?${query}` : ""}`);
  }

  async getSourceHealth(domain: string): Promise<SingleResponse<SourceHealth>> {
    return this.request(`/sources/health/${encodeURIComponent(domain)}`);
  }

  async getSourceHealthSummary(): Promise<SingleResponse<SourceHealthSummary>> {
    return this.request("/sources/health/summary");
  }

  async getSourceFetchLogs(domain: string, params?: {
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<SourceFetchLog>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    const query = searchParams.toString();
    return this.request(`/sources/health/${encodeURIComponent(domain)}/logs${query ? `?${query}` : ""}`);
  }

  async getDegradedSources(): Promise<{ data: SourceHealth[] }> {
    return this.request("/sources/health/degraded");
  }

  async getSourcesWithAlerts(): Promise<{ data: SourceHealth[] }> {
    return this.request("/sources/health/alerts");
  }

  async initializeSourcesFromPatterns(): Promise<{ data: { domainsFound: number; created: number; existing: number } }> {
    return this.request("/sources/health/initialize-from-patterns", {
      method: "POST",
    });
  }

  // Issue Graph - get all issues for graph view
  async getIssueGraph(): Promise<{ data: Issue[] }> {
    // Fetch all issues for building the relationship graph
    return this.request("/issues?limit=1000");
  }

  // Feedback System
  async getFeedbackStats(): Promise<SingleResponse<FeedbackStats>> {
    return this.request("/feedback/stats");
  }

  async getPendingFeedback(params?: {
    limit?: number;
    offset?: number;
    feedbackType?: string;
  }): Promise<PaginatedResponse<FeedbackEvent>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.feedbackType) searchParams.set("feedbackType", params.feedbackType);

    const query = searchParams.toString();
    return this.request(`/feedback/pending${query ? `?${query}` : ""}`);
  }

  async getRecentAdjustments(params?: {
    limit?: number;
    offset?: number;
    entityType?: string;
    days?: number;
  }): Promise<PaginatedResponse<ConfidenceAdjustment>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.entityType) searchParams.set("entityType", params.entityType);
    if (params?.days) searchParams.set("days", params.days.toString());

    const query = searchParams.toString();
    return this.request(`/feedback/adjustments${query ? `?${query}` : ""}`);
  }

  async getAdjustmentStats(params?: {
    entityType?: string;
    days?: number;
  }): Promise<SingleResponse<AdjustmentStats>> {
    const searchParams = new URLSearchParams();
    if (params?.entityType) searchParams.set("entityType", params.entityType);
    if (params?.days) searchParams.set("days", params.days.toString());

    const query = searchParams.toString();
    return this.request(`/feedback/adjustments/stats${query ? `?${query}` : ""}`);
  }

  async getEntityAdjustments(entityType: string, entityId: string): Promise<PaginatedResponse<ConfidenceAdjustment>> {
    return this.request(`/feedback/adjustments/${entityType}/${entityId}`);
  }

  async getSystemLearnings(params?: {
    limit?: number;
    offset?: number;
    category?: string;
  }): Promise<PaginatedResponse<SystemLearning>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.category) searchParams.set("category", params.category);

    const query = searchParams.toString();
    return this.request(`/feedback/learnings${query ? `?${query}` : ""}`);
  }

  async getLearning(category: string, key: string): Promise<SingleResponse<SystemLearning>> {
    return this.request(`/feedback/learnings/${category}/${encodeURIComponent(key)}`);
  }

  async getEvaluationRuns(params?: {
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<EvaluationRun>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    const query = searchParams.toString();
    return this.request(`/feedback/evaluations${query ? `?${query}` : ""}`);
  }

  async getLatestEvaluation(): Promise<SingleResponse<EvaluationRun>> {
    return this.request("/feedback/evaluations/latest");
  }

  async runFeedbackProcessor(): Promise<SingleResponse<{ eventsProcessed: number; adjustmentsMade: number; learningsUpdated: number; errors: number }>> {
    return this.request("/feedback/process", { method: "POST" });
  }

  async runSystemEvaluation(): Promise<SingleResponse<EvaluationRun>> {
    return this.request("/feedback/evaluate", { method: "POST" });
  }

  async submitManualCorrection(correction: {
    targetEntityType: string;
    targetEntityId: string;
    field: string;
    correctedValue: number;
    reason: string;
  }): Promise<SingleResponse<{ id: string; message: string }>> {
    return this.request("/feedback/corrections", {
      method: "POST",
      body: JSON.stringify(correction),
    });
  }

  // Dashboard Summary
  async getDashboardSummary(): Promise<SingleResponse<DashboardSummary>> {
    return this.request("/dashboard/summary");
  }

  async getMyWork(userId: string): Promise<SingleResponse<MyWork>> {
    const searchParams = new URLSearchParams();
    searchParams.set("userId", userId);
    return this.request(`/dashboard/my-work?${searchParams.toString()}`);
  }

  // Solution Assignment
  async assignSolution(solutionId: string, userId: string): Promise<SingleResponse<Solution>> {
    return this.request(`/solutions/${solutionId}/assign`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  }

  async unassignSolution(solutionId: string): Promise<SingleResponse<Solution>> {
    return this.request(`/solutions/${solutionId}/unassign`, {
      method: "POST",
    });
  }

  async updateSolutionStatus(solutionId: string, status: "proposed" | "approved" | "in_progress" | "completed" | "abandoned"): Promise<SingleResponse<Solution>> {
    return this.request(`/solutions/${solutionId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  // Outcomes
  async getSolutionOutcomes(solutionId: string): Promise<PaginatedResponse<Outcome>> {
    return this.request(`/solutions/${solutionId}/outcomes`);
  }

  async recordOutcome(solutionId: string, data: OutcomeCreateInput): Promise<SingleResponse<Outcome>> {
    return this.request(`/solutions/${solutionId}/outcomes`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getSolutionEffectiveness(solutionId: string): Promise<SingleResponse<SolutionEffectiveness>> {
    return this.request(`/solutions/${solutionId}/effectiveness`);
  }

  // Pipeline Commands
  async getPipelineCommands(): Promise<{ data: PipelineCommand[] }> {
    return this.request("/pipeline/commands");
  }

  async runScout(options?: {
    query?: string;
    domains?: string[];
    url?: string;
    recommended?: boolean;
    dryRun?: boolean;
  }): Promise<{ data: PipelineRunResult }> {
    return this.request("/pipeline/scout", {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    });
  }

  async runVerify(options?: {
    patternIds?: string[];
    limit?: number;
    dryRun?: boolean;
  }): Promise<{ data: PipelineRunResult }> {
    return this.request("/pipeline/verify", {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    });
  }

  async getPipelineRunOutput(runId: string): Promise<{ data: PipelineRunOutput }> {
    return this.request(`/pipeline/runs/${runId}/output`);
  }

  async stopPipelineRun(runId: string): Promise<{ data: { runId: string; status: string; message: string } }> {
    return this.request(`/pipeline/runs/${runId}/stop`, { method: "POST" });
  }

  // Discovery Profiles
  async getDiscoveryProfiles(params?: {
    limit?: number;
    offset?: number;
    isScheduled?: boolean;
    isDefault?: boolean;
    search?: string;
  }): Promise<PaginatedResponse<DiscoveryProfile>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.isScheduled !== undefined) searchParams.set("isScheduled", params.isScheduled.toString());
    if (params?.isDefault !== undefined) searchParams.set("isDefault", params.isDefault.toString());
    if (params?.search) searchParams.set("search", params.search);

    const query = searchParams.toString();
    return this.request(`/discovery/profiles${query ? `?${query}` : ""}`);
  }

  async getDiscoveryProfile(id: string): Promise<SingleResponse<DiscoveryProfile>> {
    return this.request(`/discovery/profiles/${id}`);
  }

  async getDefaultDiscoveryProfile(): Promise<SingleResponse<DiscoveryProfile>> {
    return this.request("/discovery/profiles/default");
  }

  async createDiscoveryProfile(data: CreateDiscoveryProfileInput): Promise<SingleResponse<DiscoveryProfile>> {
    return this.request("/discovery/profiles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateDiscoveryProfile(id: string, data: UpdateDiscoveryProfileInput): Promise<SingleResponse<DiscoveryProfile>> {
    return this.request(`/discovery/profiles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteDiscoveryProfile(id: string): Promise<{ data: { deleted: boolean; id: string } }> {
    return this.request(`/discovery/profiles/${id}`, { method: "DELETE" });
  }

  async runDiscoveryProfile(id: string): Promise<SingleResponse<{ executionId: string; profileId: string; status: string; message: string }>> {
    return this.request(`/discovery/profiles/${id}/run`, { method: "POST" });
  }

  async scheduleDiscoveryProfile(id: string, cronExpression: string, nextRunAt?: string): Promise<SingleResponse<DiscoveryProfile>> {
    return this.request(`/discovery/profiles/${id}/schedule`, {
      method: "POST",
      body: JSON.stringify({ cronExpression, nextRunAt }),
    });
  }

  async unscheduleDiscoveryProfile(id: string): Promise<SingleResponse<DiscoveryProfile>> {
    return this.request(`/discovery/profiles/${id}/schedule`, { method: "DELETE" });
  }

  async setDefaultDiscoveryProfile(id: string): Promise<SingleResponse<DiscoveryProfile>> {
    return this.request(`/discovery/profiles/${id}/set-default`, { method: "POST" });
  }

  async getDiscoveryRuns(params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<DiscoveryRun>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    const query = searchParams.toString();
    return this.request(`/discovery/runs${query ? `?${query}` : ""}`);
  }
}

// Outcome types
export interface Outcome {
  id: string;
  solutionId: string;
  outcomeType: "metric_measurement" | "status_change" | "feedback" | "milestone";
  metricName?: string;
  metricValue?: number;
  metricTarget?: number;
  metricBaseline?: number;
  feedbackText?: string;
  feedbackSentiment?: number; // -1 to 1
  notes?: string;
  recordedAt: string;
  recordedBy: string;
  createdAt: string;
}

export interface OutcomeCreateInput {
  outcomeType: "metric_measurement" | "status_change" | "feedback" | "milestone";
  metricName?: string;
  metricValue?: number;
  metricTarget?: number;
  metricBaseline?: number;
  feedbackText?: string;
  feedbackSentiment?: number;
  notes?: string;
}

export interface SolutionEffectiveness {
  solutionId: string;
  overallEffectivenessScore: number | null;
  metricsAchieved: number;
  metricsPartial: number;
  metricsMissed: number;
  impactVariance: number | null;
  outcomeCount: number;
  latestOutcome?: Outcome;
}

// Pipeline types
export interface PipelineCommand {
  id: string;
  name: string;
  description: string;
  options: Array<{
    name: string;
    type: string;
    description: string;
    default?: unknown;
  }>;
}

export interface PipelineRunResult {
  runId: string;
  command: string;
  status: string;
  message: string;
}

export interface PipelineRunOutput {
  runId: string;
  status: string;
  output: string[];
  lineCount: number;
}

// Managed Source types
export interface ManagedSource {
  id: string;
  domain: string;
  name: string;
  url: string;
  description: string | null;
  status: "active" | "paused" | "removed";
  sourceType: "research" | "news" | "government" | "ngo" | "think_tank" | "industry" | "aggregator" | "preprint" | "other";
  incentiveType: "academic" | "nonprofit" | "commercial" | "government" | "advocacy" | "wire_service" | "aggregator" | "platform" | "independent";
  domains: string[];
  overallCredibility: number;
  factualAccuracy: number;
  methodologicalRigor: number;
  transparencyScore: number;
  independenceScore: number;
  ideologicalTransparency: number;
  fundingTransparency: number;
  conflictDisclosure: number;
  perspectiveDiversity: number;
  geographicNeutrality: number;
  temporalNeutrality: number;
  selectionBiasResistance: number;
  quantificationBias: number;
  debiasedScore: number;
  notes: string | null;
  tags: string[];
  customMetadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  pausedAt: string | null;
  removedAt: string | null;
  lastAssessedAt: string | null;
  assessedBy: string | null;
  assessmentVersion: number;
  autoSyncHealth: boolean;
}

export interface ManagedSourceAssessment {
  factualAccuracy?: number;
  methodologicalRigor?: number;
  transparencyScore?: number;
  independenceScore?: number;
  ideologicalTransparency?: number;
  fundingTransparency?: number;
  conflictDisclosure?: number;
  perspectiveDiversity?: number;
  geographicNeutrality?: number;
  temporalNeutrality?: number;
  selectionBiasResistance?: number;
  quantificationBias?: number;
}

export interface SourceAssessmentHistory {
  id: string;
  sourceId: string;
  assessmentSnapshot: {
    overallCredibility: number;
    factualAccuracy: number;
    methodologicalRigor: number;
    transparencyScore: number;
    independenceScore: number;
    ideologicalTransparency: number;
    fundingTransparency: number;
    conflictDisclosure: number;
    perspectiveDiversity: number;
    geographicNeutrality: number;
    temporalNeutrality: number;
    selectionBiasResistance: number;
    quantificationBias: number;
    debiasedScore: number;
  };
  changedFields: string[];
  changeReason: string | null;
  assessedBy: string | null;
  recordedAt: string;
}

export interface ManagedSourceStats {
  byStatus: {
    active: number;
    paused: number;
    removed: number;
  };
  byDebiasedTier: {
    tier1: number;
    tier2: number;
    tier3: number;
    below: number;
  };
  total: number;
}

export interface CreateManagedSourceInput {
  domain: string;
  name: string;
  url: string;
  description?: string;
  sourceType?: ManagedSource["sourceType"];
  incentiveType?: ManagedSource["incentiveType"];
  domains?: string[];
  tags?: string[];
  notes?: string;
  assessment?: ManagedSourceAssessment;
  assessedBy?: string;
}

// Discovery Profile types
export interface DiscoveryProfile {
  id: string;
  name: string;
  description: string | null;
  sourceIds: string[];
  domains: string[];
  keywords: string[];
  excludeKeywords: string[];
  maxPatterns: number;
  maxIssues: number;
  minSourceCredibility: number | null;
  isScheduled: boolean;
  cronExpression: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDiscoveryProfileInput {
  name: string;
  description?: string;
  sourceIds?: string[];
  domains?: string[];
  keywords?: string[];
  excludeKeywords?: string[];
  maxPatterns?: number;
  maxIssues?: number;
  minSourceCredibility?: number;
  isDefault?: boolean;
}

export interface UpdateDiscoveryProfileInput {
  name?: string;
  description?: string;
  sourceIds?: string[];
  domains?: string[];
  keywords?: string[];
  excludeKeywords?: string[];
  maxPatterns?: number;
  maxIssues?: number;
  minSourceCredibility?: number;
  isDefault?: boolean;
}

export interface DiscoveryRun {
  id: string;
  playbookId: string;
  triggeredBy: string;
  triggerRef: string | null;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string | null;
  context: {
    patternId?: string;
    issueId?: string;
    briefId?: string;
    variables?: Record<string, unknown>;
  };
  currentStep: number;
  totalSteps: number;
  output: Record<string, unknown>;
  error: string | null;
  logs: Array<{
    timestamp: string;
    level: "info" | "warn" | "error";
    message: string;
    stepIndex?: number;
  }>;
}

export const api = new ApiClient();

// Add managed source methods to ApiClient
Object.assign(ApiClient.prototype, {
  // Managed Sources
  async getManagedSourceStats(this: ApiClient): Promise<SingleResponse<ManagedSourceStats>> {
    return (this as unknown as { request: ApiClient["request"] }).request("/sources/managed/stats");
  },

  async getManagedSources(this: ApiClient, params?: {
    limit?: number;
    offset?: number;
    status?: "active" | "paused" | "removed";
    sourceType?: string;
    incentiveType?: string;
    minCredibility?: number;
    minDebiasedScore?: number;
    domain?: string;
    search?: string;
  }): Promise<PaginatedResponse<ManagedSource>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.status) searchParams.set("status", params.status);
    if (params?.sourceType) searchParams.set("sourceType", params.sourceType);
    if (params?.incentiveType) searchParams.set("incentiveType", params.incentiveType);
    if (params?.minCredibility) searchParams.set("minCredibility", params.minCredibility.toString());
    if (params?.minDebiasedScore) searchParams.set("minDebiasedScore", params.minDebiasedScore.toString());
    if (params?.domain) searchParams.set("domain", params.domain);
    if (params?.search) searchParams.set("search", params.search);

    const query = searchParams.toString();
    return (this as unknown as { request: ApiClient["request"] }).request(`/sources/managed${query ? `?${query}` : ""}`);
  },

  async getManagedSourcesByTier(this: ApiClient, tier: 1 | 2 | 3, params?: {
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<ManagedSource>> {
    const searchParams = new URLSearchParams();
    searchParams.set("tier", tier.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    return (this as unknown as { request: ApiClient["request"] }).request(`/sources/managed/by-tier?${searchParams.toString()}`);
  },

  async getManagedSource(this: ApiClient, id: string): Promise<SingleResponse<ManagedSource>> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/sources/managed/${id}`);
  },

  async getManagedSourceByDomain(this: ApiClient, domain: string): Promise<SingleResponse<ManagedSource>> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/sources/managed/by-domain/${encodeURIComponent(domain)}`);
  },

  async createManagedSource(this: ApiClient, data: CreateManagedSourceInput): Promise<SingleResponse<ManagedSource>> {
    return (this as unknown as { request: ApiClient["request"] }).request("/sources/managed", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateManagedSourceAssessment(this: ApiClient, id: string, assessment: ManagedSourceAssessment & {
    assessedBy?: string;
    changeReason?: string;
  }): Promise<SingleResponse<ManagedSource>> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/sources/managed/${id}/assessment`, {
      method: "PATCH",
      body: JSON.stringify(assessment),
    });
  },

  async updateManagedSource(this: ApiClient, id: string, data: {
    name?: string;
    description?: string;
    sourceType?: ManagedSource["sourceType"];
    incentiveType?: ManagedSource["incentiveType"];
    domains?: string[];
    tags?: string[];
    notes?: string;
  }): Promise<SingleResponse<ManagedSource>> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/sources/managed/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async pauseManagedSource(this: ApiClient, id: string): Promise<SingleResponse<ManagedSource>> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/sources/managed/${id}/pause`, {
      method: "POST",
    });
  },

  async resumeManagedSource(this: ApiClient, id: string): Promise<SingleResponse<ManagedSource>> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/sources/managed/${id}/resume`, {
      method: "POST",
    });
  },

  async removeManagedSource(this: ApiClient, id: string): Promise<SingleResponse<ManagedSource>> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/sources/managed/${id}/remove`, {
      method: "POST",
    });
  },

  async restoreManagedSource(this: ApiClient, id: string): Promise<SingleResponse<ManagedSource>> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/sources/managed/${id}/restore`, {
      method: "POST",
    });
  },

  async deleteManagedSource(this: ApiClient, id: string): Promise<{ data: { deleted: boolean; id: string } }> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/sources/managed/${id}`, {
      method: "DELETE",
    });
  },

  async getManagedSourceHistory(this: ApiClient, id: string, params?: {
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<SourceAssessmentHistory>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    const query = searchParams.toString();
    return (this as unknown as { request: ApiClient["request"] }).request(`/sources/managed/${id}/history${query ? `?${query}` : ""}`);
  },

  // Validation (Epistemological) methods
  async getCausalClaims(this: ApiClient, issueId: string): Promise<{ data: CausalClaim[] }> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/validation/issues/${issueId}/causal-claims`);
  },

  async getCausalChains(this: ApiClient, issueId: string): Promise<{ data: CausalChain[] }> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/validation/issues/${issueId}/causal-chains`);
  },

  async getChallenges(this: ApiClient, issueId: string): Promise<{ data: AdversarialChallenge[] }> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/validation/issues/${issueId}/challenges`);
  },

  async getPendingChallenges(this: ApiClient, issueId: string): Promise<{ data: AdversarialChallenge[] }> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/validation/issues/${issueId}/challenges/pending`);
  },

  async resolveChallenge(this: ApiClient, challengeId: string, data: {
    resolution: "resolved" | "partially_resolved" | "unresolved" | "accepted";
    resolutionNotes: string;
    resolutionEvidence?: Array<{ sourceUrl?: string; sourceName?: string; excerpt: string }>;
    confidenceImpact?: number;
    claimModified?: string;
  }): Promise<{ data: AdversarialChallenge }> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/validation/challenges/${challengeId}/resolve`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getChallengeStats(this: ApiClient, issueId: string): Promise<{ data: ChallengeStats }> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/validation/issues/${issueId}/challenges/stats`);
  },

  async getPredictions(this: ApiClient, issueId: string): Promise<{ data: Prediction[] }> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/validation/issues/${issueId}/predictions`);
  },

  async getActivePredictions(this: ApiClient, limit?: number): Promise<{ data: Prediction[] }> {
    const searchParams = new URLSearchParams();
    if (limit) searchParams.set("limit", limit.toString());
    const query = searchParams.toString();
    return (this as unknown as { request: ApiClient["request"] }).request(`/validation/predictions/active${query ? `?${query}` : ""}`);
  },

  async getPredictionsDueSoon(this: ApiClient, days?: number): Promise<{ data: Prediction[] }> {
    const searchParams = new URLSearchParams();
    if (days) searchParams.set("days", days.toString());
    const query = searchParams.toString();
    return (this as unknown as { request: ApiClient["request"] }).request(`/validation/predictions/due-soon${query ? `?${query}` : ""}`);
  },

  async resolvePrediction(this: ApiClient, predictionId: string, data: {
    status: "resolved_correct" | "resolved_incorrect" | "resolved_partial" | "expired" | "withdrawn";
    actualOutcome: string;
    actualValue?: number;
    outcomeSource?: string;
    postMortem?: string;
  }): Promise<{ data: Prediction }> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/validation/predictions/${predictionId}/resolve`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getValidationSummary(this: ApiClient, issueId: string): Promise<{ data: ValidationSummary }> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/validation/issues/${issueId}/summary`);
  },

  async triggerValidation(this: ApiClient, issueId: string): Promise<{ data: { validationScore: number; causalClaimsCount: number; challengesCount: number; predictionsCount: number; adversarialResult: string } }> {
    return (this as unknown as { request: ApiClient["request"] }).request(`/validation/issues/${issueId}/validate`, {
      method: "POST",
    });
  },
});

// =============================================================================
// Validation Types (Epistemological)
// =============================================================================

export interface CausalClaim {
  id: string;
  createdAt: string;
  updatedAt: string;
  issueId: string | null;
  cause: string;
  effect: string;
  mechanism: string | null;
  direction: "forward" | "reverse" | "bidirectional" | "spurious" | "unknown";
  confidence: number;
  evidenceStrength: "experimental" | "quasi_experimental" | "longitudinal" | "cross_sectional" | "case_control" | "observational" | "expert_consensus" | "anecdotal" | "theoretical";
  evidenceSources: Array<{
    sourceUrl: string;
    sourceName: string;
    studyType?: string;
    sampleSize?: number;
    effectSize?: number;
    pValue?: number;
    yearPublished?: number;
    peerReviewed: boolean;
    excerpt: string;
    relevance: "high" | "medium" | "low";
  }>;
  counterfactualStatus: "not_assessed" | "assessed_supported" | "assessed_weakened" | "assessed_refuted";
  counterfactualAnalysis: {
    question: string;
    assessment: string;
    alternativeExplanations: Array<{ explanation: string; plausibility: number; refutation?: string }>;
    confounders: Array<{ variable: string; controlled: boolean; impact: "high" | "medium" | "low" }>;
    assessedAt: string;
    assessedBy: string;
  } | null;
  hillCriteria: {
    strength: { score: number; notes: string };
    consistency: { score: number; notes: string };
    specificity: { score: number; notes: string };
    temporality: { score: number; notes: string };
    gradient: { score: number; notes: string };
    plausibility: { score: number; notes: string };
    coherence: { score: number; notes: string };
    experiment: { score: number; notes: string };
    analogy: { score: number; notes: string };
    overallScore: number;
    assessedAt: string;
  } | null;
  evidenceScore: number | null;
}

export interface CausalChain {
  id: string;
  createdAt: string;
  issueId: string | null;
  name: string;
  description: string | null;
  claimIds: string[];
  weakestLinkId: string | null;
  overallConfidence: number | null;
  hasGaps: boolean;
  gapDescription: string | null;
  isPrimary: boolean;
}

export interface AdversarialChallenge {
  id: string;
  createdAt: string;
  updatedAt: string;
  entityType: string;
  entityId: string;
  challengeType: "framing_challenge" | "evidence_challenge" | "causation_challenge" | "scope_challenge" | "stakeholder_challenge" | "alternative_challenge" | "feasibility_challenge" | "unintended_effects" | "base_rate_challenge" | "selection_bias";
  severity: "critical" | "major" | "moderate" | "minor";
  challengeStatement: string;
  challengeReasoning: string;
  challengeEvidence: Array<{ sourceUrl?: string; sourceName?: string; excerpt: string; relevance: "high" | "medium" | "low" }> | null;
  alternativeProposal: string | null;
  resolution: "pending" | "resolved" | "partially_resolved" | "unresolved" | "accepted";
  resolutionNotes: string | null;
  resolutionEvidence: Array<{ sourceUrl?: string; sourceName?: string; excerpt: string }> | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  confidenceImpact: number | null;
  claimModified: string | null;
  challengedBy: string;
  validationRound: string | null;
}

export interface Prediction {
  id: string;
  createdAt: string;
  updatedAt: string;
  issueId: string | null;
  predictionType: "trend_direction" | "threshold_crossing" | "event_occurrence" | "comparative" | "timing" | "magnitude" | "conditional";
  predictionStatement: string;
  operationalization: {
    metric?: string;
    threshold?: number;
    comparisonValue?: number;
    dataSource?: string;
    measurementMethod: string;
  };
  probability: number;
  confidenceInterval: { lower: number; upper: number; confidence: number } | null;
  reasoning: string;
  keyAssumptions: string[];
  basedOnClaimIds: string[];
  predictionMadeAt: string;
  resolutionDeadline: string;
  status: "active" | "resolved_correct" | "resolved_incorrect" | "resolved_partial" | "expired" | "withdrawn";
  resolvedAt: string | null;
  actualOutcome: string | null;
  actualValue: number | null;
  outcomeSource: string | null;
  brierScore: number | null;
  logScore: number | null;
  postMortem: string | null;
  modelUpdates: Array<{ claimId: string; previousConfidence: number; newConfidence: number; reason: string }> | null;
}

export interface ValidationSummary {
  isValidated: boolean;
  validationScore: number | null;
  causalClaimCount: number;
  challengeCount: number;
  unresolvedChallenges: number;
  predictionCount: number;
  activePredictions: number;
  lastValidatedAt: string | null;
}

export interface ChallengeStats {
  total: number;
  bySeverity: Record<string, number>;
  byResolution: Record<string, number>;
  avgConfidenceImpact: number;
}

// Type augmentation for ApiClient
declare module "@/lib/api" {
  interface ApiClient {
    // Validation methods
    getCausalClaims(issueId: string): Promise<{ data: CausalClaim[] }>;
    getCausalChains(issueId: string): Promise<{ data: CausalChain[] }>;
    getChallenges(issueId: string): Promise<{ data: AdversarialChallenge[] }>;
    getPendingChallenges(issueId: string): Promise<{ data: AdversarialChallenge[] }>;
    resolveChallenge(challengeId: string, data: {
      resolution: "resolved" | "partially_resolved" | "unresolved" | "accepted";
      resolutionNotes: string;
      resolutionEvidence?: Array<{ sourceUrl?: string; sourceName?: string; excerpt: string }>;
      confidenceImpact?: number;
      claimModified?: string;
    }): Promise<{ data: AdversarialChallenge }>;
    getChallengeStats(issueId: string): Promise<{ data: ChallengeStats }>;
    getPredictions(issueId: string): Promise<{ data: Prediction[] }>;
    getActivePredictions(limit?: number): Promise<{ data: Prediction[] }>;
    getPredictionsDueSoon(days?: number): Promise<{ data: Prediction[] }>;
    resolvePrediction(predictionId: string, data: {
      status: "resolved_correct" | "resolved_incorrect" | "resolved_partial" | "expired" | "withdrawn";
      actualOutcome: string;
      actualValue?: number;
      outcomeSource?: string;
      postMortem?: string;
    }): Promise<{ data: Prediction }>;
    getValidationSummary(issueId: string): Promise<{ data: ValidationSummary }>;
    triggerValidation(issueId: string): Promise<{ data: { validationScore: number; causalClaimsCount: number; challengesCount: number; predictionsCount: number; adversarialResult: string } }>;
    getManagedSourceStats(): Promise<SingleResponse<ManagedSourceStats>>;
    getManagedSources(params?: {
      limit?: number;
      offset?: number;
      status?: "active" | "paused" | "removed";
      sourceType?: string;
      incentiveType?: string;
      minCredibility?: number;
      minDebiasedScore?: number;
      domain?: string;
      search?: string;
    }): Promise<PaginatedResponse<ManagedSource>>;
    getManagedSourcesByTier(tier: 1 | 2 | 3, params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<ManagedSource>>;
    getManagedSource(id: string): Promise<SingleResponse<ManagedSource>>;
    getManagedSourceByDomain(domain: string): Promise<SingleResponse<ManagedSource>>;
    createManagedSource(data: CreateManagedSourceInput): Promise<SingleResponse<ManagedSource>>;
    updateManagedSourceAssessment(id: string, assessment: ManagedSourceAssessment & { assessedBy?: string; changeReason?: string }): Promise<SingleResponse<ManagedSource>>;
    updateManagedSource(id: string, data: { name?: string; description?: string; sourceType?: ManagedSource["sourceType"]; incentiveType?: ManagedSource["incentiveType"]; domains?: string[]; tags?: string[]; notes?: string }): Promise<SingleResponse<ManagedSource>>;
    pauseManagedSource(id: string): Promise<SingleResponse<ManagedSource>>;
    resumeManagedSource(id: string): Promise<SingleResponse<ManagedSource>>;
    removeManagedSource(id: string): Promise<SingleResponse<ManagedSource>>;
    restoreManagedSource(id: string): Promise<SingleResponse<ManagedSource>>;
    deleteManagedSource(id: string): Promise<{ data: { deleted: boolean; id: string } }>;
    getManagedSourceHistory(id: string, params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<SourceAssessmentHistory>>;
  }
}
