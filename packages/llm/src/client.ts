import { z } from "zod";
import type {
  Provider,
  LLMProvider,
  Message,
  CompletionOptions,
  CompletionResult,
  StructuredCompletionOptions,
  StructuredCompletionResult,
} from "./types.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenAIProvider } from "./providers/openai.js";
import { GroqProvider } from "./providers/groq.js";

export interface LLMClientConfig {
  defaultProvider?: Provider;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  groqApiKey?: string;
}

export class LLMClient {
  private providers: Map<Provider, LLMProvider> = new Map();
  private defaultProvider: Provider;

  constructor(config: LLMClientConfig = {}) {
    this.defaultProvider = config.defaultProvider ?? "anthropic";

    // Initialize providers lazily
    if (config.anthropicApiKey || process.env.ANTHROPIC_API_KEY) {
      this.providers.set("anthropic", new AnthropicProvider(config.anthropicApiKey));
    }

    if (config.openaiApiKey || process.env.OPENAI_API_KEY) {
      this.providers.set("openai", new OpenAIProvider(config.openaiApiKey));
    }

    if (config.groqApiKey || process.env.GROQ_API_KEY) {
      this.providers.set("groq", new GroqProvider(config.groqApiKey));
    }
  }

  private getProvider(provider?: Provider): LLMProvider {
    const p = provider ?? this.defaultProvider;
    const instance = this.providers.get(p);

    if (!instance) {
      throw new Error(
        `Provider "${p}" is not configured. Please provide an API key for this provider.`
      );
    }

    return instance;
  }

  async complete(
    messages: Message[],
    options: CompletionOptions & { provider?: Provider } = {}
  ): Promise<CompletionResult> {
    const { provider, ...completionOptions } = options;
    return this.getProvider(provider).complete(messages, completionOptions);
  }

  async completeStructured<T extends z.ZodType>(
    messages: Message[],
    options: StructuredCompletionOptions<T> & { provider?: Provider }
  ): Promise<StructuredCompletionResult<z.infer<T>>> {
    const { provider, ...completionOptions } = options;
    return this.getProvider(provider).completeStructured(messages, completionOptions);
  }

  hasProvider(provider: Provider): boolean {
    return this.providers.has(provider);
  }

  listProviders(): Provider[] {
    return Array.from(this.providers.keys());
  }
}

let defaultClient: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!defaultClient) {
    defaultClient = new LLMClient();
  }
  return defaultClient;
}

export function setLLMClient(client: LLMClient): void {
  defaultClient = client;
}
