# Orbit: Architecture Decisions

This document captures the key architectural decisions for Orbit.

For the conceptual overview, see [idea.md](./idea.md).

---

## Context & Constraints

| Constraint | Value |
|------------|-------|
| **Target users** | Individuals taking direct action (not orgs) |
| **Focus** | Systemic issues, not events — build solutions, not advocacy |
| **Scale (v1)** | Single user (dogfooding) |
| **Decentralization** | Medium — federation and verifiability preferred, simplicity wins |
| **Agent model** | All LLM-based agents |
| **Coordination** | Human↔Human, Human↔Agent, Agent↔Agent |
| **Time horizons** | All — months, years, decades; issues interconnect and cascade |
| **Domains** | Agnostic — system identifies high-utility domains dynamically |

### Core Principles

| Principle | Implication |
|-----------|-------------|
| **Build, not advocate** | Output is tools, systems, platforms — not campaigns |
| **Domain-agnostic** | System identifies high-utility domains dynamically |
| **Cross-domain** | Issues connect across domains; solutions may span multiple |
| **All time horizons** | Months, years, decades — cascading effects matter |
| **Issue graph** | Issues are nodes; effects propagate through connections |

---

## Decision 1: Shared State Architecture

**Choice: Centralized DB with content-addressed records + cryptographic signatures**

### Rationale

- Simplicity for v1 (single Postgres instance)
- Verifiable without being trustless (hashes + signatures)
- Federation-ready without building federation now
- Trust layer handles content validation separately

### Data Structure

Each record includes:

```
Record {
  id: "...",
  content_hash: "sha256:...",           // hash of canonical payload
  parent_hash: "sha256:...",            // previous version (forms hash chain)
  author: "actor_xyz",
  author_signature: "sig:...",          // cryptographic signature
  created_at: "2026-01-20T12:00:00Z",
  payload: { ... }                      // Issue, SituationModel, etc.
}
```

### Properties

| Property | Implementation |
|----------|----------------|
| Verifiability | Recompute hashes, verify signatures |
| Tamper-evident history | Hash chain — can't modify past without breaking chain |
| Fast reads | Normal DB queries with indexes |
| Historical analysis | Walk the hash chain |
| Federation path | Other nodes can replicate and verify independently |

### Actor Identity

- Each actor has an Ed25519 keypair
- Public key = identity (or derives readable ID)
- Private key signs all contributions

---

## Decision 2: Agent Runtime

**Choice: Trigger-based serverless with lifecycle management**

### Rationale

