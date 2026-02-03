import { eq, sql, and, or } from "drizzle-orm";
import {
  referenceClasses,
  type ReferenceClassRow,
  type NewReferenceClassRow,
} from "../schema/reference-classes.js";
import { BaseRepository, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export class ReferenceClassRepository extends BaseRepository<
  typeof referenceClasses,
  ReferenceClassRow,
  NewReferenceClassRow
> {
  constructor(db: Database) {
    super(db, referenceClasses, "id");
  }

  /**
   * Find all reference classes
   */
  async findAll(): Promise<ReferenceClassRow[]> {
    return this.db.select().from(referenceClasses);
  }

  /**
   * Find reference class by name
   */
  async findByName(name: string): Promise<ReferenceClassRow | null> {
    const results = await this.db
      .select()
      .from(referenceClasses)
      .where(eq(referenceClasses.name, name))
      .limit(1);
    return results[0] ?? null;
  }

  /**
   * Find the best matching reference class for given domains and pattern types.
   * Prioritizes matches by:
   * 1. Most domain overlap
   * 2. Most pattern type overlap
   * Falls back to 'default' if no match found.
   */
  async findBestMatch(
    domains: string[],
    patternTypes: string[]
  ): Promise<ReferenceClassRow | null> {
    const allClasses = await this.findAll();

    if (allClasses.length === 0) {
      return null;
    }

    // Score each reference class by overlap
    const scored = allClasses.map((rc) => {
      const rcDomains = rc.domains as string[];
      const rcPatternTypes = rc.patternTypes as string[];

      // Count overlapping domains
      const domainOverlap = domains.filter((d) =>
        rcDomains.some((rcd) => rcd.toLowerCase() === d.toLowerCase())
      ).length;

      // Count overlapping pattern types
      const patternOverlap = patternTypes.filter((p) =>
        rcPatternTypes.some((rcp) => rcp.toLowerCase() === p.toLowerCase())
      ).length;

      // Combined score (domains weighted higher)
      const score = domainOverlap * 2 + patternOverlap;

      return { referenceClass: rc, score, domainOverlap, patternOverlap };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return best match if score > 0, otherwise default
    if (scored[0].score > 0) {
      return scored[0].referenceClass;
    }

    // Find default
    const defaultClass = allClasses.find((rc) => rc.name === "Default");
    return defaultClass ?? allClasses[0];
  }

  /**
   * Update base rates for a reference class based on new evidence.
   * Increments alpha for success, beta for failure.
   */
  async updateBaseRates(
    id: string,
    field: "pReal" | "pSolvable",
    success: boolean
  ): Promise<ReferenceClassRow | null> {
    const rc = await this.findById(id);
    if (!rc) return null;

    const alphaCol = field === "pReal" ? "pRealAlpha" : "pSolvableAlpha";
    const betaCol = field === "pReal" ? "pRealBeta" : "pSolvableBeta";
    const sampleCol = field === "pReal" ? "pRealSampleSize" : "pSolvableSampleSize";

    const currentAlpha = field === "pReal" ? rc.pRealAlpha : rc.pSolvableAlpha;
    const currentBeta = field === "pReal" ? rc.pRealBeta : rc.pSolvableBeta;
    const currentSampleSize = field === "pReal" ? rc.pRealSampleSize : rc.pSolvableSampleSize;

    // Update: success adds to alpha, failure adds to beta
    const updateData: Partial<NewReferenceClassRow> = {
      updatedAt: new Date(),
    };

    if (field === "pReal") {
      updateData.pRealAlpha = success ? currentAlpha + 1 : currentAlpha;
      updateData.pRealBeta = success ? currentBeta : currentBeta + 1;
      updateData.pRealSampleSize = currentSampleSize + 1;
    } else {
      updateData.pSolvableAlpha = success ? currentAlpha + 1 : currentAlpha;
      updateData.pSolvableBeta = success ? currentBeta : currentBeta + 1;
      updateData.pSolvableSampleSize = currentSampleSize + 1;
    }

    return this.update(id, updateData);
  }

  /**
   * Get the mean probability for a reference class field
   */
  getMean(rc: ReferenceClassRow, field: "pReal" | "pSolvable"): number {
    if (field === "pReal") {
      return rc.pRealAlpha / (rc.pRealAlpha + rc.pRealBeta);
    }
    return rc.pSolvableAlpha / (rc.pSolvableAlpha + rc.pSolvableBeta);
  }

  /**
   * Get the confidence (based on sample size) for a reference class field
   */
  getConfidence(rc: ReferenceClassRow, field: "pReal" | "pSolvable"): number {
    const sampleSize = field === "pReal" ? rc.pRealSampleSize : rc.pSolvableSampleSize;
    // Confidence asymptotes to 1 as sample size increases
    // At 20 samples, confidence is ~0.95
    return 1 - Math.exp(-sampleSize / 10);
  }
}
