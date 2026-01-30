import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getDatabase,
  SourceHealthRepository,
  SourceFetchLogRepository,
  PatternRepository,
  ManagedSourceRepository,
  SourceAssessmentHistoryRepository,
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

// ============================================
// MANAGED SOURCES ENDPOINTS
// ============================================

// Get managed sources statistics
sourcesRoutes.get("/managed/stats", async (c) => {
  try {
    const db = getDatabase();
    const repo = new ManagedSourceRepository(db);

    const statusStats = await repo.getStatsByStatus();
    const tierStats = await repo.getDebiasedTierStats();

    return c.json({
      data: {
        byStatus: statusStats,
        byDebiasedTier: tierStats,
        total: statusStats.active + statusStats.paused + statusStats.removed,
      },
    });
  } catch (error) {
    console.error("Error getting managed sources stats:", error);
    return c.json({
      error: {
        code: "STATS_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// List managed sources with filters
const listManagedQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  status: z.enum(["active", "paused", "removed"]).optional(),
  sourceType: z.string().optional(),
  incentiveType: z.string().optional(),
  minCredibility: z.coerce.number().min(0).max(1).optional(),
  minDebiasedScore: z.coerce.number().min(0).max(1).optional(),
  domain: z.string().optional(), // Subject domain (e.g., "economics")
  search: z.string().optional(),
});

sourcesRoutes.get("/managed", zValidator("query", listManagedQuerySchema), async (c) => {
  const { limit, offset, status, sourceType, incentiveType, minCredibility, minDebiasedScore, domain, search } = c.req.valid("query");

  const db = getDatabase();
  const repo = new ManagedSourceRepository(db);

  try {
    const result = await repo.findByFilters(
      { status, sourceType, incentiveType, minCredibility, minDebiasedScore, domain, search },
      { limit, offset }
    );

    return c.json({
      data: result.data,
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error) {
    console.error("Error listing managed sources:", error);
    return c.json({
      error: {
        code: "LIST_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Get debiased tier list
const tierQuerySchema = z.object({
  tier: z.coerce.number().min(1).max(3).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

sourcesRoutes.get("/managed/by-tier", zValidator("query", tierQuerySchema), async (c) => {
  const { tier, limit, offset } = c.req.valid("query");

  const db = getDatabase();
  const repo = new ManagedSourceRepository(db);

  // Tier boundaries: 1 = 70%+, 2 = 60-70%, 3 = 50-60%
  const minScores = { 1: 0.70, 2: 0.60, 3: 0.50 };
  const maxScores = { 1: undefined, 2: 0.70, 3: 0.60 };

  try {
    const result = await repo.findByDebiasedTier(
      minScores[tier as 1 | 2 | 3],
      maxScores[tier as 1 | 2 | 3],
      { limit, offset }
    );

    return c.json({
      data: result.data,
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        tier,
      },
    });
  } catch (error) {
    console.error("Error getting tier sources:", error);
    return c.json({
      error: {
        code: "TIER_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Create a new managed source
const createManagedSchema = z.object({
  domain: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  description: z.string().optional(),
  sourceType: z.enum(["research", "news", "government", "ngo", "think_tank", "industry", "aggregator", "preprint", "other"]).optional(),
  incentiveType: z.enum(["academic", "nonprofit", "commercial", "government", "advocacy", "wire_service", "aggregator", "platform", "independent"]).optional(),
  domains: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  assessment: z.object({
    factualAccuracy: z.number().min(0).max(1).optional(),
    methodologicalRigor: z.number().min(0).max(1).optional(),
    transparencyScore: z.number().min(0).max(1).optional(),
    independenceScore: z.number().min(0).max(1).optional(),
    ideologicalTransparency: z.number().min(0).max(1).optional(),
    fundingTransparency: z.number().min(0).max(1).optional(),
    conflictDisclosure: z.number().min(0).max(1).optional(),
    perspectiveDiversity: z.number().min(0).max(1).optional(),
    geographicNeutrality: z.number().min(0).max(1).optional(),
    temporalNeutrality: z.number().min(0).max(1).optional(),
    selectionBiasResistance: z.number().min(0).max(1).optional(),
    quantificationBias: z.number().min(0).max(1).optional(),
  }).optional(),
  assessedBy: z.string().optional(),
});

sourcesRoutes.post("/managed", zValidator("json", createManagedSchema), async (c) => {
  const input = c.req.valid("json");

  const db = getDatabase();
  const repo = new ManagedSourceRepository(db);

  try {
    // Check if domain already exists
    const existing = await repo.findByDomain(input.domain);
    if (existing) {
      return c.json({
        error: {
          code: "DUPLICATE",
          message: `Source with domain "${input.domain}" already exists`,
          existingId: existing.id,
        },
      }, 409);
    }

    const source = await repo.createSource(input);

    return c.json({ data: source }, 201);
  } catch (error) {
    console.error("Error creating managed source:", error);
    return c.json({
      error: {
        code: "CREATE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Get managed source by ID
sourcesRoutes.get("/managed/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new ManagedSourceRepository(db);

  try {
    const source = await repo.findById(id);

    if (!source) {
      return c.json({ error: { code: "NOT_FOUND", message: "Managed source not found" } }, 404);
    }

    return c.json({ data: source });
  } catch (error) {
    console.error("Error getting managed source:", error);
    return c.json({
      error: {
        code: "GET_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Get managed source by domain
sourcesRoutes.get("/managed/by-domain/:domain", async (c) => {
  const domain = decodeURIComponent(c.req.param("domain"));

  const db = getDatabase();
  const repo = new ManagedSourceRepository(db);

  try {
    const source = await repo.findByDomain(domain);

    if (!source) {
      return c.json({ error: { code: "NOT_FOUND", message: "Managed source not found" } }, 404);
    }

    return c.json({ data: source });
  } catch (error) {
    console.error("Error getting managed source by domain:", error);
    return c.json({
      error: {
        code: "GET_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Update source assessment
const updateAssessmentSchema = z.object({
  factualAccuracy: z.number().min(0).max(1).optional(),
  methodologicalRigor: z.number().min(0).max(1).optional(),
  transparencyScore: z.number().min(0).max(1).optional(),
  independenceScore: z.number().min(0).max(1).optional(),
  ideologicalTransparency: z.number().min(0).max(1).optional(),
  fundingTransparency: z.number().min(0).max(1).optional(),
  conflictDisclosure: z.number().min(0).max(1).optional(),
  perspectiveDiversity: z.number().min(0).max(1).optional(),
  geographicNeutrality: z.number().min(0).max(1).optional(),
  temporalNeutrality: z.number().min(0).max(1).optional(),
  selectionBiasResistance: z.number().min(0).max(1).optional(),
  quantificationBias: z.number().min(0).max(1).optional(),
  assessedBy: z.string().optional(),
  changeReason: z.string().optional(),
});

sourcesRoutes.patch("/managed/:id/assessment", zValidator("json", updateAssessmentSchema), async (c) => {
  const id = c.req.param("id");
  const { assessedBy, changeReason, ...assessment } = c.req.valid("json");

  const db = getDatabase();
  const repo = new ManagedSourceRepository(db);

  try {
    const updated = await repo.updateAssessment(id, assessment, assessedBy, changeReason);

    if (!updated) {
      return c.json({ error: { code: "NOT_FOUND", message: "Managed source not found" } }, 404);
    }

    return c.json({ data: updated });
  } catch (error) {
    console.error("Error updating assessment:", error);
    return c.json({
      error: {
        code: "UPDATE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Update source metadata (name, description, tags, etc.)
const updateMetadataSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  sourceType: z.enum(["research", "news", "government", "ngo", "think_tank", "industry", "aggregator", "preprint", "other"]).optional(),
  incentiveType: z.enum(["academic", "nonprofit", "commercial", "government", "advocacy", "wire_service", "aggregator", "platform", "independent"]).optional(),
  domains: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

sourcesRoutes.patch("/managed/:id", zValidator("json", updateMetadataSchema), async (c) => {
  const id = c.req.param("id");
  const updates = c.req.valid("json");

  const db = getDatabase();
  const repo = new ManagedSourceRepository(db);

  try {
    const updated = await repo.update(id, {
      ...updates,
      updatedAt: new Date(),
    });

    if (!updated) {
      return c.json({ error: { code: "NOT_FOUND", message: "Managed source not found" } }, 404);
    }

    return c.json({ data: updated });
  } catch (error) {
    console.error("Error updating managed source:", error);
    return c.json({
      error: {
        code: "UPDATE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Pause a source
sourcesRoutes.post("/managed/:id/pause", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new ManagedSourceRepository(db);

  try {
    const updated = await repo.pauseSource(id);

    if (!updated) {
      return c.json({ error: { code: "NOT_FOUND", message: "Managed source not found" } }, 404);
    }

    return c.json({ data: updated });
  } catch (error) {
    console.error("Error pausing source:", error);
    return c.json({
      error: {
        code: "PAUSE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Resume a paused source
sourcesRoutes.post("/managed/:id/resume", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new ManagedSourceRepository(db);

  try {
    const updated = await repo.resumeSource(id);

    if (!updated) {
      return c.json({ error: { code: "NOT_FOUND", message: "Managed source not found" } }, 404);
    }

    return c.json({ data: updated });
  } catch (error) {
    console.error("Error resuming source:", error);
    return c.json({
      error: {
        code: "RESUME_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Remove a source (soft delete)
sourcesRoutes.post("/managed/:id/remove", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new ManagedSourceRepository(db);

  try {
    const updated = await repo.removeSource(id);

    if (!updated) {
      return c.json({ error: { code: "NOT_FOUND", message: "Managed source not found" } }, 404);
    }

    return c.json({ data: updated });
  } catch (error) {
    console.error("Error removing source:", error);
    return c.json({
      error: {
        code: "REMOVE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Restore a removed source
sourcesRoutes.post("/managed/:id/restore", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new ManagedSourceRepository(db);

  try {
    const updated = await repo.restoreSource(id);

    if (!updated) {
      return c.json({ error: { code: "NOT_FOUND", message: "Managed source not found" } }, 404);
    }

    return c.json({ data: updated });
  } catch (error) {
    console.error("Error restoring source:", error);
    return c.json({
      error: {
        code: "RESTORE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Get assessment history for a source
const historyQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});

sourcesRoutes.get("/managed/:id/history", zValidator("query", historyQuerySchema), async (c) => {
  const id = c.req.param("id");
  const { limit, offset } = c.req.valid("query");

  const db = getDatabase();
  const historyRepo = new SourceAssessmentHistoryRepository(db);

  try {
    const result = await historyRepo.findBySourceId(id, { limit, offset });

    return c.json({
      data: result.data,
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error) {
    console.error("Error getting assessment history:", error);
    return c.json({
      error: {
        code: "HISTORY_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});

// Hard delete (only for removed sources, permanent)
sourcesRoutes.delete("/managed/:id", async (c) => {
  const id = c.req.param("id");

  const db = getDatabase();
  const repo = new ManagedSourceRepository(db);

  try {
    const source = await repo.findById(id);
    if (!source) {
      return c.json({ error: { code: "NOT_FOUND", message: "Managed source not found" } }, 404);
    }

    if (source.status !== "removed") {
      return c.json({
        error: {
          code: "INVALID_STATE",
          message: "Source must be removed before permanent deletion. Use POST /managed/:id/remove first.",
        },
      }, 400);
    }

    const deleted = await repo.delete(id);

    return c.json({ data: { deleted, id } });
  } catch (error) {
    console.error("Error deleting source:", error);
    return c.json({
      error: {
        code: "DELETE_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
    }, 500);
  }
});
