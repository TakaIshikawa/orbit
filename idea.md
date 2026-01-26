# Orbit: Global Issue → AI Agents → Solutions Pipeline

A practical blueprint for an action-oriented system. The core idea: treat the world as a stream of signals, turn them into decision-ready problem objects, then run bounded, auditable agent workflows that propose + (when allowed) execute interventions, continuously improved by evals.

## Overview

1. Define the end-to-end stages (signal → action → learning)
2. Specify the data model + agent roles
3. Show how the harness (execution environment) + evals glue it together
4. List the minimal "first build" and the hard parts

---

## 1. End-to-End Pipeline

### A. Sense

**Goal:** Capture early + trustworthy signals without drowning.

**Inputs:**
- News, government releases, NGO reports
- Company filings, research preprints
- Satellite/IoT summaries
- Social platforms, crisis feeds

**Processing:**
- Normalize (language, timestamps, locations, entities)
- De-duplicate + cluster into "event candidates"
- Provenance (source, reliability priors, quote spans)

**Output:**
```
EventCandidate {
  who, what, where, when,
  sources[],
  confidence
}
```

### B. Triage

**Goal:** Decide what is worth attention and what kind of action is possible.

**Scoring dimensions (MECE):**
| Dimension | Description |
|-----------|-------------|
| Impact | Expected harm/benefit magnitude |
| Urgency | Time-to-irreversibility |
| Tractability | Can any actor realistically change it? |
| Neglectedness | Few capable responders |
| Legitimacy | Is action appropriate/authorized? |

**Output:**
```
Issue {
  event_cluster_id,
  score_vector,
  actionability_tags,
  stakeholders
}
```

### C. Frame the Problem

**Goal:** Convert messy reality into a structured object agents can operate on.

**Add:**
- Constraints (legal, ethical, budget, time, jurisdictions)
- Hypotheses (what's true/false; what would change decisions)
- Required evidence checklist
- Action space (allowed interventions)

**Output:**
```
ProblemBrief {
  goals,
  constraints,
  uncertainties,
  action_space,
  required_evidence
}
```

### D. Investigate

**Goal:** Reduce uncertainty to the point where decisions are defensible.

**Methods:**
- Source triangulation, contradiction finding
- Claims graph (a "who claims what" map)
- Uncertainty estimates (intervals, confidence buckets)

**Output:**
```
SituationModel {
  claims[],
  evidence[],
  contradictions[],
  uncertainty_map
}
```

### E. Generate Interventions

**Goal:** Propose options, not one brittle plan.

**Produce 3–7 options with:**
- **Mechanism** — why it should work
- **Preconditions** — what must be true
- **Costs/risks** — failure modes
- **Metrics** — how you'll know it worked
- **Execution plan** — tasks + owners + tools

**Output:**
```
InterventionOptions [{
  plan,
  risks,
  metrics,
  preconditions
}]
```

### F. Decide

**Goal:** Choose whether to act, and how safely.

**Autonomy levels:**
| Level | Capability |
|-------|------------|
| L0 | Recommend only |
| L1 | Draft materials (emails, reports, tickets) |
| L2 | Execute low-risk actions (notifications, dashboards, filing forms) |
| L3 | Execute bounded operations (API calls) with approvals |

**Hard gates:** safety, legality, authorization, reputational risk.

**Output:**
```
Decision {
  selected_option,
  autonomy_level,
  approvals,
  guardrails
}
```

### G. Execute

**Goal:** Deterministic, auditable execution with tool boundaries.

**The harness provides:**
- Tool adapters (email, ticketing, CRM, procurement, cloud, posting, calls)
- Rate limits + permission scopes
- Audit logs + replay (reproduce what happened)
- Rollback / compensation actions

**Output:**
```
RunLog {
  tool_calls,
  artifacts,
  outcomes,
  errors,
  timestamps
}
```

### H. Monitor & Learn

**Goal:** Measure real-world outcomes and feed back into triage + planning.

**Track:**
- *Outcome metrics* — impact, time saved, harm reduced
- *Process metrics* — latency, cost, human time
- *Quality metrics* — fact errors, tool errors, reversals

**Update:**
- Source reliability priors
- Triage weights
- Playbooks (reusable intervention templates)
- Evals (new tests based on failures)

**Output:** Updated policies + eval suites + playbooks.

---

## 2. Core Objects & Agent Roles

### Data Flow

```
EventCandidate → Issue → ProblemBrief → SituationModel → InterventionOption → Decision → RunLog
```

This keeps the system action-oriented because every step either:
1. Increases decision quality, or
2. Executes a bounded action, or
3. Improves future performance

### Agent Roles

| Agent | Responsibility |
|-------|----------------|
| **Scout** | Ingest + cluster events |
| **Triage** | Score and prioritize |
| **Analyst** | Build SituationModel + uncertainty map |
| **Planner** | Generate intervention options + metrics |
| **Operator** | Execute via harness tools |
| **Critic** | Challenge assumptions, find failure modes |
| **Safety/Policy** | Enforce rules (permissions, sensitive domains) |

---

## 3. Harness & Evals

### Harness (Execution Environment)

Treat every plan as a program that runs in a controlled runtime:
- Deterministic tool interfaces (schemas, idempotency keys)
- Bounded side effects (scoped permissions)
- Full trace logs (why each action happened)
- Replay + simulation mode (dry-run)

### Evals (Evaluation Tests)

Three layers:

**Offline evals** (fast, before deployment)
- Gold sets (curated cases)
- Synthetic fuzzing (adversarial variants)
- Tool-use correctness tests (schema + ordering + retries)

**Shadow evals** (real inputs, no actions)
- Compare multiple policies/planners
- Measure "decision quality" proxies (factuality, completeness)

**Online evals** (limited live action)
- Canary deployment (small %)
- Guardrails with auto-stop on regressions

> **Key rule:** Every production incident becomes a new eval.

---

## 4. First Build

### Implementation Order

1. Event ingestion + clustering (even if crude)
2. Issue scoring with a simple rubric + provenance
3. ProblemBrief template (goals/constraints/action space)
4. Harness v1: dry-run + audit log + a few safe tools (alerts, dashboard, ticket creation)
5. Evals v1: tool correctness + factuality checks + regression suite
6. Playbooks for 2–3 domains:
   - Disaster relief coordination
   - Supply chain disruption
   - Cyber incident info triage

### Hard Parts

- **Hallucination leakage** — preventing hallucinated "facts" from leaking into actions
- **Action space mapping** — mapping real-world action spaces (permissions + legitimacy)
- **Impact measurement** — measuring "impact" reliably (often delayed, confounded)
