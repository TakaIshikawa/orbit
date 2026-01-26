/**
 * Screenshot Manager
 *
 * Handles screenshot storage, conversion, and cleanup.
 */

import { mkdir, writeFile, readdir, unlink, rm } from "fs/promises";
import { join } from "path";

export interface ScreenshotRecord {
  path: string;
  base64: string;
  timestamp: Date;
  stepNumber: number;
}

export class ScreenshotManager {
  private baseDir: string;
  private sessionDir: string | null = null;
  private sessionId: string | null = null;

  constructor(baseDir: string = "./screenshots") {
    this.baseDir = baseDir;
  }

  async initSession(sessionId: string): Promise<string> {
    this.sessionId = sessionId;
    this.sessionDir = join(this.baseDir, sessionId);

    await mkdir(this.sessionDir, { recursive: true });

    return this.sessionDir;
  }

  async save(
    buffer: Buffer,
    stepNumber: number,
    prefix: string = "step"
  ): Promise<ScreenshotRecord> {
    if (!this.sessionDir || !this.sessionId) {
      throw new Error("Session not initialized");
    }

    const timestamp = new Date();
    const filename = `${prefix}_${stepNumber.toString().padStart(4, "0")}_${timestamp.getTime()}.png`;
    const path = join(this.sessionDir, filename);

    await writeFile(path, buffer);

    const base64 = buffer.toString("base64");

    return {
      path,
      base64,
      timestamp,
      stepNumber,
    };
  }

  bufferToBase64(buffer: Buffer): string {
    return buffer.toString("base64");
  }

  base64ToBuffer(base64: string): Buffer {
    return Buffer.from(base64, "base64");
  }

  async cleanupSession(sessionId: string): Promise<void> {
    const sessionDir = join(this.baseDir, sessionId);

    try {
      await rm(sessionDir, { recursive: true, force: true });
    } catch {
      // Directory may not exist
    }
  }

  async cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    let cleaned = 0;

    try {
      const entries = await readdir(this.baseDir, { withFileTypes: true });
      const now = Date.now();

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionDir = join(this.baseDir, entry.name);

          try {
            const files = await readdir(sessionDir);

            if (files.length === 0) {
              // Empty session directory
              await rm(sessionDir, { recursive: true });
              cleaned++;
              continue;
            }

            // Check the timestamp of the latest file
            let latestTime = 0;
            for (const file of files) {
              const match = file.match(/_(\d+)\.png$/);
              if (match) {
                const fileTime = parseInt(match[1]);
                if (fileTime > latestTime) {
                  latestTime = fileTime;
                }
              }
            }

            if (latestTime > 0 && now - latestTime > maxAgeMs) {
              await rm(sessionDir, { recursive: true });
              cleaned++;
            }
          } catch {
            // Skip problematic directories
          }
        }
      }
    } catch {
      // Base directory may not exist
    }

    return cleaned;
  }

  async listSessionScreenshots(sessionId: string): Promise<string[]> {
    const sessionDir = join(this.baseDir, sessionId);

    try {
      const files = await readdir(sessionDir);
      return files
        .filter((f) => f.endsWith(".png"))
        .sort()
        .map((f) => join(sessionDir, f));
    } catch {
      return [];
    }
  }

  getSessionDir(): string | null {
    return this.sessionDir;
  }
}
