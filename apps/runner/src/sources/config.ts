import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { SourceConfig } from "./fetcher.js";

export interface SourcesConfigFile {
  sources: SourceConfig[];
  schedule?: {
    cron: string;
    enabled: boolean;
  };
  defaults?: {
    domains?: string[];
    query?: string;
  };
}

export function loadSourcesConfig(filePath: string): SourcesConfigFile {
  const resolvedPath = resolve(process.cwd(), filePath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Sources config not found: ${resolvedPath}`);
  }

  const content = readFileSync(resolvedPath, "utf-8");
  const config = JSON.parse(content) as SourcesConfigFile;

  // Validate
  if (!config.sources || !Array.isArray(config.sources)) {
    throw new Error("Invalid config: 'sources' must be an array");
  }

  for (const source of config.sources) {
    if (!source.url) {
      throw new Error("Invalid source: missing 'url'");
    }
    if (!source.type) {
      source.type = "observation";
    }
  }

  return config;
}
