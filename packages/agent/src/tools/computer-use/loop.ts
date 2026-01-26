/**
 * Tool Loop Manager
 *
 * Orchestrates the computer-use tool loop between Claude and the browser.
 */

import { AnthropicProvider, type ComputerUseMessage, type ComputerUseContent } from "@orbit/llm";
import { BrowserTool } from "./browser.js";
import { ScreenshotManager } from "./screenshot.js";
import type {
  ComputerUseConfig,
  ComputerUseSession,
  ToolInvocation,
  ComputerAction,
  SessionStatus,
} from "./types.js";

export interface ToolLoopResult {
  session: ComputerUseSession;
  success: boolean;
  summary?: string;
  error?: string;
}

export class ToolLoopManager {
  private provider: AnthropicProvider;
  private browser: BrowserTool | null = null;
  private screenshotManager: ScreenshotManager;
  private config: ComputerUseConfig;
  private invocations: ToolInvocation[] = [];
  private stepNumber = 0;

  constructor(
    config: ComputerUseConfig,
    screenshotDir: string = "./screenshots",
    apiKey?: string
  ) {
    this.config = config;
    this.provider = new AnthropicProvider(apiKey);
    this.screenshotManager = new ScreenshotManager(screenshotDir);
  }

  async execute(
    sessionId: string,
    objective: string,
    startUrl?: string
  ): Promise<ToolLoopResult> {
    const session: ComputerUseSession = {
      id: sessionId,
      objective,
      startUrl,
      config: this.config,
      status: "running",
      startedAt: new Date(),
      totalSteps: 0,
      invocations: [],
    };

    try {
      // Initialize browser and screenshot manager
      this.browser = new BrowserTool(this.config);
      await this.browser.initialize();
      await this.screenshotManager.initSession(sessionId);

      // Navigate to start URL if provided
      let initialScreenshot: Buffer;
      if (startUrl) {
        const navResult = await this.browser.navigate(startUrl);
        if (!navResult.success) {
          throw new Error(`Failed to navigate to ${startUrl}: ${navResult.error}`);
        }
        initialScreenshot = navResult.screenshot!;
      } else {
        initialScreenshot = await this.browser.captureScreenshot();
      }

      // Save initial screenshot
      const initialRecord = await this.screenshotManager.save(initialScreenshot, 0, "initial");

      // Build initial message with screenshot
      const messages: ComputerUseMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: `Your objective: ${objective}` },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: initialRecord.base64,
              },
            },
          ],
        },
      ];

      // Run the tool loop
      let stopReason: string = "";
      this.stepNumber = 0;

      while (this.stepNumber < this.config.maxSteps) {
        this.stepNumber++;

        // Call Claude with computer-use
        const response = await this.provider.completeWithComputerUse(messages, {
          displaySize: this.config.displaySize,
          systemPrompt: this.buildSystemPrompt(objective),
        });

        stopReason = response.stopReason;

        // Add assistant response to messages
        messages.push({
          role: "assistant",
          content: response.content,
        });

        // Check if we're done
        if (stopReason === "end_turn") {
          // Extract summary from text response
          const textContent = response.content.find((c) => c.type === "text");
          if (textContent && textContent.type === "text") {
            session.summary = textContent.text;
          }
          break;
        }

        if (stopReason !== "tool_use") {
          // Unexpected stop reason
          throw new Error(`Unexpected stop reason: ${stopReason}`);
        }

        // Process tool calls
        const toolResults: ComputerUseContent[] = [];

        for (const content of response.content) {
          if (content.type === "tool_use" && content.name === "computer") {
            const result = await this.executeToolCall(
              content.id,
              content.input as { action: string; text?: string; coordinate?: [number, number] }
            );
            toolResults.push(result);
          }
        }

        // Add tool results to messages
        if (toolResults.length > 0) {
          messages.push({
            role: "user",
            content: toolResults,
          });
        }
      }

      // Determine final status
      const status: SessionStatus = this.stepNumber >= this.config.maxSteps ? "stopped" : "completed";

      session.status = status;
      session.completedAt = new Date();
      session.totalSteps = this.stepNumber;
      session.invocations = this.invocations;

      return {
        session,
        success: status === "completed",
        summary: session.summary,
      };
    } catch (error) {
      session.status = "failed";
      session.completedAt = new Date();
      session.totalSteps = this.stepNumber;
      session.invocations = this.invocations;
      session.error = error instanceof Error ? error.message : String(error);

      return {
        session,
        success: false,
        error: session.error,
      };
    } finally {
      await this.cleanup();
    }
  }

  private async executeToolCall(
    toolUseId: string,
    input: { action: string; text?: string; coordinate?: [number, number] }
  ): Promise<ComputerUseContent> {
    const startTime = Date.now();
    const action: ComputerAction = {
      type: input.action as ComputerAction["type"],
      text: input.text,
      coordinate: input.coordinate,
    };

    const invocation: ToolInvocation = {
      id: toolUseId,
      stepNumber: this.stepNumber,
      timestamp: new Date(),
      action,
      success: false,
      durationMs: 0,
    };

    try {
      const result = await this.browser!.executeAction(action);
      invocation.durationMs = Date.now() - startTime;
      invocation.success = result.success;

      if (!result.success) {
        invocation.error = result.error;
        this.invocations.push(invocation);

        return {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: [{ type: "text", text: result.error || "Action failed" }],
          is_error: true,
        };
      }

      // Save screenshot if we got one
      const content: ComputerUseContent[] = [];

      if (result.screenshot) {
        const screenshotRecord = await this.screenshotManager.save(
          result.screenshot,
          this.stepNumber,
          "step"
        );
        invocation.screenshotPath = screenshotRecord.path;
        invocation.screenshotBase64 = screenshotRecord.base64;

        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: screenshotRecord.base64,
          },
        });
      }

      if (result.cursorPosition) {
        content.push({
          type: "text",
          text: `Cursor position: (${result.cursorPosition[0]}, ${result.cursorPosition[1]})`,
        });
      }

      this.invocations.push(invocation);

      return {
        type: "tool_result",
        tool_use_id: toolUseId,
        content: content.length > 0 ? content : undefined,
      };
    } catch (error) {
      invocation.durationMs = Date.now() - startTime;
      invocation.error = error instanceof Error ? error.message : String(error);
      this.invocations.push(invocation);

      return {
        type: "tool_result",
        tool_use_id: toolUseId,
        content: [{ type: "text", text: invocation.error }],
        is_error: true,
      };
    }
  }

  private buildSystemPrompt(objective: string): string {
    return `You are a computer use agent that can control a web browser to accomplish tasks.

Your objective: ${objective}

Guidelines:
1. Use the computer tool to interact with the browser
2. Take screenshots to understand the current state
3. Click on elements to interact with them
4. Type text when you need to enter information
5. Use keyboard shortcuts when appropriate
6. Be methodical and verify each action succeeded before proceeding
7. When the objective is complete, stop and provide a summary

Available actions:
- screenshot: Take a screenshot of the current state
- mouse_move: Move cursor to coordinates [x, y]
- left_click: Click at current cursor position or coordinates
- right_click: Right-click at current cursor position or coordinates
- double_click: Double-click at current cursor position or coordinates
- type: Type text at the current cursor position
- key: Press a key or key combination (e.g., "Return", "ctrl+c")

Display size: ${this.config.displaySize.width}x${this.config.displaySize.height}`;
  }

  private async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.invocations = [];
    this.stepNumber = 0;
  }
}
