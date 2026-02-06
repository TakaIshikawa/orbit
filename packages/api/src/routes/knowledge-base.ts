/**
 * Knowledge Base API Routes
 *
 * Exposes the accumulated knowledge base of information units
 * for querying, validation, and statistics.
 */

import { Hono } from "hono";
import { getDatabase, InformationUnitRepository } from "@orbit/db";
import { getKnowledgeBaseService } from "../services/knowledge-base.js";

const app = new Hono();

/**
 * GET /knowledge-base/stats
 * Get overall knowledge base statistics
 */
app.get("/stats", async (c) => {
  const kbService = getKnowledgeBaseService();
  const stats = await kbService.getStats();

  return c.json({ data: stats });
});

/**
 * GET /knowledge-base/high-falsifiability
 * Get high-falsifiability units that serve as the foundation of knowledge
 */
app.get("/high-falsifiability", async (c) => {
  const db = getDatabase();
  const repo = new InformationUnitRepository(db);

  const minFalsifiability = parseFloat(c.req.query("minFalsifiability") || "0.7");
  const limit = parseInt(c.req.query("limit") || "50");
  const domains = c.req.query("domains")?.split(",").filter(Boolean);

  const units = await repo.findHighFalsifiabilityUnits({
    minFalsifiability,
    limit,
    domains,
  });

  return c.json({
    data: units,
    meta: {
      total: units.length,
      minFalsifiability,
      domains: domains || [],
    },
  });
});

/**
 * GET /knowledge-base/search
 * Search knowledge base by domains and concepts
 */
app.get("/search", async (c) => {
  const db = getDatabase();
  const repo = new InformationUnitRepository(db);

  const domains = c.req.query("domains")?.split(",").filter(Boolean) || [];
  const concepts = c.req.query("concepts")?.split(",").filter(Boolean) || [];
  const minFalsifiability = parseFloat(c.req.query("minFalsifiability") || "0.5");
  const limit = parseInt(c.req.query("limit") || "30");
  const excludeIssueId = c.req.query("excludeIssueId");

  if (domains.length === 0 && concepts.length === 0) {
    return c.json({ error: "At least one domain or concept required" }, 400);
  }

  const units = await repo.findByDomainsAndConcepts({
    domains,
    concepts,
    minFalsifiability,
    limit,
    excludeIssueId,
  });

  return c.json({
    data: units,
    meta: {
      total: units.length,
      domains,
      concepts,
      minFalsifiability,
    },
  });
});

/**
 * GET /knowledge-base/unit/:unitId/relevant
 * Find historical units relevant to a specific unit
 */
app.get("/unit/:unitId/relevant", async (c) => {
  const db = getDatabase();
  const repo = new InformationUnitRepository(db);
  const unitId = c.req.param("unitId");

  const unit = await repo.findById(unitId);
  if (!unit) {
    return c.json({ error: "Unit not found" }, 404);
  }

  const limit = parseInt(c.req.query("limit") || "20");
  const minFalsifiability = parseFloat(c.req.query("minFalsifiability") || "0.6");

  const relevant = await repo.findRelevantHistoricalUnits(unit, {
    limit,
    minFalsifiability,
  });

  return c.json({
    data: relevant.map(({ unit, relevanceScore, domainOverlap, conceptOverlap }) => ({
      unit,
      relevanceScore,
      domainOverlap,
      conceptOverlap,
    })),
    meta: {
      sourceUnit: {
        id: unit.id,
        statement: unit.statement,
        granularityLevel: unit.granularityLevel,
        domains: unit.domains,
      },
      total: relevant.length,
    },
  });
});

/**
 * POST /knowledge-base/validate/:unitId
 * Validate a specific unit against the knowledge base
 */
app.post("/validate/:unitId", async (c) => {
  const db = getDatabase();
  const repo = new InformationUnitRepository(db);
  const kbService = getKnowledgeBaseService();
  const unitId = c.req.param("unitId");

  const unit = await repo.findById(unitId);
  if (!unit) {
    return c.json({ error: "Unit not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const maxComparisons = body.maxComparisons || 10;
  const minFalsifiability = body.minFalsifiability || 0.6;

  const result = await kbService.validateAgainstKnowledgeBase(unit, {
    maxComparisons,
    minFalsifiability,
  });

  return c.json({ data: result });
});

/**
 * POST /knowledge-base/validate-issue/:issueId
 * Validate all units for an issue against the knowledge base
 */
app.post("/validate-issue/:issueId", async (c) => {
  const kbService = getKnowledgeBaseService();
  const issueId = c.req.param("issueId");

  const body = await c.req.json().catch(() => ({}));
  const maxComparisonsPerUnit = body.maxComparisonsPerUnit || 5;
  const minFalsifiability = body.minFalsifiability || 0.6;

  const result = await kbService.validateIssueUnits(issueId, {
    maxComparisonsPerUnit,
    minFalsifiability,
  });

  return c.json({ data: result });
});

/**
 * GET /knowledge-base/cross-issue-comparisons/:issueId
 * Get cross-issue comparison stats for an issue
 */
app.get("/cross-issue-comparisons/:issueId", async (c) => {
  const db = getDatabase();
  const repo = new InformationUnitRepository(db);
  const issueId = c.req.param("issueId");

  const stats = await repo.getCrossIssueComparisonStats(issueId);

  return c.json({ data: stats });
});

/**
 * GET /knowledge-base/unit/:unitId/comparisons
 * Get all cross-issue comparisons for a unit
 */
app.get("/unit/:unitId/comparisons", async (c) => {
  const db = getDatabase();
  const repo = new InformationUnitRepository(db);
  const unitId = c.req.param("unitId");

  const comparisons = await repo.findCrossIssueComparisons(unitId);

  return c.json({ data: comparisons });
});

export { app as knowledgeBaseRoutes };
