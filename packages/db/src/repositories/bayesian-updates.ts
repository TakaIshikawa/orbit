import { eq, and, desc, gte, sql } from "drizzle-orm";
import {
  bayesianUpdates,
  type BayesianUpdateRow,
  type NewBayesianUpdateRow,
} from "../schema/bayesian-updates.js";
import { BaseRepository, type PaginatedResult } from "./base.js";
import type { Database } from "../client.js";

export interface RecordUpdateParams {
  id: string;
  entityType: "issue" | "reference_class";
  entityId: string;
  updateType: "p_real" | "p_solvable";
  priorAlpha: number;
  priorBeta: number;
  posteriorAlpha: number;
  posteriorBeta: number;
  evidenceType: "verification" | "outcome" | "manual" | "initial";
  evidenceId?: string;
  evidenceDirection: "positive" | "negative";
  reason: string;
}

export interface UpdateStats {
  totalUpdates: number;
  updatesByType: Record<string, number>;
  updatesByEvidence: Record<string, number>;
  avgDelta: number;
}

export class BayesianUpdateRepository extends BaseRepository<
  typeof bayesianUpdates,
  BayesianUpdateRow,
  NewBayesianUpdateRow
> {
  constructor(db: Database) {
    super(db, bayesianUpdates, "id");
  }

  /**
   * Record a Bayesian update
   */
  async recordUpdate(params: RecordUpdateParams): Promise<BayesianUpdateRow> {
    return this.create({
      id: params.id,
      entityType: params.entityType,
      entityId: params.entityId,
      updateType: params.updateType,
      priorAlpha: params.priorAlpha,
      priorBeta: params.priorBeta,
      posteriorAlpha: params.posteriorAlpha,
      posteriorBeta: params.posteriorBeta,
      evidenceType: params.evidenceType,
      evidenceId: params.evidenceId ?? null,
      evidenceDirection: params.evidenceDirection,
      reason: params.reason,
      createdAt: new Date(),
    });
  }

  /**
   * Find all updates for a specific entity
   */
  async findByEntity(
    entityType: "issue" | "reference_class",
    entityId: string
  ): Promise<BayesianUpdateRow[]> {
    return this.db
      .select()
      .from(bayesianUpdates)
      .where(
        and(
          eq(bayesianUpdates.entityType, entityType),
          eq(bayesianUpdates.entityId, entityId)
        )
      )
      .orderBy(desc(bayesianUpdates.createdAt));
  }

  /**
   * Find updates by evidence source
   */
  async findByEvidence(
    evidenceType: "verification" | "outcome" | "manual" | "initial",
    evidenceId: string
  ): Promise<BayesianUpdateRow[]> {
    return this.db
      .select()
      .from(bayesianUpdates)
      .where(
        and(
          eq(bayesianUpdates.evidenceType, evidenceType),
          eq(bayesianUpdates.evidenceId, evidenceId)
        )
      )
      .orderBy(desc(bayesianUpdates.createdAt));
  }

  /**
   * Get recent updates for an entity (last N updates)
   */
  async findRecentByEntity(
    entityType: "issue" | "reference_class",
    entityId: string,
    limit: number = 10
  ): Promise<BayesianUpdateRow[]> {
    return this.db
      .select()
      .from(bayesianUpdates)
      .where(
        and(
          eq(bayesianUpdates.entityType, entityType),
          eq(bayesianUpdates.entityId, entityId)
        )
      )
      .orderBy(desc(bayesianUpdates.createdAt))
      .limit(limit);
  }

  /**
   * Get statistics about updates over a time period
   */
  async getStats(days: number = 7): Promise<UpdateStats> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const updates = await this.db
      .select()
      .from(bayesianUpdates)
      .where(gte(bayesianUpdates.createdAt, cutoff));

    const updatesByType: Record<string, number> = {};
    const updatesByEvidence: Record<string, number> = {};
    let totalDelta = 0;

    for (const update of updates) {
      // Count by update type
      updatesByType[update.updateType] = (updatesByType[update.updateType] || 0) + 1;

      // Count by evidence type
      updatesByEvidence[update.evidenceType] = (updatesByEvidence[update.evidenceType] || 0) + 1;

      // Calculate mean delta
      const priorMean = update.priorAlpha / (update.priorAlpha + update.priorBeta);
      const posteriorMean = update.posteriorAlpha / (update.posteriorAlpha + update.posteriorBeta);
      totalDelta += Math.abs(posteriorMean - priorMean);
    }

    return {
      totalUpdates: updates.length,
      updatesByType,
      updatesByEvidence,
      avgDelta: updates.length > 0 ? totalDelta / updates.length : 0,
    };
  }
}
