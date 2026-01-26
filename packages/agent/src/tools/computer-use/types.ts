/**
 * Computer Use Types
 *
 * Type definitions for browser automation via Claude's computer-use API.
 */

import { z } from "zod";

// Display configuration
export interface DisplayConfig {
  width: number;
  height: number;
}

// Computer use session configuration
export const ComputerUseConfigSchema = z.object({
  displaySize: z.object({
    width: z.number().default(1280),
    height: z.number().default(800),
  }).default({ width: 1280, height: 800 }),
  headless: z.boolean().default(true),
  maxSteps: z.number().default(50),
  actionTimeoutMs: z.number().default(30000),
  screenshotDir: z.string().optional(),
});

export type ComputerUseConfig = z.infer<typeof ComputerUseConfigSchema>;

// Action types supported by Claude's computer-use tool
export type ComputerActionType =
  | "key"
  | "type"
  | "mouse_move"
  | "left_click"
  | "left_click_drag"
  | "right_click"
  | "middle_click"
  | "double_click"
  | "screenshot"
  | "cursor_position";

// Computer action from Claude's response
export const ComputerActionSchema = z.object({
  type: z.enum([
    "key",
    "type",
    "mouse_move",
    "left_click",
    "left_click_drag",
    "right_click",
    "middle_click",
    "double_click",
    "screenshot",
    "cursor_position",
  ]),
  // For key action: key sequence like "Return", "ctrl+c", etc.
  text: z.string().optional(),
  // For mouse actions: coordinates
  coordinate: z.tuple([z.number(), z.number()]).optional(),
  // For drag: start and end coordinates
  startCoordinate: z.tuple([z.number(), z.number()]).optional(),
  endCoordinate: z.tuple([z.number(), z.number()]).optional(),
});

export type ComputerAction = z.infer<typeof ComputerActionSchema>;

// Record of a single tool invocation
export interface ToolInvocation {
  id: string;
  stepNumber: number;
  timestamp: Date;
  action: ComputerAction;
  screenshotPath?: string;
  screenshotBase64?: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

// Session status
export type SessionStatus = "running" | "completed" | "failed" | "stopped";

// Computer use session tracking
export interface ComputerUseSession {
  id: string;
  objective: string;
  startUrl?: string;
  config: ComputerUseConfig;
  status: SessionStatus;
  startedAt: Date;
  completedAt?: Date;
  totalSteps: number;
  invocations: ToolInvocation[];
  summary?: string;
  error?: string;
}

// Tool result from browser execution
export interface BrowserToolResult {
  success: boolean;
  screenshot?: Buffer;
  screenshotBase64?: string;
  cursorPosition?: [number, number];
  error?: string;
}

// Claude API computer-use specific types
export interface ComputerToolInput {
  action: ComputerActionType;
  text?: string;
  coordinate?: [number, number];
  start_coordinate?: [number, number];
}

// Message content types for computer-use API
export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
    data: string;
  };
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: ComputerToolInput;
}

export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content?: (TextContent | ImageContent)[];
  is_error?: boolean;
}

export type MessageContent = TextContent | ImageContent | ToolUseContent | ToolResultContent;

// Computer-use API response
export interface ComputerUseResponse {
  content: MessageContent[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Operator task config for computer-use
export const ComputerUseTaskConfigSchema = z.object({
  taskType: z.literal("computer_use"),
  objective: z.string(),
  startUrl: z.string().optional(),
  successCriteria: z.array(z.string()).optional(),
  headless: z.boolean().default(true),
  maxSteps: z.number().default(30),
  displaySize: z.object({
    width: z.number(),
    height: z.number(),
  }).optional(),
});

export type ComputerUseTaskConfig = z.infer<typeof ComputerUseTaskConfigSchema>;
