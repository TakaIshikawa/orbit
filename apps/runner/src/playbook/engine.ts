/**
 * Playbook Execution Engine
 *
 * Executes playbook steps sequentially, handling various action types
 * and tracking execution state in the database.
 */

import { spawn } from "child_process";
import {
  getDatabase,
  PlaybookRepository,
  PlaybookExecutionRepository,
  PlaybookStepExecutionRepository,
  type PlaybookRow,
  type PlaybookStep,
  type OperatorActionConfig,
} from "@orbit/db";
import { OperatorAgent } from "@orbit/agent";
import { generatePlaybookExecutionFeedback } from "../jobs/feedback-processor.js";

interface ExecutionContext {
  patternId?: string;
  issueId?: string;
  briefId?: string;
  variables: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

interface StepResult {
  success: boolean;
  output: Record<string, unknown>;
  error?: string;
  shouldContinue: boolean;
}

export class PlaybookEngine {
  private db = getDatabase();
  private playbookRepo = new PlaybookRepository(this.db);
  private executionRepo = new PlaybookExecutionRepository(this.db);
  private stepRepo = new PlaybookStepExecutionRepository(this.db);

  async execute(
    playbookId: string,
    triggeredBy: string,
    triggerRef?: string,
    initialContext?: Partial<ExecutionContext>
  ): Promise<string> {
    // Load playbook
    const playbook = await this.playbookRepo.findById(playbookId);
    if (!playbook) {
      throw new Error(`Playbook not found: ${playbookId}`);
    }

    const steps = (playbook.steps || []) as PlaybookStep[];
    if (steps.length === 0) {
      throw new Error(`Playbook has no steps: ${playbookId}`);
    }

    // Create execution record
    const executionId = `exec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await this.executionRepo.create({
      id: executionId,
      playbookId,
      triggeredBy,
      triggerRef,
      status: "running",
      startedAt: new Date(),
      context: {
        patternId: initialContext?.patternId,
        issueId: initialContext?.issueId,
        briefId: initialContext?.briefId,
        variables: initialContext?.variables || {},
      },
      currentStep: 0,
      totalSteps: steps.length,
      output: {},
      logs: [],
    });

    // Create step records
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await this.stepRepo.create({
        id: `step_${executionId}_${i}`,
        executionId,
        stepIndex: i,
        stepName: step.name,
        actionType: step.action.type,
        status: "pending",
        config: step.action.config as Record<string, unknown>,
      });
    }

    await this.log(executionId, "info", `Starting playbook: ${playbook.name}`);

    // Execute steps
    const context: ExecutionContext = {
      patternId: initialContext?.patternId,
      issueId: initialContext?.issueId,
      briefId: initialContext?.briefId,
      variables: initialContext?.variables || {},
      outputs: {},
    };

    let success = true;
    let finalError: string | undefined;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepId = `step_${executionId}_${i}`;

      await this.executionRepo.updateStatus(executionId, "running", { currentStep: i });
      await this.log(executionId, "info", `Step ${i + 1}/${steps.length}: ${step.name}`, i);

      try {
        const result = await this.executeStep(executionId, stepId, step, context);

        if (result.success) {
          context.outputs[`step_${i}`] = result.output;
          await this.stepRepo.markCompleted(stepId, result.output);
          await this.log(executionId, "info", `Step completed: ${step.name}`, i);
        } else {
          await this.stepRepo.markFailed(stepId, result.error || "Unknown error");
          await this.log(executionId, "error", `Step failed: ${result.error}`, i);

          if (!step.continueOnError) {
            success = false;
            finalError = result.error;
            break;
          }
        }

        if (!result.shouldContinue) {
          await this.log(executionId, "info", `Execution stopped by step: ${step.name}`, i);
          break;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await this.stepRepo.markFailed(stepId, errorMsg);
        await this.log(executionId, "error", `Step error: ${errorMsg}`, i);

        if (!step.continueOnError) {
          success = false;
          finalError = errorMsg;
          break;
        }
      }
    }

    // Update execution status
    const output = this.collectOutputs(context);
    await this.executionRepo.updateStatus(
      executionId,
      success ? "completed" : "failed",
      {
        completedAt: new Date(),
        output,
        error: finalError,
        currentStep: steps.length,
      }
    );

    // Update playbook metrics
    await this.updatePlaybookMetrics(playbookId, success);

    // Generate feedback for the execution
    const startTime = new Date(await this.getExecutionStartTime(executionId)).getTime();
    const durationMs = Date.now() - startTime;
    const completedSteps = success
      ? steps.length
      : await this.getCompletedStepCount(executionId);

    await generatePlaybookExecutionFeedback(
      this.db,
      executionId,
      playbookId,
      {
        success,
        totalSteps: steps.length,
        completedSteps,
        durationMs,
        errors: finalError ? [finalError] : [],
      }
    );

    await this.log(
      executionId,
      success ? "info" : "error",
      success ? "Playbook completed successfully" : `Playbook failed: ${finalError}`
    );

    return executionId;
  }

  private async executeStep(
    executionId: string,
    stepId: string,
    step: PlaybookStep,
    context: ExecutionContext
  ): Promise<StepResult> {
    await this.stepRepo.markStarted(stepId);

    switch (step.action.type) {
      case "scout":
        return this.executeScoutStep(step.action.config, context);

      case "analyze":
        return this.executeAnalyzeStep(step.action.config, context);

      case "brief":
        return this.executeBriefStep(step.action.config, context);

      case "verify":
        return this.executeVerifyStep(step.action.config, context);

      case "plan":
        return this.executePlanStep(step.action.config, context);

      case "condition":
        return this.executeConditionStep(step.action.config, context);

      case "wait":
        return this.executeWaitStep(step.action.config);

      case "notify":
        return this.executeNotifyStep(step.action.config, context);

      case "human_review":
        return this.executeHumanReviewStep(step.action.config, context);

      case "operator":
        return this.executeOperatorStep(step.action.config, context);

      default:
        return {
          success: false,
          output: {},
          error: `Unknown action type: ${(step.action as { type: string }).type}`,
          shouldContinue: false,
        };
    }
  }

  private async executeScoutStep(
    config: { sources?: string[]; maxPatterns?: number },
    context: ExecutionContext
  ): Promise<StepResult> {
    const args = ["--recommended"];
    if (config.maxPatterns) args.push("--max", config.maxPatterns.toString());

    return this.runCommand("src/commands/scout.ts", args, context);
  }

  private async executeAnalyzeStep(
    config: { maxIssues?: number },
    context: ExecutionContext
  ): Promise<StepResult> {
    const args: string[] = [];
    if (config.maxIssues) args.push("--max-issues", config.maxIssues.toString());

    return this.runCommand("src/commands/analyze.ts", args, context);
  }

  private async executeBriefStep(
    config: { issueId?: string },
    context: ExecutionContext
  ): Promise<StepResult> {
    const args: string[] = [];
    const issueId = config.issueId || context.issueId;
    if (issueId) args.push("--issue", issueId);

    return this.runCommand("src/commands/brief.ts", args, context);
  }

  private async executeVerifyStep(
    config: { maxClaims?: number; maxSources?: number },
    context: ExecutionContext
  ): Promise<StepResult> {
    const args: string[] = [];
    if (context.patternId) {
      args.push("--pattern", context.patternId);
    } else {
      args.push("--all-patterns");
    }
    if (config.maxClaims) args.push("--max-claims", config.maxClaims.toString());
    if (config.maxSources) args.push("--max-sources", config.maxSources.toString());

    return this.runCommand("src/commands/verify.ts", args, context);
  }

  private async executePlanStep(
    config: { maxSolutions?: number },
    context: ExecutionContext
  ): Promise<StepResult> {
    const args = ["--all"];
    if (config.maxSolutions) args.push("--max-solutions", config.maxSolutions.toString());

    return this.runCommand("src/commands/plan.ts", args, context);
  }

  private async executeConditionStep(
    config: { expression: string; onTrue?: number; onFalse?: number },
    context: ExecutionContext
  ): Promise<StepResult> {
    // Simple expression evaluation
    // Supports: context.patternId, context.issueId, outputs.step_N.field
    try {
      const result = this.evaluateExpression(config.expression, context);

      return {
        success: true,
        output: { conditionResult: result, expression: config.expression },
        shouldContinue: true,
      };
    } catch (error) {
      return {
        success: false,
        output: {},
        error: `Condition evaluation failed: ${error instanceof Error ? error.message : error}`,
        shouldContinue: false,
      };
    }
  }

  private async executeWaitStep(
    config: { duration: number; unit: "seconds" | "minutes" | "hours" }
  ): Promise<StepResult> {
    const multiplier = { seconds: 1000, minutes: 60000, hours: 3600000 }[config.unit];
    const waitMs = config.duration * multiplier;

    await new Promise(resolve => setTimeout(resolve, waitMs));

    return {
      success: true,
      output: { waitedMs: waitMs },
      shouldContinue: true,
    };
  }

  private async executeNotifyStep(
    config: { channel: string; message: string },
    context: ExecutionContext
  ): Promise<StepResult> {
    // For now, just log the notification
    // In production, this would integrate with Slack, email, etc.
    const message = this.interpolateMessage(config.message, context);
    console.log(`📢 [${config.channel}] ${message}`);

    return {
      success: true,
      output: { channel: config.channel, message },
      shouldContinue: true,
    };
  }

  private async executeHumanReviewStep(
    config: { prompt: string; timeout?: number },
    context: ExecutionContext
  ): Promise<StepResult> {
    // In a real implementation, this would:
    // 1. Create a review request in the database
    // 2. Send notification to reviewers
    // 3. Wait for approval (with timeout)
    // For now, we just log and auto-approve
    const prompt = this.interpolateMessage(config.prompt, context);
    console.log(`👤 Human review requested: ${prompt}`);
    console.log(`   (Auto-approved for demo purposes)`);

    return {
      success: true,
      output: { approved: true, prompt, autoApproved: true },
      shouldContinue: true,
    };
  }

  private async executeOperatorStep(
    config: OperatorActionConfig,
    context: ExecutionContext
  ): Promise<StepResult> {
    console.log(`🤖 Starting operator task: ${config.objective}`);
    if (config.startUrl) {
      console.log(`   Start URL: ${config.startUrl}`);
    }

    try {
      const operatorAgent = new OperatorAgent();

      const result = await operatorAgent.run({
        context: {
          agentId: `operator_${Date.now().toString(36)}`,
          runId: `run_${Date.now().toString(36)}`,
          decisionId: `dec_${Date.now().toString(36)}`,
          triggeredBy: {
            type: "parent_agent",
            ref: "playbook_engine",
          },
        },
        payload: {
          computerUseTask: {
            taskType: config.taskType,
            objective: config.objective,
            startUrl: config.startUrl,
            successCriteria: config.successCriteria,
            headless: config.headless ?? true,
            maxSteps: config.maxSteps ?? 30,
            displaySize: config.displaySize,
          },
        },
      });

      if (!result.success) {
        console.log(`❌ Operator task failed: ${result.error}`);
        return {
          success: false,
          output: { error: result.error, llmCalls: result.llmCalls },
          error: result.error,
          shouldContinue: false,
        };
      }

      const output = result.result as Record<string, unknown>;
      const computerUseResult = output.computerUseResult as Record<string, unknown> | undefined;

      console.log(`✅ Operator task completed`);
      if (computerUseResult) {
        console.log(`   Session ID: ${computerUseResult.sessionId}`);
        console.log(`   Total steps: ${computerUseResult.totalSteps}`);
        if (computerUseResult.summary) {
          console.log(`   Summary: ${computerUseResult.summary}`);
        }
      }

      return {
        success: output.overallStatus === "completed",
        output: {
          ...output,
          llmCalls: result.llmCalls,
          decisions: result.decisions,
        },
        shouldContinue: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Operator task error: ${errorMsg}`);
      return {
        success: false,
        output: {},
        error: errorMsg,
        shouldContinue: false,
      };
    }
  }

  private async runCommand(
    command: string,
    args: string[],
    context: ExecutionContext
  ): Promise<StepResult> {
    return new Promise(resolve => {
      let output = "";
      const stats: Record<string, unknown> = {};

      const child = spawn("npx", ["tsx", command, ...args], {
        cwd: process.cwd(),
        env: process.env,
        shell: true,
      });

      child.stdout?.on("data", data => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);

        // Parse stats from output
        const patternsMatch = text.match(/(\d+) patterns? (?:created|discovered)/i);
        if (patternsMatch) stats.patternsCreated = parseInt(patternsMatch[1]);

        const issuesMatch = text.match(/(\d+) issues? created/i);
        if (issuesMatch) stats.issuesCreated = parseInt(issuesMatch[1]);

        const solutionsMatch = text.match(/(\d+) solutions? (?:created|generated)/i);
        if (solutionsMatch) stats.solutionsCreated = parseInt(solutionsMatch[1]);
      });

      child.stderr?.on("data", data => {
        output += data.toString();
        process.stderr.write(data.toString());
      });

      child.on("close", code => {
        resolve({
          success: code === 0,
          output: { ...stats, rawOutput: output.slice(-2000) },
          error: code !== 0 ? `Command exited with code ${code}` : undefined,
          shouldContinue: true,
        });
      });

      child.on("error", err => {
        resolve({
          success: false,
          output: {},
          error: err.message,
          shouldContinue: false,
        });
      });
    });
  }

  private evaluateExpression(expression: string, context: ExecutionContext): boolean {
    // Simple safe expression evaluation
    // Supports: context.patternId, context.issueId, outputs.step_N
    const safeContext = {
      context: {
        patternId: context.patternId,
        issueId: context.issueId,
        briefId: context.briefId,
      },
      outputs: context.outputs,
      variables: context.variables,
    };

    // Very basic expression parsing
    if (expression.includes("exists")) {
      const match = expression.match(/(\w+(?:\.\w+)*)\s+exists/);
      if (match) {
        const path = match[1].split(".");
        let value: unknown = safeContext;
        for (const key of path) {
          value = (value as Record<string, unknown>)?.[key];
        }
        return value !== undefined && value !== null;
      }
    }

    // For now, default to true for unknown expressions
    console.warn(`Unknown expression format: ${expression}, defaulting to true`);
    return true;
  }

  private interpolateMessage(message: string, context: ExecutionContext): string {
    return message
      .replace(/\{\{patternId\}\}/g, context.patternId || "N/A")
      .replace(/\{\{issueId\}\}/g, context.issueId || "N/A")
      .replace(/\{\{briefId\}\}/g, context.briefId || "N/A");
  }

  private collectOutputs(context: ExecutionContext): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context.outputs)) {
      const stepOutput = value as Record<string, unknown>;
      if (stepOutput.patternsCreated) {
        output.patternsCreated = [
          ...((output.patternsCreated as string[]) || []),
          ...(Array.isArray(stepOutput.patternsCreated)
            ? stepOutput.patternsCreated
            : [stepOutput.patternsCreated]),
        ];
      }
      if (stepOutput.issuesCreated) {
        output.issuesCreated = [
          ...((output.issuesCreated as string[]) || []),
          ...(Array.isArray(stepOutput.issuesCreated)
            ? stepOutput.issuesCreated
            : [stepOutput.issuesCreated]),
        ];
      }
    }

    return output;
  }

  private async updatePlaybookMetrics(playbookId: string, success: boolean): Promise<void> {
    const playbook = await this.playbookRepo.findById(playbookId);
    if (!playbook) return;

    const timesUsed = playbook.timesUsed + 1;
    const successCount = (playbook.successRate || 0) * playbook.timesUsed + (success ? 1 : 0);
    const successRate = successCount / timesUsed;

    await this.playbookRepo.update(playbookId, {
      timesUsed,
      successRate,
    });
  }

  private async log(
    executionId: string,
    level: "info" | "warn" | "error",
    message: string,
    stepIndex?: number
  ): Promise<void> {
    console.log(`[${level.toUpperCase()}] ${message}`);
    await this.executionRepo.appendLog(executionId, level, message, stepIndex);
  }

  private async getExecutionStartTime(executionId: string): Promise<Date> {
    const execution = await this.executionRepo.findById(executionId);
    return execution?.startedAt ?? new Date();
  }

  private async getCompletedStepCount(executionId: string): Promise<number> {
    const steps = await this.stepRepo.findByExecution(executionId);
    return steps.filter(s => s.status === "completed").length;
  }
}

export const playbookEngine = new PlaybookEngine();
