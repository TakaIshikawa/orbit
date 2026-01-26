import { AnalystAgent } from "@orbit/agent";
import { LLMClient, setLLMClient } from "@orbit/llm";

async function main() {
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required");
    console.error("Usage: ANTHROPIC_API_KEY=sk-... npx tsx scripts/test-analyst.ts");
    process.exit(1);
  }

  // Initialize LLM client
  const client = new LLMClient({
    defaultProvider: "anthropic",
  });
  setLLMClient(client);

  // Create test data
  const testPatterns = [
    {
      id: "pat_001",
      title: "Fragmented Climate Data Infrastructure",
      description:
        "Climate monitoring data is scattered across hundreds of agencies, research institutions, and private companies. No unified API or data format exists. Researchers spend 40% of their time on data wrangling rather than analysis.",
      patternType: "information_asymmetry",
      domains: ["climate", "data_infrastructure", "research"],
    },
    {
      id: "pat_002",
      title: "Funding-Publication Cycle Lock-in",
      description:
        "Climate researchers are incentivized to publish novel findings rather than replicate studies or build shared infrastructure. Grant cycles favor short-term projects over long-term data stewardship.",
      patternType: "structural_inefficiency",
      domains: ["climate", "academia", "funding"],
    },
    {
      id: "pat_003",
      title: "Proprietary Sensor Networks",
      description:
        "Major weather and climate monitoring networks are operated by private companies who restrict data access. Public agencies lack resources to deploy comparable coverage.",
      patternType: "coordination_failure",
      domains: ["climate", "infrastructure", "public_private"],
    },
  ];

  const input = {
    context: {
      agentId: "agent_analyst_001",
      runId: "run_test_001",
      decisionId: "dec_test_001",
      triggeredBy: {
        type: "manual" as const,
        ref: "test_script",
      },
    },
    payload: {
      issueId: "issue_climate_data_001",
      patterns: testPatterns,
    },
  };

  console.log("Starting Analyst agent test...\n");
  console.log("Input patterns:");
  for (const p of testPatterns) {
    console.log(`  - ${p.title} (${p.patternType})`);
  }
  console.log("");

  const agent = new AnalystAgent();

  console.log("Running agent...\n");
  const startTime = Date.now();

  const result = await agent.run(input);

  const duration = Date.now() - startTime;

  console.log(`\nAgent completed in ${duration}ms`);
  console.log(`Success: ${result.success}`);

  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  console.log(`\nLLM Calls: ${result.llmCalls.length}`);
  for (const call of result.llmCalls) {
    console.log(
      `  Call ${call.callId}: ${call.model} - ${call.tokens.input} in / ${call.tokens.output} out (${call.latencyMs}ms)`
    );
  }

  console.log(`\nDecisions: ${result.decisions.length}`);
  for (const dec of result.decisions) {
    console.log(`  Step ${dec.step}: ${dec.actionChosen} (confidence: ${dec.confidence})`);
    console.log(`    Reasoning: ${dec.reasoning}`);
  }

  if (result.result) {
    console.log("\n=== PROBLEM BRIEF ===");
    const brief = result.result.problemBrief as Record<string, unknown>;
    console.log(`Summary: ${brief.summary}`);
    console.log(`\nRoot Causes:`);
    const rootCauses = brief.rootCauses as Array<{ description: string; confidence: number }>;
    for (const rc of rootCauses) {
      console.log(`  - ${rc.description} (confidence: ${rc.confidence})`);
    }

    console.log("\n=== SITUATION MODEL ===");
    const model = result.result.situationModel as Record<string, unknown>;
    const boundary = model.systemBoundary as { description: string };
    console.log(`System Boundary: ${boundary.description}`);

    const actors = model.actors as Array<{ name: string; type: string; role: string }>;
    console.log(`\nActors (${actors.length}):`);
    for (const actor of actors.slice(0, 5)) {
      console.log(`  - ${actor.name} (${actor.type}): ${actor.role}`);
    }
    if (actors.length > 5) {
      console.log(`  ... and ${actors.length - 5} more`);
    }

    const loops = model.feedbackLoops as Array<{ name: string; type: string; description: string }>;
    console.log(`\nFeedback Loops (${loops.length}):`);
    for (const loop of loops) {
      console.log(`  - ${loop.name} (${loop.type}): ${loop.description}`);
    }

    const leverage = model.leveragePoints as Array<{
      element: string;
      leverageType: string;
      potentialImpact: string;
    }>;
    console.log(`\nLeverage Points (${leverage.length}):`);
    for (const lp of leverage.slice(0, 5)) {
      console.log(`  - ${lp.element} (${lp.leverageType}): impact=${lp.potentialImpact}`);
    }
    if (leverage.length > 5) {
      console.log(`  ... and ${leverage.length - 5} more`);
    }
  }

  console.log("\n✓ Test completed successfully");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
