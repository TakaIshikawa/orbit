import { generateId } from "@orbit/core";
import type { AgentRegistration, Trigger, StopCondition, RuntimeLimits } from "./types.js";
import { DEFAULT_LIMITS } from "./types.js";

export interface CreateAgentOptions {
  owner: string;
  parentId?: string;
  agentType: AgentRegistration["agentType"];
  config?: Record<string, unknown>;
  triggers?: Trigger[];
  stopConditions?: StopCondition[];
  maxInvocations?: number;
  maxChildren?: number;
  expiresInDays?: number;
}

export class AgentRegistry {
  private registrations: Map<string, AgentRegistration> = new Map();
  private userAgentCounts: Map<string, number> = new Map();
  private limits: RuntimeLimits;

  constructor(limits: Partial<RuntimeLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  register(options: CreateAgentOptions): AgentRegistration {
    const userCount = this.userAgentCounts.get(options.owner) ?? 0;
    if (userCount >= this.limits.maxAgentsPerUser) {
      throw new Error(
        `User ${options.owner} has reached max agents limit (${this.limits.maxAgentsPerUser})`
      );
    }

    const now = new Date();
    const expiresAt = options.expiresInDays
      ? new Date(now.getTime() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + this.limits.maxLifetimeDays * 24 * 60 * 60 * 1000);

    const registration: AgentRegistration = {
      id: generateId("agt"),
      owner: options.owner,
      parentId: options.parentId ?? null,
      agentType: options.agentType,
      config: options.config ?? {},
      triggers: options.triggers ?? [],
      stopConditions: options.stopConditions ?? [],
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "active",
      maxInvocations: options.maxInvocations ?? this.limits.maxInvocationsDefault,
      invocationCount: 0,
      maxChildren: options.maxChildren ?? this.limits.maxChildrenPerAgent,
      children: [],
      lastInvokedAt: null,
      lastResult: null,
    };

    this.registrations.set(registration.id, registration);
    this.userAgentCounts.set(options.owner, userCount + 1);

    // Link to parent if specified
    if (options.parentId) {
      const parent = this.registrations.get(options.parentId);
      if (parent) {
        if (parent.children.length >= parent.maxChildren) {
          throw new Error(
            `Parent agent ${options.parentId} has reached max children limit (${parent.maxChildren})`
          );
        }
        parent.children.push(registration.id);
      }
    }

    return registration;
  }

  get(id: string): AgentRegistration | undefined {
    return this.registrations.get(id);
  }

  getByOwner(owner: string): AgentRegistration[] {
    return Array.from(this.registrations.values()).filter((r) => r.owner === owner);
  }

  getActive(): AgentRegistration[] {
    return Array.from(this.registrations.values()).filter((r) => r.status === "active");
  }

  updateStatus(id: string, status: AgentRegistration["status"]): void {
    const reg = this.registrations.get(id);
    if (reg) {
      reg.status = status;
    }
  }

  recordInvocation(id: string, result: "success" | "failure" | "timeout"): void {
    const reg = this.registrations.get(id);
    if (reg) {
      reg.invocationCount++;
      reg.lastInvokedAt = new Date().toISOString();
      reg.lastResult = result;

      // Check if max invocations reached
      if (reg.invocationCount >= reg.maxInvocations) {
        reg.status = "stopped";
      }
    }
  }

  checkExpired(): string[] {
    const now = new Date();
    const expired: string[] = [];

    for (const [id, reg] of this.registrations) {
      if (reg.status === "active" && reg.expiresAt && new Date(reg.expiresAt) <= now) {
        reg.status = "expired";
        expired.push(id);
      }
    }

    return expired;
  }

  stop(id: string): boolean {
    const reg = this.registrations.get(id);
    if (reg && reg.status === "active") {
      reg.status = "stopped";
      // Also stop children
      for (const childId of reg.children) {
        this.stop(childId);
      }
      return true;
    }
    return false;
  }

  delete(id: string): boolean {
    const reg = this.registrations.get(id);
    if (reg) {
      // Decrement user count
      const userCount = this.userAgentCounts.get(reg.owner) ?? 0;
      this.userAgentCounts.set(reg.owner, Math.max(0, userCount - 1));

      // Delete children first
      for (const childId of reg.children) {
        this.delete(childId);
      }

      this.registrations.delete(id);
      return true;
    }
    return false;
  }

  getLimits(): RuntimeLimits {
    return { ...this.limits };
  }
}
