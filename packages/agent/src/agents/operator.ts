import { z } from "zod";
import { BaseAgent } from "../base.js";
import type { AgentDefinition, AgentInput } from "../types.js";
import {
  ToolLoopManager,
  ComputerUseConfigSchema,
  ComputerUseTaskConfigSchema,
  type ComputerUseTaskConfig,
  type ComputerUseSession,
  type ToolInvocation,
} from "../tools/computer-use/index.js";

const ExecutionStepSchema = z.object({
  phase: z.number(),
  name: z.string(),
  description: z.string(),
  owner: z.enum(["human", "agent", "hybrid"]),
  estimatedComplexity: z.enum(["low", "medium", "high"]),
  deliverables: z.array(z.string()),
  dependencies: z.array(z.number()),
});

const OperatorInputSchema = z.object({
  solution: z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    solutionType: z.string(),
    mechanism: z.string(),
    executionPlan: z.array(ExecutionStepSchema),
  }).optional(),
  targetStep: z.number().optional().describe("Specific step to execute, or execute all agent-owned steps"),
  context: z.record(z.unknown()).optional().describe("Additional context for execution"),
  // Computer-use task configuration
  computerUseTask: ComputerUseTaskConfigSchema.optional().describe("Configuration for computer-use browser automation"),
});

const ArtifactSchema = z.object({
  title: z.string(),
  artifactType: z.enum(["document", "code", "tool", "dataset", "analysis", "other"]),
  format: z.string(),
  content: z.string(),
  summary: z.string(),
});

const StepResultSchema = z.object({
  stepPhase: z.number(),
  stepName: z.string(),
  status: z.enum(["completed", "partial", "skipped", "failed"]),
  summary: z.string(),
  artifacts: z.array(ArtifactSchema),
  notes: z.array(z.string()),
});

const ComputerUseResultSchema = z.object({
  sessionId: z.string(),
  objective: z.string(),
  status: z.enum(["running", "completed", "failed", "stopped"]),
  totalSteps: z.number(),
  invocationCount: z.number(),
  screenshotDir: z.string().optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
});

const OperatorOutputSchema = z.object({
  stepResults: z.array(StepResultSchema).optional(),
  overallStatus: z.enum(["completed", "partial", "failed"]),
  summary: z.string(),
  nextSteps: z.array(z.string()),
  humanActionsRequired: z.array(
    z.object({
      action: z.string(),
      reason: z.string(),
      priority: z.enum(["low", "medium", "high"]),
    })
  ),
  // Computer-use specific results
  computerUseResult: ComputerUseResultSchema.optional(),
});

type OperatorInput = z.infer<typeof OperatorInputSchema>;
type OperatorOutput = z.infer<typeof OperatorOutputSchema>;

export class OperatorAgent extends BaseAgent {
  definition: AgentDefinition = {
    type: "operator",
    name: "Operator",
    description:
      "Executes solution steps and produces artifacts. Handles research, document generation, and code generation tasks.",
    inputSchema: OperatorInputSchema,
    outputSchema: OperatorOutputSchema,
  };

  async execute(input: AgentInput): Promise<Record<string, unknown>> {
    const data = OperatorInputSchema.parse(input.payload);

    // Check if this is a computer-use task
    if (data.computerUseTask) {
      return this.executeComputerUseTask(data.computerUseTask);
    }

    // Require solution for non-computer-use tasks
    if (!data.solution) {
      return {
        overallStatus: "failed",
        summary: "No solution or computerUseTask provided",
        nextSteps: [],
        humanActionsRequired: [],
      };
    }

    // Filter steps to execute
    const stepsToExecute = data.solution.executionPlan.filter((step) => {
      if (data.targetStep !== undefined) {
        return step.phase === data.targetStep && step.owner !== "human";
      }
      return step.owner === "agent" || step.owner === "hybrid";
    });

    this.recordDecision(
      `Identified ${stepsToExecute.length} steps to execute for solution "${data.solution.title}"`,
      "plan_execution",
      0.9
    );

    if (stepsToExecute.length === 0) {
      return {
        stepResults: [],
        overallStatus: "completed",
        summary: "No agent-executable steps found in the execution plan.",
        nextSteps: ["Review execution plan for human-owned steps"],
        humanActionsRequired: data.solution.executionPlan
          .filter((s) => s.owner === "human")
          .map((s) => ({
            action: s.name,
            reason: s.description,
            priority: s.estimatedComplexity === "high" ? "high" : "medium",
          })),
      };
    }

    const stepResults = [];

    for (const step of stepsToExecute) {
      this.recordDecision(
        `Executing step ${step.phase}: ${step.name}`,
        "execute_step",
        0.85
      );

      const result = await this.executeStep(step, data.solution, data.context);
      stepResults.push(result);
    }

    const completedCount = stepResults.filter((r) => r.status === "completed").length;
    const overallStatus =
      completedCount === stepResults.length
        ? "completed"
        : completedCount > 0
          ? "partial"
          : "failed";

    this.recordDecision(
      `Execution complete: ${completedCount}/${stepResults.length} steps completed`,
      "summarize",
      0.9
    );

    const humanSteps = data.solution.executionPlan.filter((s) => s.owner === "human");

    return {
      stepResults,
      overallStatus,
      summary: `Executed ${stepResults.length} steps for "${data.solution.title}". ${completedCount} completed successfully.`,
      nextSteps: this.determineNextSteps(stepResults, data.solution.executionPlan),
      humanActionsRequired: humanSteps.map((s) => ({
        action: s.name,
        reason: s.description,
        priority: s.estimatedComplexity === "high" ? ("high" as const) : ("medium" as const),
      })),
    };
  }

