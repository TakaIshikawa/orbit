import type { AgentRegistration, InvocationRequest, InvocationResult, Trigger } from "./types.js";
import { AgentRegistry } from "./registry.js";
import { AgentExecutor, type ExecutorOptions } from "./executor.js";

export interface SchedulerOptions extends ExecutorOptions {
  checkIntervalMs?: number;
}

export class AgentScheduler {
  private registry: AgentRegistry;
  private executor: AgentExecutor;
  private checkInterval: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private eventQueue: Array<{ type: string; data: Record<string, unknown> }> = [];

  constructor(options: SchedulerOptions = {}) {
    this.registry = new AgentRegistry(options.limits);
    this.executor = new AgentExecutor(this.registry, options);
    this.checkInterval = options.checkIntervalMs ?? 60000; // 1 minute default
  }

  getRegistry(): AgentRegistry {
    return this.registry;
  }

  getExecutor(): AgentExecutor {
    return this.executor;
  }

  start(): void {
    if (this.intervalId) {
      return; // Already running
    }

    this.intervalId = setInterval(() => {
      this.tick();
    }, this.checkInterval);

    // Run immediately
    this.tick();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    // Check for expired agents
    this.registry.checkExpired();

    // Process event queue
    this.processEventQueue();

    // Check cron triggers (simplified - in production use a proper cron parser)
    this.checkCronTriggers();
  }

  private processEventQueue(): void {
    const events = this.eventQueue.splice(0);

    for (const event of events) {
      const agents = this.registry.getActive();

      for (const agent of agents) {
        for (const trigger of agent.triggers) {
          if (trigger.type === "event" && trigger.eventType === event.type) {
            // Check filter if present
            if (trigger.filter) {
              const matches = Object.entries(trigger.filter).every(
                ([key, value]) => event.data[key] === value
              );
              if (!matches) continue;
            }

            // Queue invocation
            this.invokeAsync(agent.id, trigger, event.data);
          }
        }
      }
    }
  }

  private checkCronTriggers(): void {
    const now = new Date();
    const agents = this.registry.getActive();

    for (const agent of agents) {
      for (const trigger of agent.triggers) {
        if (trigger.type === "cron") {
          // Simplified cron check - in production use node-cron or similar
          if (this.shouldRunCron(trigger.schedule, trigger.lastRun, now)) {
            trigger.lastRun = now.toISOString();
            this.invokeAsync(agent.id, trigger, {});
          }
        }
      }
    }
  }

  private shouldRunCron(schedule: string, lastRun: string | undefined, now: Date): boolean {
    // Simplified: support basic intervals like "@hourly", "@daily", "@every_5m"
    if (!lastRun) return true;

    const lastRunTime = new Date(lastRun).getTime();
    const elapsed = now.getTime() - lastRunTime;

    switch (schedule) {
      case "@hourly":
        return elapsed >= 60 * 60 * 1000;
      case "@daily":
        return elapsed >= 24 * 60 * 60 * 1000;
      case "@every_5m":
        return elapsed >= 5 * 60 * 1000;
      case "@every_15m":
        return elapsed >= 15 * 60 * 1000;
      case "@every_30m":
        return elapsed >= 30 * 60 * 1000;
      default:
        // For standard cron expressions, would need a parser
        return false;
    }
  }

  private async invokeAsync(
    registrationId: string,
    trigger: Trigger,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.executor.invoke({
        registrationId,
        trigger,
        payload,
      });
    } catch (error) {
      console.error(`Failed to invoke agent ${registrationId}:`, error);
    }
  }

  // Public API for manual invocation
  async invoke(registrationId: string, payload: Record<string, unknown> = {}): Promise<InvocationResult> {
    const registration = this.registry.get(registrationId);
    if (!registration) {
      throw new Error(`Agent ${registrationId} not found`);
    }

    return this.executor.invoke({
      registrationId,
      trigger: { type: "manual", invokedBy: "api" },
      payload,
    });
  }

  // Public API for emitting events
  emit(eventType: string, data: Record<string, unknown> = {}): void {
    this.eventQueue.push({ type: eventType, data });
  }

  // Public API for registering agents
  register(
    owner: string,
    agentType: AgentRegistration["agentType"],
    options: {
      config?: Record<string, unknown>;
      triggers?: Trigger[];
      parentId?: string;
    } = {}
  ): AgentRegistration {
    return this.registry.register({
      owner,
      agentType,
      ...options,
    });
  }
}
