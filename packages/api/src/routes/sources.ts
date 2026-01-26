import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getDatabase,
  SourceHealthRepository,
  SourceFetchLogRepository,
  PatternRepository,
} from "@orbit/db";

export const sourcesRoutes = new Hono();

// Get source health summary
sourcesRoutes.get("/health/summary", async (c) => {
  try {
    const db = getDatabase();
    const repo = new SourceHealthRepository(db);

    const summary = await repo.getHealthSummary();

    return c.json({ data: summary });
  } catch (error) {
    console.error("Error getting health summary:", error);
    return c.json({
      error: {
        code: "SUMMARY_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// List all source health records
const listHealthQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  healthStatus: z.enum(["healthy", "degraded", "unhealthy", "unknown"]).optional(),
});

sourcesRoutes.get("/health", zValidator("query", listHealthQuerySchema), async (c) => {
  const { limit, offset, healthStatus } = c.req.valid("query");

  const db = getDatabase();
  const repo = new SourceHealthRepository(db);

  const result = await repo.findMany({ limit, offset });

  // Filter by health status if specified
  let data = result.data;
  if (healthStatus) {
    data = data.filter(s => s.healthStatus === healthStatus);
  }

  return c.json({
    data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

// Get degraded sources
sourcesRoutes.get("/health/degraded", async (c) => {
  const db = getDatabase();
  const repo = new SourceHealthRepository(db);

  const degraded = await repo.findDegraded();

  return c.json({ data: degraded });
});

// Get sources with active alerts
sourcesRoutes.get("/health/alerts", async (c) => {
  const db = getDatabase();
  const repo = new SourceHealthRepository(db);

  const withAlerts = await repo.findWithActiveAlerts();

  return c.json({ data: withAlerts });
});

// Initialize source health records from existing patterns
// NOTE: This must come BEFORE /health/:domain to avoid matching "initialize-from-patterns" as a domain
sourcesRoutes.post("/health/initialize-from-patterns", async (c) => {
  try {
    const db = getDatabase();
    const patternRepo = new PatternRepository(db);
    const healthRepo = new SourceHealthRepository(db);

    // Get all patterns
    const patterns = await patternRepo.findByFilters({}, { limit: 1000, offset: 0 });

  // Extract unique domains from pattern sources
  const domains = new Set<string>();
  for (const pattern of patterns.data) {
    const sources = pattern.sources as Array<{ url?: string }> | undefined;
    if (sources && Array.isArray(sources)) {
      for (const source of sources) {
        if (source.url) {
          try {
            const url = new URL(source.url);
            domains.add(url.hostname.replace(/^www\./, ""));
          } catch {
            // Skip invalid URLs
          }
        }
      }
    }
  }

  // Create health records for domains that don't have one
  let created = 0;
  let existing = 0;

  for (const domain of domains) {
    const existingHealth = await healthRepo.findByDomain(domain);
    if (existingHealth) {
      existing++;
      continue;
    }

    // Create a placeholder health record
    const healthId = `health_${domain.replace(/[^a-zA-Z0-9]/g, "_")}`;
    await healthRepo.create({
      id: healthId,
      domain,
      healthStatus: "unknown",
      successRate: null,
      totalFetches: 0,
      failedFetches: 0,
      successfulFetches: 0,
      avgResponseTimeMs: null,
      p95ResponseTimeMs: null,
      minResponseTimeMs: null,
      maxResponseTimeMs: null,
      errorsByType: {},
      baseReliability: 0.7, // Default reliability
      dynamicReliability: null,
      reliabilityConfidence: 0,
      totalVerifications: 0,
      corroboratedCount: 0,
      contestedCount: 0,
      alertActive: false,
      alertReason: null,
      alertSince: null,
      windowStartAt: new Date(),
      windowDays: 7,
      lastFetchAt: null,
      lastCalculatedAt: new Date(),
      createdAt: new Date(),
    });
    created++;
  }

    return c.json({
      data: {
        domainsFound: domains.size,
        created,
        existing,
      },
    });
  } catch (error) {
    console.error("Error initializing sources from patterns:", error);
    return c.json({
      error: {
        code: "INITIALIZATION_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Get health for a specific domain
sourcesRoutes.get("/health/:domain", async (c) => {
  const domain = decodeURIComponent(c.req.param("domain"));

  const db = getDatabase();
  const repo = new SourceHealthRepository(db);

  const health = await repo.findByDomain(domain);

  if (!health) {
    return c.json({ error: { code: "NOT_FOUND", message: "Source health not found" } }, 404);
  }

  return c.json({ data: health });
});

// Get fetch logs for a domain
const listLogsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

sourcesRoutes.get("/health/:domain/logs", zValidator("query", listLogsQuerySchema), async (c) => {
  const domain = decodeURIComponent(c.req.param("domain"));
  const { limit, offset } = c.req.valid("query");

  const db = getDatabase();
  const logRepo = new SourceFetchLogRepository(db);

  const result = await logRepo.findByDomain(domain, { limit, offset });

  return c.json({
    data: result.data,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

// Recalculate health for a domain
sourcesRoutes.post("/health/:domain/recalculate", async (c) => {
  const domain = decodeURIComponent(c.req.param("domain"));

  const db = getDatabase();
  const repo = new SourceHealthRepository(db);

  try {
    const health = await repo.recalculateHealth(domain);

    if (!health) {
      return c.json({ error: { code: "NOT_FOUND", message: "No data for domain" } }, 404);
    }

    return c.json({ data: health });
  } catch (error) {
    return c.json({
      error: {
        code: "CALCULATION_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});
