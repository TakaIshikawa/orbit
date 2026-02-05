/**
 * Information Units API Routes
 *
 * Exposes decomposed information units, comparisons, and consistency data.
 */

import { Hono } from "hono";
import { getDatabase } from "@orbit/db";
import { InformationUnitRepository } from "@orbit/db";

const app = new Hono();

/**
 * GET /information-units
 * List all information units with optional filters
 */
app.get("/", async (c) => {
  const db = getDatabase();
  const repo = new InformationUnitRepository(db);

  const issueId = c.req.query("issueId");
  const sourceId = c.req.query("sourceId");
  const granularityLevel = c.req.query("level");
  const limit = parseInt(c.req.query("limit") || "50");

  let units;

  if (issueId) {
    units = await repo.findByIssue(issueId);
  } else if (sourceId) {
    units = await repo.findBySource(sourceId);
  } else if (granularityLevel) {
    units = await repo.findByGranularityLevel(granularityLevel, { limit });
  } else {
    // Return recent units across all
    units = await repo.findByGranularityLevel("observation", { limit });
  }

  return c.json({ data: units.slice(0, limit) });
});

/**
 * GET /information-units/:id
 * Get a specific information unit
 */
app.get("/:id", async (c) => {
  const db = getDatabase();
  const repo = new InformationUnitRepository(db);
  const id = c.req.param("id");

  const unit = await repo.findById(id);
  if (!unit) {
    return c.json({ error: "Unit not found" }, 404);
  }

  return c.json({ data: unit });
});

/**
 * GET /information-units/:id/comparisons
 * Get all comparisons involving a unit
 */
app.get("/:id/comparisons", async (c) => {
  const db = getDatabase();
  const repo = new InformationUnitRepository(db);
  const id = c.req.param("id");

  const comparisons = await repo.findComparisonsByUnit(id);

  return c.json({ data: comparisons });
});

/**
 * GET /information-units/issue/:issueId/summary
 * Get granularity breakdown and consistency for an issue
 */
app.get("/issue/:issueId/summary", async (c) => {
  const db = getDatabase();
  const repo = new InformationUnitRepository(db);
  const issueId = c.req.param("issueId");

  // Get unit counts by level
  const unitCountsByLevel = await repo.getUnitCountsByLevel(issueId);
  const confidenceByLevel = await repo.getConfidenceByLevel(issueId);
  const comparisonStats = await repo.getComparisonStats(issueId);
  const consistency = await repo.getConsistency("issue", issueId);

  // Get sample units at each level
  const units = await repo.findByIssue(issueId);
  const unitsByLevel: Record<string, typeof units> = {};
  for (const unit of units) {
    if (!unitsByLevel[unit.granularityLevel]) {
      unitsByLevel[unit.granularityLevel] = [];
    }
    if (unitsByLevel[unit.granularityLevel].length < 3) {
      unitsByLevel[unit.granularityLevel].push(unit);
    }
  }

  // Granularity level metadata
  const levelMeta = {
    paradigm: { name: "Paradigm", falsifiability: 0.1, description: "Worldviews, fundamental assumptions" },
    theory: { name: "Theory", falsifiability: 0.3, description: "Causal models, frameworks" },
    mechanism: { name: "Mechanism", falsifiability: 0.5, description: "How things work, pathways" },
    causal_claim: { name: "Causal Claim", falsifiability: 0.6, description: "If-then predictions" },
    statistical: { name: "Statistical", falsifiability: 0.8, description: "Correlations, distributions" },
    observation: { name: "Observation", falsifiability: 0.9, description: "Measured values, events" },
    data_point: { name: "Data Point", falsifiability: 0.95, description: "Raw data with source" },
  };

  // Build summary with all levels
  const granularityBreakdown = Object.entries(levelMeta).map(([level, meta]) => ({
    level,
    ...meta,
    unitCount: unitCountsByLevel[level] || 0,
    avgConfidence: confidenceByLevel[level] || null,
    sampleUnits: unitsByLevel[level] || [],
  }));

  return c.json({
    data: {
      issueId,
      totalUnits: Object.values(unitCountsByLevel).reduce((a, b) => a + b, 0),
      granularityBreakdown,
      comparisonStats,
      consistency: consistency ? {
        overall: consistency.overallConsistency,
        weighted: consistency.weightedConsistency,
        supportByLevel: consistency.supportByLevel,
        strongestSupport: consistency.strongestSupport,
        strongestChallenges: consistency.strongestChallenges,
        recommendedConfidenceUpdate: consistency.recommendedConfidenceUpdate,
        updateRationale: consistency.updateRationale,
      } : null,
    },
  });
});

/**
 * GET /information-units/contradictions
 * Get recent contradictions across all units
 */
app.get("/contradictions", async (c) => {
  const db = getDatabase();
  const repo = new InformationUnitRepository(db);
  const limit = parseInt(c.req.query("limit") || "20");

  const contradictions = await repo.findContradictions({ limit });

  // Enrich with unit details
  const enriched = await Promise.all(
    contradictions.map(async (comp) => {
      const unitA = await repo.findById(comp.unitAId);
      const unitB = await repo.findById(comp.unitBId);
      return {
        ...comp,
        unitA: unitA ? {
          id: unitA.id,
          statement: unitA.statement,
          sourceName: unitA.sourceName,
          granularityLevel: unitA.granularityLevel,
        } : null,
        unitB: unitB ? {
          id: unitB.id,
          statement: unitB.statement,
          sourceName: unitB.sourceName,
          granularityLevel: unitB.granularityLevel,
        } : null,
      };
    })
  );

  return c.json({ data: enriched });
});

export default app;