- Trigger-based is cost-efficient (not always-on)
- Lifecycle management prevents runaway agents
- Containerized executor is simple, avoids vendor lock-in
- Capacity can grow incrementally (minutes → days → months)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Trigger Sources                                            │
│  - Cron schedules ("every 6 hours")                        │
│  - Events (new Issue, threshold crossed)                   │
│  - Manual invocation                                        │
│  - Parent agent spawning child                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Scheduler / Event Router                                   │
│  - Evaluates triggers                                       │
│  - Checks rate limits                                       │
│  - Queues agent invocations                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Agent Executor (containerized)                             │
│  - Spins up agent on trigger                               │
│  - Runs to completion or timeout                           │
│  - Writes results to shared state                          │
│  - Can register new triggers (spawn children)              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Lifecycle Manager                                          │
│  - Tracks agent registrations                              │
│  - Enforces limits                                         │
│  - Evaluates stop conditions                               │
│  - Garbage collects expired/orphaned agents                │
└─────────────────────────────────────────────────────────────┘
```

### Agent Registration

```
AgentRegistration {
  id: "agent_abc",
  owner: "actor_xyz",
  parent_id: "agent_parent",      // null if user-created

  triggers: [
    { type: "cron", schedule: "0 */6 * * *" },
    { type: "event", filter: "Issue.score.urgency > 0.8" }
  ],

  // Lifecycle
  created_at: "...",
  expires_at: "...",              // max lifetime
  max_invocations: 100,
  invocation_count: 12,

  // Stop conditions
  stop_conditions: [
    { type: "goal_achieved", check: "Issue.status == 'resolved'" },
    { type: "manual" }
  ],

  // Resource limits
  max_children: 5,
  children: ["agent_child1", "agent_child2"],

  agent_type: "Monitor",
  config: { ... }
}
```

### Limits & Guardrails

| Limit | Purpose | Default |
|-------|---------|---------|
| Max agents per user | Prevent runaway | 20 |
| Max children per agent | Limit spawn depth | 5 |
| Max invocations | Prevent infinite loops | 1000 |
| Max lifetime | Garbage collection | 30 days |
| Invocation timeout | Bound compute | 5 min |
| Spawn rate limit | Throttle spawning | 10/hour |

### Stop Conditions

Agents stop when:
1. `expires_at` reached
2. `max_invocations` hit
3. Goal condition evaluates true
4. Manual kill by owner or platform
5. Orphaned (parent stopped, no reason to continue)
6. Resource violation

### Capacity Progression

| Phase | Persistence | Implementation |
|-------|-------------|----------------|
| v1 | Minutes-hours | Single executor, simple queue, short timeouts |
| v2 | Days-weeks | Durable trigger storage, longer expiry |
| v3 | Months+ | Distributed executors, robust scheduler |

### Cost Model

| Phase | Model |
|-------|-------|
| v1 | Platform absorbs |
| v2 | Soft metering (track, show usage) |
| v3 | Credits / metered billing |

---

## Decision 3: Trust & Reputation

**Choice: Verified identity + verification agent network (platform-operated + ensemble)**

### Rationale

- Verified identity reduces Sybil risk
- Verification agents (AI) can scale better than manual review
- Ensemble agreement prevents single-point manipulation
- Hybrid signals provide defense in depth
- Difficulty weighting prevents reputation farming

### Threat Model (v1 focus)

| Threat | Mitigation |
|--------|------------|
| Poisoning | SourceValidator, ConsistencyChecker agents |
| Manipulation | PatternDetector agent, ensemble agreement |
| Reputation farming | DifficultyAssessor, weighted trust gains |

### Identity Model

```
Actor {
  id: "actor_xyz",
  public_key: "ed25519:...",

  verification: {
    method: "email+sms",
    verified_at: "2026-01-15",
    uniqueness_confidence: 0.95
  },

  trust_score: 0.72,              // global
  trust_updated_at: "...",

  contribution_stats: {
    total_contributions: 48,
    by_difficulty: { low: 30, medium: 15, high: 3 },
    by_type: { issue: 12, situation_model: 20, playbook: 5, intervention: 11 },
    challenges_received: 8,
    challenges_upheld: 2
  }
}
```

### Verification Agent Network

| Agent | Checks | Protects Against |
|-------|--------|------------------|
| **SourceValidator** | Cross-references claims against external sources | Poisoning |
| **ConsistencyChecker** | Detects contradictions within shared state | Poisoning, manipulation |
| **PatternDetector** | Identifies gaming patterns, coordinated behavior | Manipulation |
| **DifficultyAssessor** | Evaluates actual difficulty/stakes of contributions | Reputation farming |
| **BehaviorAuditor** | Reviews agent behavior against stated policy | Runaway agents |

### Verification Flow

```
Contribution → Verification Queue → Verification Agents (parallel)
                                            │
                                            ▼
                                    Verdict Aggregator
                                            │
                                            ▼
                                    Trust Updater
                                            │
                                    ┌───────┴───────┐
                                    ▼               ▼
                            Update contribution   Update actor
                                 status          trust score
```

### Verdict Structure

```
Verdict {
  contribution_id: "...",

  agent_verdicts: [
    { agent: "SourceValidator", verdict: "pass", confidence: 0.85, evidence: [...] },
    { agent: "ConsistencyChecker", verdict: "pass", confidence: 0.92, evidence: [...] },
    { agent: "PatternDetector", verdict: "flag", confidence: 0.65, evidence: [...] }
  ],

  aggregated: {
    verdict: "accepted_with_flag",   // accepted | flagged | rejected
    confidence: 0.78,
    flags: ["potential_manipulation"]
  },

  trust_impact: {
    actor: "actor_xyz",
    delta: -0.02,
    new_score: 0.70
  }
}
```

### Trust Score Computation

| Signal | Weight |
|--------|--------|
| Verification agent verdicts | 50% |
| Outcome tracking | 25% |
| Peer attestation | 15% |
| Contribution difficulty | 10% |

### Anti-Reputation-Farming

```
effective_trust_gain = base_gain × difficulty_multiplier