  private async executeComputerUseTask(
    config: ComputerUseTaskConfig
  ): Promise<Record<string, unknown>> {
    this.recordDecision(
      `Starting computer-use task: ${config.objective}`,
      "computer_use_init",
      0.9
    );

    const sessionId = `cu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const loopManager = new ToolLoopManager({
      displaySize: config.displaySize || { width: 1280, height: 800 },
      headless: config.headless,
      maxSteps: config.maxSteps,
      actionTimeoutMs: 30000,
    });

    const result = await loopManager.execute(
      sessionId,
      config.objective,
      config.startUrl
    );

    this.recordDecision(
      `Computer-use task ${result.success ? "completed" : "failed"}: ${result.session.totalSteps} steps`,
      "computer_use_complete",
      result.success ? 0.9 : 0.5
    );

    return {
      overallStatus: result.success ? "completed" : "failed",
      summary: result.summary || result.error || `Computer-use task executed with ${result.session.totalSteps} steps`,
      nextSteps: result.success
        ? ["Review computer-use session results", "Verify success criteria met"]
        : ["Investigate failure", "Retry with adjusted parameters"],
      humanActionsRequired: result.success
        ? []
        : [
            {
              action: "Review computer-use failure",
              reason: result.error || "Task did not complete successfully",
              priority: "high" as const,
            },
          ],
      computerUseResult: {
        sessionId: result.session.id,
        objective: result.session.objective,
        status: result.session.status,
        totalSteps: result.session.totalSteps,
        invocationCount: result.session.invocations.length,
        summary: result.session.summary,
        error: result.session.error,
      },
    };
  }

  private async executeStep(
    step: z.infer<typeof ExecutionStepSchema>,
    solution: NonNullable<OperatorInput["solution"]>,
    context?: Record<string, unknown>
  ): Promise<z.infer<typeof StepResultSchema>> {
    const systemPrompt = `You are an execution agent that produces concrete deliverables.

Your capabilities:
1. **Research**: Gather and synthesize information
2. **Document Generation**: Create reports, specifications, guides
3. **Code Generation**: Write functional code for tools and automations
4. **Analysis**: Analyze data and produce insights

Guidelines:
- Produce complete, usable artifacts
- Include clear documentation
- Consider edge cases and error handling
- Make outputs self-contained when possible`;

    const userPrompt = `Execute the following step and produce deliverables:

## Solution Context
**Title**: ${solution.title}
**Type**: ${solution.solutionType}
**Mechanism**: ${solution.mechanism}

## Step to Execute
**Phase ${step.phase}**: ${step.name}
**Description**: ${step.description}
**Complexity**: ${step.estimatedComplexity}
**Expected Deliverables**: ${step.deliverables.join(", ")}

${context ? `## Additional Context\n${JSON.stringify(context, null, 2)}` : ""}

Produce the deliverables for this step. For each deliverable:
1. Create a complete artifact (document, code, analysis, etc.)
2. Provide a clear summary
3. Note any limitations or areas needing human review`;

    const ResultSchema = z.object({
      status: z.enum(["completed", "partial", "skipped", "failed"]),
      summary: z.string(),
      artifacts: z.array(ArtifactSchema),
      notes: z.array(z.string()),
    });

    const result = await this.completeStructured(
      [{ role: "user", content: userPrompt }],
      ResultSchema,
      {
        systemPrompt,
        schemaName: "step_execution_result",
        schemaDescription: "Result of executing a solution step",
        maxTokens: 4096,
      }
    );

    return {
      stepPhase: step.phase,
      stepName: step.name,
      ...result,
    };
  }

  private determineNextSteps(
    results: z.infer<typeof StepResultSchema>[],
    fullPlan: z.infer<typeof ExecutionStepSchema>[]
  ): string[] {
    const nextSteps: string[] = [];

    // Find failed or partial steps
    const incomplete = results.filter((r) => r.status !== "completed");
    if (incomplete.length > 0) {
      nextSteps.push(`Review and address ${incomplete.length} incomplete steps`);
    }

    // Find next human steps
    const completedPhases = new Set(results.filter((r) => r.status === "completed").map((r) => r.stepPhase));
    const pendingHumanSteps = fullPlan.filter(
      (s) => s.owner === "human" && s.dependencies.every((d) => completedPhases.has(d))
    );

    for (const step of pendingHumanSteps.slice(0, 3)) {
      nextSteps.push(`Human action needed: ${step.name}`);
    }

    // Find next agent steps that are now unblocked
    const pendingAgentSteps = fullPlan.filter(
      (s) =>
        s.owner === "agent" &&
        !completedPhases.has(s.phase) &&
        s.dependencies.every((d) => completedPhases.has(d))
    );

    for (const step of pendingAgentSteps.slice(0, 3)) {
      nextSteps.push(`Ready for execution: ${step.name}`);
    }

    if (nextSteps.length === 0) {
      nextSteps.push("All planned steps completed. Review artifacts and measure outcomes.");
    }

    return nextSteps;
  }
}
