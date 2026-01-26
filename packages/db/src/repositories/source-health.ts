import { eq, desc, and, gte, sql } from "drizzle-orm";
import {
  sourceFetchLogs,
  sourceHealth,
  sourceReliabilityHistory,
  type SourceFetchLogRow,
  type NewSourceFetchLogRow,
  type SourceHealthRow,
  type NewSourceHealthRow,
  type SourceReliabilityHistoryRow,
  type NewSourceReliabilityHistoryRow,
} from "../schema/source-health.js";
import { BaseRepository, type ListOptions, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface FetchLogOptions {
  status?: string;
  httpStatusCode?: number;
  responseTimeMs?: number;
  contentLength?: number;
  error?: string;
  errorType?: string;
  jobId?: string;
  agentId?: string;
}

export class SourceFetchLogRepository extends BaseRepository<
  typeof sourceFetchLogs,
  SourceFetchLogRow,
  NewSourceFetchLogRow
> {
  constructor(db: Database) {
    super(db, sourceFetchLogs, "id");
  }

  async findByDomain(
    domain: string,
    options: ListOptions = {}
  ): Promise<PaginatedResult<SourceFetchLogRow>> {
    const { limit = 50, offset = 0 } = options;

    const data = await this.db
      .select()
      .from(sourceFetchLogs)
      .where(eq(sourceFetchLogs.domain, domain))
      .orderBy(desc(sourceFetchLogs.fetchedAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(sourceFetchLogs)
      .where(eq(sourceFetchLogs.domain, domain));

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  async getRecentByDomain(
    domain: string,
    days: number = 7
  ): Promise<SourceFetchLogRow[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return this.db
      .select()
      .from(sourceFetchLogs)
      .where(
        and(
          eq(sourceFetchLogs.domain, domain),
          gte(sourceFetchLogs.fetchedAt, cutoff)
        )
      )
      .orderBy(desc(sourceFetchLogs.fetchedAt));
  }

  async logFetch(
    url: string,
    status: "success" | "timeout" | "http_error" | "network_error" | "blocked" | "rate_limited",
    options: FetchLogOptions = {}
  ): Promise<SourceFetchLogRow> {
    const domain = extractDomain(url);
    const id = `fetch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    return this.create({
      id,
      domain,
      url,
      fetchedAt: new Date(),
      status,
      httpStatusCode: options.httpStatusCode ?? null,
      responseTimeMs: options.responseTimeMs ?? null,
      contentLength: options.contentLength ?? null,
      error: options.error ?? null,
      errorType: options.errorType ?? null,
      jobId: options.jobId ?? null,
      agentId: options.agentId ?? null,
    });
  }

  async getUniqueDomains(days: number = 7): Promise<string[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const results = await this.db
      .selectDistinct({ domain: sourceFetchLogs.domain })
      .from(sourceFetchLogs)
      .where(gte(sourceFetchLogs.fetchedAt, cutoff));

    return results.map((r) => r.domain);
  }
}

export class SourceHealthRepository extends BaseRepository<
  typeof sourceHealth,
  SourceHealthRow,
  NewSourceHealthRow
> {
  constructor(db: Database) {
    super(db, sourceHealth, "id");
  }

  async findByDomain(domain: string): Promise<SourceHealthRow | null> {
    const results = await this.db
      .select()
      .from(sourceHealth)
      .where(eq(sourceHealth.domain, domain))
      .limit(1);

    return results[0] ?? null;
  }

  async findDegraded(): Promise<SourceHealthRow[]> {
    return this.db
      .select()
      .from(sourceHealth)
      .where(
        sql`${sourceHealth.healthStatus} IN ('degraded', 'unhealthy')`
      )
      .orderBy(sourceHealth.successRate);
  }

  async findWithActiveAlerts(): Promise<SourceHealthRow[]> {
    return this.db
      .select()
      .from(sourceHealth)
      .where(eq(sourceHealth.alertActive, true))
      .orderBy(desc(sourceHealth.alertSince));
  }

  async upsert(data: NewSourceHealthRow): Promise<SourceHealthRow> {
    const existing = await this.findByDomain(data.domain);

    if (existing) {
      const results = await this.db
        .update(sourceHealth)
        .set({
          ...data,
          lastCalculatedAt: new Date(),
        })
        .where(eq(sourceHealth.id, existing.id))
        .returning();
      return results[0];
    }

    return this.create(data);
  }

  async recalculateHealth(domain: string, windowDays: number = 7): Promise<SourceHealthRow> {
    const fetchLogRepo = new SourceFetchLogRepository(this.db);
    const logs = await fetchLogRepo.getRecentByDomain(domain, windowDays);

    const totalFetches = logs.length;
    const successfulFetches = logs.filter((l) => l.status === "success").length;
    const failedFetches = totalFetches - successfulFetches;
    const successRate = totalFetches > 0 ? successfulFetches / totalFetches : null;

    // Calculate response time metrics for successful fetches
    const responseTimes = logs
      .filter((l) => l.status === "success" && l.responseTimeMs !== null)
      .map((l) => l.responseTimeMs!);

    const avgResponseTimeMs =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : null;

    const sortedTimes = [...responseTimes].sort((a, b) => a - b);
    const p95ResponseTimeMs =
      sortedTimes.length > 0
        ? sortedTimes[Math.floor(sortedTimes.length * 0.95)]
        : null;

    const minResponseTimeMs = sortedTimes.length > 0 ? sortedTimes[0] : null;
    const maxResponseTimeMs =
      sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : null;

    // Count errors by type
    const errorsByType: Record<string, number> = {};
    for (const log of logs) {
      if (log.status !== "success") {
        errorsByType[log.status] = (errorsByType[log.status] || 0) + 1;
      }
    }

    // Determine health status
    let healthStatus: "healthy" | "degraded" | "unhealthy" | "unknown";
    if (totalFetches < 5) {
      healthStatus = "unknown";
    } else if (successRate !== null && successRate >= 0.9) {
      healthStatus = "healthy";
    } else if (successRate !== null && successRate >= 0.7) {
      healthStatus = "degraded";
    } else {
      healthStatus = "unhealthy";
    }

    // Calculate dynamic reliability
    // Base: if success rate is high, reliability is high
    // Penalize for slow response times
    let dynamicReliability = successRate ?? 0.5;
    if (avgResponseTimeMs !== null && avgResponseTimeMs > 5000) {
      // Penalize slow sources
      dynamicReliability *= 0.9;
    }
    if (avgResponseTimeMs !== null && avgResponseTimeMs > 10000) {
      dynamicReliability *= 0.8;
    }

    // Calculate confidence based on sample size
    const reliabilityConfidence = Math.min(1, totalFetches / 20);

    // Determine if alert should be active
    const alertActive = healthStatus === "unhealthy";
    const alertReason = alertActive
      ? `Success rate dropped to ${((successRate ?? 0) * 100).toFixed(1)}%`
      : null;

    // Get existing record to preserve some fields
    const existing = await this.findByDomain(domain);
    const alertSince =
      alertActive && !existing?.alertActive
        ? new Date()
        : existing?.alertSince ?? null;

    const lastFetchAt = logs[0]?.fetchedAt ?? null;
    const windowStartAt = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const healthId = `health_${domain.replace(/[^a-zA-Z0-9]/g, "_")}`;

    return this.upsert({
      id: healthId,
      domain,
      healthStatus,
      successRate,
      totalFetches,
      failedFetches,
      successfulFetches,
      avgResponseTimeMs,
      p95ResponseTimeMs,
      minResponseTimeMs,
      maxResponseTimeMs,
      errorsByType,
      baseReliability: existing?.baseReliability ?? null,
      dynamicReliability,
      reliabilityConfidence,
      totalVerifications: existing?.totalVerifications ?? 0,
      corroboratedCount: existing?.corroboratedCount ?? 0,
      contestedCount: existing?.contestedCount ?? 0,
      alertActive,
      alertReason,
      alertSince,
      windowStartAt,
      windowDays,
      lastFetchAt,
      lastCalculatedAt: new Date(),
      createdAt: existing?.createdAt ?? new Date(),
    });
  }

  async getHealthSummary(): Promise<{
    totalSources: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
    activeAlerts: number;
  }> {
    const results = await this.db
      .select({
        healthStatus: sourceHealth.healthStatus,
        count: sql<number>`count(*)`,
      })
      .from(sourceHealth)
      .groupBy(sourceHealth.healthStatus);

    const summary = {
      totalSources: 0,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0,
      activeAlerts: 0,
    };

    for (const row of results) {
      const count = Number(row.count);
      summary.totalSources += count;
      if (row.healthStatus === "healthy") summary.healthy = count;
      if (row.healthStatus === "degraded") summary.degraded = count;
      if (row.healthStatus === "unhealthy") summary.unhealthy = count;
      if (row.healthStatus === "unknown") summary.unknown = count;
    }

    // Count active alerts
    const alertResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(sourceHealth)
      .where(eq(sourceHealth.alertActive, true));

    summary.activeAlerts = Number(alertResult[0]?.count ?? 0);

    return summary;
  }

  async recordReliabilitySnapshot(domain: string): Promise<void> {
    const health = await this.findByDomain(domain);
    if (!health) return;

    const historyRepo = new SourceReliabilityHistoryRepository(this.db);
    await historyRepo.create({
      id: `hist_${domain.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now().toString(36)}`,
      domain,
      recordedAt: new Date(),
      successRate: health.successRate,
      dynamicReliability: health.dynamicReliability,
      healthStatus: health.healthStatus,
      totalFetches: health.totalFetches,
      avgResponseTimeMs: health.avgResponseTimeMs,
    });
  }
}

export class SourceReliabilityHistoryRepository extends BaseRepository<
  typeof sourceReliabilityHistory,
  SourceReliabilityHistoryRow,
  NewSourceReliabilityHistoryRow
> {
  constructor(db: Database) {
    super(db, sourceReliabilityHistory, "id");
  }

  async findByDomain(
    domain: string,
    options: ListOptions = {}
  ): Promise<PaginatedResult<SourceReliabilityHistoryRow>> {
    const { limit = 50, offset = 0 } = options;

    const data = await this.db
      .select()
      .from(sourceReliabilityHistory)
      .where(eq(sourceReliabilityHistory.domain, domain))
      .orderBy(desc(sourceReliabilityHistory.recordedAt))
      .limit(limit)
      .offset(offset);

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(sourceReliabilityHistory)
      .where(eq(sourceReliabilityHistory.domain, domain));

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  async getRecentTrend(domain: string, days: number = 30): Promise<SourceReliabilityHistoryRow[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return this.db
      .select()
      .from(sourceReliabilityHistory)
      .where(
        and(
          eq(sourceReliabilityHistory.domain, domain),
          gte(sourceReliabilityHistory.recordedAt, cutoff)
        )
      )
      .orderBy(sourceReliabilityHistory.recordedAt);
  }
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