difficulty_multiplier:
  low_stakes:    0.2
  medium_stakes: 1.0
  high_stakes:   2.0
```

### Verification Agent Governance (v1)

- **Platform-operated** core verifiers (trusted by default)
- **Ensemble agreement** required for high-stakes verdicts (2+ agents must agree)

---

## Decision 4: Harness & Execution Sandboxing

**Choice: Sandboxed containers + capability-gated + layered approval + full trace logging**

### Rationale

- Sandbox by default limits blast radius
- Capability model allows controlled escape hatches
- Layered approval balances automation with safety
- Full traces enable debugging, trust, and replay
- Irreversible actions escalate (not block) for flexibility

### Sandbox Environment

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Container                                            │
│                                                             │
│  - Isolated (no host access)                               │
│  - No network by default                                   │
│  - Limited filesystem (temp workspace only)                │
│  - Resource caps (CPU, memory, time)                       │
│  - Capability request API                                  │
└─────────────────────────────────────────────────────────────┘
```

### Capability Model

| Capability | Risk | Default |
|------------|------|---------|
| `fs:temp` | Low | Granted |
| `fs:workspace` | Low | Granted |
| `network:internal` | Low | Granted |
| `network:external` | Medium | Request |
| `tool:notify` | Low | Granted |
| `tool:email` | Medium | Request |
| `tool:deploy` | High | Request |
| `tool:payment` | High | Request + human |

### Layered Approval Chain

```
Action Request
      │
      ▼
┌─────────────────────────────────────┐
│  1. Trust Gate                      │
│     trust < 0.3  → L0 only          │
│     trust 0.3-0.6 → L1 max          │
│     trust 0.6-0.8 → L2 max          │
│     trust > 0.8  → L3 eligible      │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│  2. Policy Engine                   │
│     - Evaluate against rules        │
│     - Auto-approve if within policy │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│  3. Human Approval (if required)    │
│     - Queue for actor review        │
│     - Approve / Reject / Modify     │
└──────────────────┬──────────────────┘
                   │
                   ▼
        Execute + Log
```

### Autonomy Levels

| Level | Capability | Trust Required |
|-------|------------|----------------|
| L0 | Recommend only | Any |
| L1 | Draft materials | ≥ 0.3 |
| L2 | Execute low-risk (notify, dashboard) | ≥ 0.6 |
| L3 | Execute bounded ops with approval | ≥ 0.8 |

### Irreversible Action Handling

| Reversibility | Approval Escalation |
|---------------|---------------------|
| Fully reversible | Standard policy |
| Partially reversible | +1 approval level |
| Irreversible | Require human + confirmation |

### Full Trace Logging

```
ExecutionTrace {
  id: "exec_789",
  agent_id: "agent_abc",
  actor_id: "actor_xyz",
  triggered_by: { type: "event", event_id: "..." },
  started_at: "...",

  llm_calls: [
    {
      call_id: 1,
      prompt_hash: "sha256:...",
      response_hash: "sha256:...",
      model: "claude-sonnet",
      tokens: { input: 1200, output: 450 },
      latency_ms: 1823
    }
  ],

  decisions: [
    {
      step: 1,
      reasoning: "...",
      action_considered: ["search", "escalate"],
      action_chosen: "search",
      confidence: 0.89
    }
  ],

  tool_calls: [
    {
      tool: "shared_state.query",
      input: { ... },
      output_hash: "sha256:...",
      latency_ms: 45,
      capability_used: "network:internal"
    }
  ],

  completed_at: "...",
  status: "success",
  artifacts: ["report_456"],
  state_changes: ["issue_123.status → in_progress"]
}
```

### Storage Strategy

