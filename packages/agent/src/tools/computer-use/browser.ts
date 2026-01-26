/**
 * Browser Tool
 *
 * Playwright-based browser automation for computer-use.
 */

import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import type { ComputerAction, ComputerUseConfig, BrowserToolResult, DisplayConfig } from "./types.js";

// Key mapping for special keys
const KEY_MAP: Record<string, string> = {
  Return: "Enter",
  BackSpace: "Backspace",
  Tab: "Tab",
  Escape: "Escape",
  space: " ",
  Up: "ArrowUp",
  Down: "ArrowDown",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Home: "Home",
  End: "End",
  Page_Up: "PageUp",
  Page_Down: "PageDown",
  Delete: "Delete",
  Insert: "Insert",
};

export class BrowserTool {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: ComputerUseConfig;
  private cursorPosition: [number, number] = [0, 0];

  constructor(config: ComputerUseConfig) {
    this.config = config;
  }

  get displaySize(): DisplayConfig {
    return this.config.displaySize;
  }

  async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    this.browser = await chromium.launch({
      headless: this.config.headless,
    });

    this.context = await this.browser.newContext({
      viewport: {
        width: this.config.displaySize.width,
        height: this.config.displaySize.height,
      },
    });

    this.page = await this.context.newPage();
    this.cursorPosition = [
      Math.floor(this.config.displaySize.width / 2),
      Math.floor(this.config.displaySize.height / 2),
    ];
  }

  async navigate(url: string): Promise<BrowserToolResult> {
    if (!this.page) {
      return { success: false, error: "Browser not initialized" };
    }

    try {
      await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: this.config.actionTimeoutMs,
      });

      const screenshot = await this.captureScreenshot();
      return { success: true, screenshot };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async executeAction(action: ComputerAction): Promise<BrowserToolResult> {
    if (!this.page) {
      return { success: false, error: "Browser not initialized" };
    }

    try {
      switch (action.type) {
        case "screenshot":
          return await this.handleScreenshot();

        case "cursor_position":
          return await this.handleCursorPosition();

        case "mouse_move":
          return await this.handleMouseMove(action.coordinate);

        case "left_click":
          return await this.handleClick("left", action.coordinate);

        case "right_click":
          return await this.handleClick("right", action.coordinate);

        case "middle_click":
          return await this.handleClick("middle", action.coordinate);

        case "double_click":
          return await this.handleDoubleClick(action.coordinate);

        case "left_click_drag":
          return await this.handleDrag(action.startCoordinate, action.endCoordinate);

        case "type":
          return await this.handleType(action.text);

        case "key":
          return await this.handleKey(action.text);

        default:
          return { success: false, error: `Unknown action type: ${action.type}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async captureScreenshot(): Promise<Buffer> {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    return await this.page.screenshot({
      type: "png",
      fullPage: false,
    });
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async handleScreenshot(): Promise<BrowserToolResult> {
    const screenshot = await this.captureScreenshot();
    return { success: true, screenshot };
  }

  private async handleCursorPosition(): Promise<BrowserToolResult> {
    return { success: true, cursorPosition: this.cursorPosition };
  }

  private async handleMouseMove(coordinate?: [number, number]): Promise<BrowserToolResult> {
    if (!coordinate) {
      return { success: false, error: "Coordinate required for mouse_move" };
    }

    await this.page!.mouse.move(coordinate[0], coordinate[1]);
    this.cursorPosition = coordinate;

    const screenshot = await this.captureScreenshot();
    return { success: true, screenshot };
  }

  private async handleClick(
    button: "left" | "right" | "middle",
    coordinate?: [number, number]
  ): Promise<BrowserToolResult> {
    if (coordinate) {
      await this.page!.mouse.move(coordinate[0], coordinate[1]);
      this.cursorPosition = coordinate;
    }

    await this.page!.mouse.click(this.cursorPosition[0], this.cursorPosition[1], {
      button,
    });

    // Wait for any navigation or dynamic content
    await this.page!.waitForTimeout(500);

    const screenshot = await this.captureScreenshot();
    return { success: true, screenshot };
  }

  private async handleDoubleClick(coordinate?: [number, number]): Promise<BrowserToolResult> {
    if (coordinate) {
      await this.page!.mouse.move(coordinate[0], coordinate[1]);
      this.cursorPosition = coordinate;
    }

    await this.page!.mouse.dblclick(this.cursorPosition[0], this.cursorPosition[1]);
    await this.page!.waitForTimeout(500);

    const screenshot = await this.captureScreenshot();
    return { success: true, screenshot };
  }

  private async handleDrag(
    startCoordinate?: [number, number],
    endCoordinate?: [number, number]
  ): Promise<BrowserToolResult> {
    const start = startCoordinate || this.cursorPosition;
    if (!endCoordinate) {
      return { success: false, error: "End coordinate required for drag" };
    }

    await this.page!.mouse.move(start[0], start[1]);
    await this.page!.mouse.down();
    await this.page!.mouse.move(endCoordinate[0], endCoordinate[1]);
    await this.page!.mouse.up();
    this.cursorPosition = endCoordinate;

    const screenshot = await this.captureScreenshot();
    return { success: true, screenshot };
  }

  private async handleType(text?: string): Promise<BrowserToolResult> {
    if (!text) {
      return { success: false, error: "Text required for type action" };
    }

    await this.page!.keyboard.type(text, { delay: 50 });

    const screenshot = await this.captureScreenshot();
    return { success: true, screenshot };
  }

  private async handleKey(text?: string): Promise<BrowserToolResult> {
    if (!text) {
      return { success: false, error: "Key required for key action" };
    }

    // Handle key combinations like "ctrl+c" or "ctrl+shift+a"
    const keys = this.parseKeySequence(text);

    for (const key of keys) {
      if (key.includes("+")) {
        // Key combination
        const parts = key.split("+");
        const modifiers: string[] = [];
        let mainKey = "";

        for (const part of parts) {
          const normalizedPart = part.toLowerCase();
          if (["ctrl", "control", "meta", "alt", "shift"].includes(normalizedPart)) {
            modifiers.push(normalizedPart === "ctrl" ? "Control" :
                          normalizedPart === "meta" ? "Meta" :
                          normalizedPart.charAt(0).toUpperCase() + normalizedPart.slice(1));
          } else {
            mainKey = KEY_MAP[part] || part;
          }
        }

        // Press modifiers
        for (const mod of modifiers) {
          await this.page!.keyboard.down(mod);
        }

        // Press main key
        await this.page!.keyboard.press(mainKey);

        // Release modifiers in reverse order
        for (const mod of modifiers.reverse()) {
          await this.page!.keyboard.up(mod);
        }
      } else {
        // Single key
        const mappedKey = KEY_MAP[key] || key;
        await this.page!.keyboard.press(mappedKey);
      }
    }

    const screenshot = await this.captureScreenshot();
    return { success: true, screenshot };
  }

  private parseKeySequence(text: string): string[] {
    // Handle space-separated key sequences
    return text.split(" ").filter(Boolean);
  }
}