| Data | Storage | Retention |
|------|---------|-----------|
| Trace metadata | Primary DB | Indefinite |
| Full prompts/responses | Object storage | 90 days hot, then archive |
| Hashes | Primary DB | Indefinite |

---

## v1 Scope

### What v1 Demonstrates

1. **End-to-end loop**: Issue identified → understood → solution designed → (partially) built
2. **Systemic framing**: Root causes, cross-domain connections, leverage points
3. **AI augmentation**: One person doing work that would normally require a team
4. **Auditable**: Full traces, hash chains, reproducible

### Pipeline (Full, Shallow)

| Stage | v1 Implementation |
|-------|-------------------|
| **Sense** | Manual input + 1-2 automated sources (research feeds, policy trackers) |
| **Triage** | IUTLN scoring, basic cross-domain tagging |
| **Frame** | ProblemBrief with system lens (root causes, leverage points) |
| **Investigate** | LLM-powered research, source gathering, claims graph |
| **Generate** | Solution options focused on "what to build" |
| **Decide** | Manual selection (just you), policy engine for execution |
| **Execute** | Limited tools: research, drafts, simple deployments |
| **Monitor** | Manual outcome logging, basic metrics |

### Agents (v1)

| Agent | v1 Scope |
|-------|----------|
| **Scout** | Ingest from manual + 1-2 feeds, cluster into patterns |
| **Triage** | IUTLN scoring, domain tagging, connection detection |
| **Analyst** | Build SituationModel, map root causes, claims graph |
| **Planner** | Generate "what to build" options, scope solutions |
| **Operator** | Execute limited tools (research, draft, simple deploy) |
| **Critic** | Defer to v2 |
| **Safety/Policy** | Basic guardrails, manual approval above L1 |
| **Verification** | Basic SourceValidator only |

### Tools (v1)

| Tool | Included | Notes |
|------|----------|-------|
| Shared state read/write | Yes | Core |
| Research/web fetch | Yes | For investigation |
| Document generation | Yes | Reports, specs, drafts |
| Code generation | Yes | For building solutions |
| Local deploy (scripts, tools) | Yes | Low risk |
| Notifications | Yes | Internal alerts |
| External APIs | Limited | Case-by-case |
| Cloud deploy | No | v2 |
| Payment | No | v2 |

### What v1 Defers

- Multi-user coordination
- Agent-to-agent coordination (beyond single user's agents)
- Full verification agent suite
- Critic agent
- Cloud deployments
- Long-running persistent agents (months+)
- Federation

---

## Data Schema

### Core Objects Overview

```
Pattern → Issue → ProblemBrief → SituationModel → Solution → Decision → RunLog
                                                      ↓
                                                  Artifact
```

Plus supporting objects: **Actor**, **Agent**, **Playbook**, **Verdict**

### Base Record Structure

All objects inherit this:

```typescript
interface BaseRecord {
  id: string;                    // unique identifier
  content_hash: string;          // SHA256 of canonical payload
  parent_hash: string | null;    // previous version (hash chain)
  author: string;                // actor_id or agent_id
  author_signature: string;      // cryptographic signature
  created_at: string;            // ISO timestamp
  version: number;
  status: "draft" | "active" | "superseded" | "archived";
}
```

### Pattern

Systemic signals detected from sources — persistent patterns, not one-off events.

```typescript
interface Pattern extends BaseRecord {
  type: "Pattern";

  // What
  title: string;
  description: string;
  pattern_type: "policy_gap" | "structural_inefficiency" | "feedback_loop" |
                "information_asymmetry" | "coordination_failure" | "other";

  // Where
  domains: string[];             // ["climate", "economics", "governance"]
  geographies: string[];         // ["global", "US", "EU"]

  // Evidence
  sources: Array<{
    url: string;
    title: string;
    retrieved_at: string;
    reliability: number;         // 0-1
    quote_spans: string[];
  }>;

  // Time
  first_observed: string;
  observation_frequency: "one_time" | "recurring" | "continuous";

  // Clustering
  cluster_id: string | null;
  confidence: number;            // 0-1
}
```

### Issue

A triaged, prioritized systemic issue worth attention.

```typescript
interface Issue extends BaseRecord {
  type: "Issue";

  // Identity
  title: string;
  summary: string;

  // Source
  pattern_ids: string[];

  // Systemic framing
  root_causes: string[];
  affected_domains: string[];
  leverage_points: string[];

  // IUTLN scoring
  scores: {
    impact: number;              // 0-1
    urgency: number;             // 0-1
    tractability: number;        // 0-1
    legitimacy: number;          // 0-1
    neglectedness: number;       // 0-1
  };
  composite_score: number;

  // Issue graph
  upstream_issues: string[];     // issue_ids that cause this
  downstream_issues: string[];   // issue_ids this causes
  related_issues: string[];      // non-causal relationships

  // Time dimension
  time_horizon: "months" | "years" | "decades";
  propagation_velocity: "fast" | "medium" | "slow";

  // State
  issue_status: "identified" | "investigating" | "solution_proposed" |
                "in_progress" | "resolved" | "wont_fix";
}
```

### ProblemBrief

Structured problem definition for agents to work on.

```typescript
interface ProblemBrief extends BaseRecord {
  type: "ProblemBrief";

  issue_id: string;

  goals: Array<{
    description: string;
    success_criteria: string;
    priority: "must" | "should" | "could";
  }>;

  constraints: Array<{
    type: "legal" | "ethical" | "technical" | "resource" | "time" | "other";
    description: string;
    hard: boolean;
  }>;

  uncertainties: Array<{
    question: string;
    impact_if_wrong: "low" | "medium" | "high";
    resolved: boolean;
    resolution: string | null;
  }>;

  action_space: {
    allowed: string[];
    forbidden: string[];
    requires_approval: string[];
  };

  required_evidence: Array<{
    description: string;
    gathered: boolean;
    source: string | null;
  }>;
}
```

### SituationModel

Evidence and understanding gathered during investigation.

```typescript
interface SituationModel extends BaseRecord {
  type: "SituationModel";

  problem_brief_id: string;

  claims: Array<{
    id: string;
    statement: string;
    sources: string[];
    confidence: number;
    contradicted_by: string[];
    supports: string[];
    claim_type: "fact" | "causal" | "prediction" | "opinion";
  }>;

  evidence: Array<{
    id: string;
    type: "document" | "data" | "testimony" | "analysis";
    source: string;
    summary: string;
    supports_claims: string[];
    reliability: number;
  }>;

  system_map: {
    actors: Array<{
      id: string;
      name: string;
      role: string;
      interests: string[];
      influence: number;
    }>;
    relationships: Array<{
      from: string;
      to: string;
      type: "influences" | "opposes" | "depends_on" | "funds" | "regulates";
    }>;
    feedback_loops: Array<{
      description: string;
      reinforcing: boolean;
      nodes: string[];
    }>;
  };

  uncertainty_map: Array<{
    area: string;
    level: "low" | "medium" | "high";
    reducible: boolean;
    how_to_reduce: string | null;
  }>;

  key_insights: string[];
  recommended_leverage_points: string[];
}
```

### Solution

A proposed solution — something to build.

```typescript
interface Solution extends BaseRecord {
  type: "Solution";

  situation_model_id: string;

  title: string;
  summary: string;
  solution_type: "tool" | "platform" | "system" | "automation" |
                 "research" | "model" | "other";

  mechanism: string;

  components: Array<{
    name: string;
    description: string;
    complexity: "low" | "medium" | "high";
  }>;

  preconditions: Array<{
    description: string;
    met: boolean;
  }>;

  risks: Array<{
    description: string;
    likelihood: "low" | "medium" | "high";
    impact: "low" | "medium" | "high";
    mitigation: string | null;
  }>;

  metrics: Array<{
    name: string;
    description: string;
    target: string;
    measurement_method: string;
  }>;

  execution_plan: Array<{
    step: number;
    description: string;
    owner: "human" | "agent";
    tools_required: string[];
    estimated_complexity: "low" | "medium" | "high";
    dependencies: number[];
  }>;

  artifacts: string[];
  addresses_issues: string[];

  solution_status: "proposed" | "approved" | "in_progress" |
                   "completed" | "abandoned";
}
```

### Decision

Record of choosing to act on a solution.

```typescript
interface Decision extends BaseRecord {
  type: "Decision";

  solution_id: string;

  decision: "approve" | "reject" | "defer" | "modify";
  rationale: string;
  modifications: string | null;

  autonomy_level: "L0" | "L1" | "L2" | "L3";

  approvals: Array<{
    actor_id: string;
    approved_at: string;
    scope: string;
  }>;

  guardrails: Array<{
    type: "budget" | "time" | "scope" | "reversibility";
    limit: string;
    enforcement: "hard" | "soft";
  }>;

  run_id: string | null;
}
```

### Artifact

Outputs produced by solutions.

```typescript
interface Artifact extends BaseRecord {
  type: "Artifact";

  solution_id: string;
  run_id: string;

  title: string;
  artifact_type: "document" | "code" | "tool" | "dataset" |
                 "analysis" | "deployment" | "other";

  content_ref: {
    storage: "inline" | "object_store" | "git" | "external";
    location: string;
    content_hash: string;
  };

  format: string;
  size_bytes: number;
  derived_from: string[];

  artifact_status: "draft" | "final" | "superseded";
}
```

### RunLog

Execution trace.

```typescript
interface RunLog extends BaseRecord {
  type: "RunLog";

  decision_id: string;
  agent_id: string;

  triggered_by: {
    type: "manual" | "cron" | "event" | "parent_agent";
    ref: string;
  };

  started_at: string;
  completed_at: string | null;

  llm_calls: Array<{
    call_id: number;
    prompt_hash: string;
    response_hash: string;
    model: string;
    tokens: { input: number; output: number };
    latency_ms: number;
  }>;

  decisions: Array<{
    step: number;
    reasoning: string;
    action_chosen: string;
    confidence: number;
  }>;

  tool_calls: Array<{
    tool: string;
    input_hash: string;
    output_hash: string;
    capability_used: string;
    approval: { gate: string; result: string };
    latency_ms: number;
  }>;

  status: "running" | "success" | "failed" | "timeout" | "cancelled";
  error: string | null;
  artifacts: string[];
  state_changes: string[];
}
```

### Playbook

Reusable templates for addressing issue types.

```typescript
interface Playbook extends BaseRecord {
  type: "Playbook";

  name: string;
  description: string;

  applicable_to: {
    pattern_types: string[];
    domains: string[];
    issue_characteristics: Record<string, unknown>;
  };

  problem_brief_template: Partial<ProblemBrief>;
  investigation_steps: string[];

  solution_patterns: Array<{
    name: string;
    description: string;
    template: Partial<Solution>;
  }>;

  times_used: number;
  success_rate: number | null;
  avg_time_to_resolution: number | null;

  forked_from: string | null;

  playbook_status: "draft" | "active" | "deprecated";
}
```

---

## Tech Stack

| Component | Choice | Notes |
|-----------|--------|-------|
| **Database** | PostgreSQL | JSON support, reliable, scales |
| **Job Queue** | Postgres-backed | `SKIP LOCKED` pattern, no extra infra |
| **Container Runtime** | Subprocess (v1) → Docker (v1.1) | Add isolation when needed |
| **Object Storage** | Local filesystem (v1) → S3-compatible (v1.1) | Start simple |
| **LLM Providers** | Anthropic, OpenAI, Groq | Multi-provider, route by task |
| **Backend** | TypeScript (Bun or Node) | Fast iteration, good ecosystem |
| **Interface** | Web dashboard | Visibility, approvals, exploration |

### Multi-LLM Strategy

| Use Case | Provider | Model | Rationale |
|----------|----------|-------|-----------|
| **Complex reasoning** | Anthropic | Claude Sonnet/Opus | Best agentic performance |
| **Code generation** | Anthropic / OpenAI | Claude / GPT-4 | Both strong |
| **Fast/cheap tasks** | Groq | Llama 3 / Mixtral | Speed, cost efficiency |
| **Embeddings** | OpenAI | text-embedding-3 | Standard, good quality |
| **Fallback** | Any | - | Redundancy if one provider down |

### LLM Abstraction Layer

```typescript
interface LLMProvider {
  id: string;
  chat(messages: Message[], options?: LLMOptions): Promise<Response>;
  embed(text: string): Promise<number[]>;
}

interface LLMRouter {
  route(task: TaskType): LLMProvider;
}

const routingConfig = {
  reasoning: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  code: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  fast: { provider: "groq", model: "llama-3.3-70b-versatile" },
  embed: { provider: "openai", model: "text-embedding-3-small" }
};
```

### Dashboard Tech

| Layer | Choice |
|-------|--------|
| **Framework** | Next.js or SvelteKit |
| **Styling** | Tailwind |
| **Components** | shadcn/ui or similar |
| **State** | React Query / SWR or Svelte stores |
| **Charts** | Recharts or D3 |

### Project Structure

```
orbit/
├── packages/
│   ├── core/                 # Domain types, schemas
│   ├── db/                   # Database layer
│   ├── llm/                  # LLM abstraction
│   ├── agents/               # Agent implementations
│   │   ├── scout/
│   │   ├── triage/
│   │   ├── analyst/
│   │   ├── planner/
│   │   ├── operator/
│   │   ├── safety/
│   │   └── verification/
│   ├── harness/              # Execution environment
│   ├── runtime/              # Scheduler, lifecycle
│   └── api/                  # HTTP API
├── apps/
│   └── dashboard/            # Web UI
├── tools/                    # Scripts, CLI utilities
└── docs/                     # Documentation
```

### Dev Environment

| Tool | Purpose |
|------|---------|
| **Bun** | Runtime, package manager, bundler |
| **Docker Compose** | Local Postgres |
| **Turborepo or Nx** | Monorepo orchestration |
| **Biome or ESLint+Prettier** | Linting, formatting |
| **Vitest** | Testing |

---

## API Design

### Design Principles

| Principle | Implication |
|-----------|-------------|
| **Unified API** | Same API for dashboard, CLI, and agents |
| **Event-driven internally** | Actions emit events, triggers listen |
| **REST for CRUD** | Standard operations on entities |
| **WebSocket for real-time** | Live updates to dashboard |
| **Typed end-to-end** | Shared types between backend and frontend |

### API Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard / CLI / External                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP REST + WebSocket
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  API Layer (packages/api)                                   │
│  - Authentication                                           │
│  - Request validation                                       │
│  - Route handlers                                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │   DB     │ │ Runtime  │ │ Harness  │
    │ (repos)  │ │ (agents) │ │ (tools)  │
    └──────────┘ └──────────┘ └──────────┘
```

### REST Endpoints

#### Patterns
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/patterns` | List patterns |
| `GET` | `/patterns/:id` | Get pattern |
| `POST` | `/patterns` | Create pattern |
| `GET` | `/patterns/:id/history` | Version history |

#### Issues
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/issues` | List issues (sortable by IUTLN) |
| `GET` | `/issues/:id` | Get issue with graph |
| `POST` | `/issues` | Create issue |
| `PATCH` | `/issues/:id` | Update issue |
| `GET` | `/issues/:id/graph` | Connected issues |

#### Problem Briefs
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/issues/:id/brief` | Get brief for issue |
| `POST` | `/issues/:id/brief` | Create/update brief |

#### Situation Models
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/briefs/:id/situation` | Get situation model |
| `POST` | `/briefs/:id/situation` | Create/update |
| `GET` | `/situations/:id/claims` | Claims graph |
| `GET` | `/situations/:id/system-map` | System map |

#### Solutions
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/situations/:id/solutions` | List solutions |
| `POST` | `/situations/:id/solutions` | Create solution |
| `GET` | `/solutions/:id` | Get solution |
| `POST` | `/solutions/:id/approve` | Approve solution |

#### Runs & Artifacts
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/runs` | List runs |
| `GET` | `/runs/:id` | Get run with trace |
| `GET` | `/artifacts` | List artifacts |
| `GET` | `/artifacts/:id/content` | Download artifact |

#### Agents
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agents` | List agents |
| `POST` | `/agents` | Register agent |
| `POST` | `/agents/:id/invoke` | Invoke agent |
| `POST` | `/agents/:id/stop` | Stop agent |

#### Playbooks
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/playbooks` | List playbooks |
| `POST` | `/playbooks` | Create playbook |
| `POST` | `/playbooks/:id/fork` | Fork playbook |

### WebSocket Events

#### Client → Server
```typescript
{ type: "subscribe", channel: "issues" }
{ type: "subscribe", channel: "run", id: "run_456" }
{ type: "unsubscribe", channel: "issues" }
```

#### Server → Client
```typescript
{ type: "issue.created", data: Issue }
{ type: "issue.updated", data: Issue }
{ type: "run.started", data: { run_id, agent_id } }
{ type: "run.step", data: { run_id, step, reasoning } }
{ type: "run.completed", data: { run_id, status, artifacts } }
{ type: "approval.requested", data: { run_id, action, context } }
```

### Internal Event Bus

```typescript
type InternalEvent =
  | { type: "pattern.detected", data: Pattern }
  | { type: "issue.scored", data: Issue }
  | { type: "brief.created", data: ProblemBrief }
  | { type: "investigation.complete", data: SituationModel }
  | { type: "solutions.generated", data: Solution[] }
  | { type: "decision.made", data: Decision }
  | { type: "run.completed", data: RunLog }
  | { type: "artifact.created", data: Artifact };
```

### Authentication (v1)

| Approach | Description |
|----------|-------------|
| **Local only** | API only on localhost, no auth |
| **API key** | Simple bearer token for remote access |

### Type-Safe Client

```typescript
class OrbitClient {
  constructor(private baseUrl: string, private apiKey?: string) {}

  async listIssues(params?: ListParams): Promise<ApiResponse<Issue[]>>;
  async getIssue(id: string): Promise<ApiResponse<Issue>>;
  async approveSolution(id: string): Promise<ApiResponse<Decision>>;
  async invokeAgent(id: string): Promise<ApiResponse<RunLog>>;

  subscribe(channel: string, callback: (event: WsEvent) => void): () => void;
}
```

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Orbit Platform                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Trust Layer                                                         │   │
│  │  - Identity verification                                            │   │
│  │  - Verification agents (SourceValidator, ConsistencyChecker, etc.) │   │
│  │  - Trust score computation                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Shared State (PostgreSQL)                                          │   │
│  │  - Content-addressed records + signatures                           │   │
│  │  - Hash chains for history                                          │   │
│  │  - Patterns, Issues, SituationModels, Solutions, Playbooks, RunLogs│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Agent Runtime                                                       │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │   Scheduler  │  │   Executor   │  │  Lifecycle   │              │   │
│  │  │   / Router   │──│  (Container) │──│   Manager    │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Harness                                                             │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │   │
│  │  │ Sandbox  │  │Capability│  │ Approval │  │  Tool    │           │   │
│  │  │          │──│ Gateway  │──│  Chain   │──│ Adapters │           │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │   │
│  │                       │                                             │   │
│  │                ┌──────────────┐                                     │   │
│  │                │ Full Trace   │                                     │   │
│  │                │ Logger       │                                     │   │
│  │                └──────────────┘                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Eval System                                                         │   │
│  │  - Offline / Shadow / Online layers                                 │   │
│  │  - Incidents → new evals                                            │   │
│  │  - Playbook effectiveness tracking                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  API Layer                                                           │   │
│  │  - REST endpoints                                                   │   │
│  │  - WebSocket for real-time                                          │   │
│  │  - Type-safe client                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Dashboard                                                           │   │
│  │  - Issue explorer + graph visualization                             │   │
│  │  - Solution management                                              │   │
│  │  - Run monitoring + traces                                          │   │
│  │  - Approval queue                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Initialize project** — Set up monorepo, packages, basic tooling
2. **Core types** — Implement `@orbit/core` with Zod schemas
3. **Database layer** — Postgres setup, migrations, repositories
4. **Basic API** — CRUD endpoints for core objects
5. **First agent** — Scout or Analyst as proof of concept
6. **Dashboard skeleton** — Basic UI to view/create issues
