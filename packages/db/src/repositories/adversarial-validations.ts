import { eq, and, desc, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import {
  adversarialValidations,
  validationSessions,
  type AdversarialValidationRow,
  type NewAdversarialValidationRow,
  type ValidationSessionRow,
  type NewValidationSessionRow,
} from "../schema/adversarial-validations.js";

export class AdversarialValidationRepository {
  constructor(private db: Database) {}

  // ==========================================================================
  // ADVERSARIAL VALIDATIONS (Individual Challenges)
  // ==========================================================================

  async createChallenge(
    data: NewAdversarialValidationRow
  ): Promise<AdversarialValidationRow> {
    const [challenge] = await this.db
      .insert(adversarialValidations)
      .values(data)
      .returning();

    return challenge;
  }

  async createChallenges(
    challenges: NewAdversarialValidationRow[]
  ): Promise<AdversarialValidationRow[]> {
    if (challenges.length === 0) return [];

    return this.db
      .insert(adversarialValidations)
      .values(challenges)
      .returning();
  }

  async findChallengeById(
    id: string
  ): Promise<AdversarialValidationRow | undefined> {
    const [challenge] = await this.db
      .select()
      .from(adversarialValidations)
      .where(eq(adversarialValidations.id, id));

    return challenge;
  }

  async findChallengesByEntity(
    entityType: string,
    entityId: string
  ): Promise<AdversarialValidationRow[]> {
    return this.db
      .select()
      .from(adversarialValidations)
      .where(
        and(
          eq(adversarialValidations.entityType, entityType),
          eq(adversarialValidations.entityId, entityId)
        )
      )
      .orderBy(
        desc(
          sql`CASE ${adversarialValidations.severity}
            WHEN 'critical' THEN 4
            WHEN 'major' THEN 3
            WHEN 'moderate' THEN 2
            WHEN 'minor' THEN 1
          END`
        ),
        desc(adversarialValidations.createdAt)
      );
  }

  async findPendingChallenges(
    entityType?: string,
    entityId?: string
  ): Promise<AdversarialValidationRow[]> {
    let query = this.db
      .select()
      .from(adversarialValidations)
      .where(eq(adversarialValidations.resolution, "pending"));

    if (entityType && entityId) {
      query = this.db
        .select()
        .from(adversarialValidations)
        .where(
          and(
            eq(adversarialValidations.resolution, "pending"),
            eq(adversarialValidations.entityType, entityType),
            eq(adversarialValidations.entityId, entityId)
          )
        );
    }

    return query.orderBy(
      desc(
        sql`CASE ${adversarialValidations.severity}
          WHEN 'critical' THEN 4
          WHEN 'major' THEN 3
          WHEN 'moderate' THEN 2
          WHEN 'minor' THEN 1
        END`
      )
    );
  }

  async resolveChallenge(
    id: string,
    resolution: {
      resolution: "resolved" | "partially_resolved" | "unresolved" | "accepted";
      resolutionNotes: string;
      resolutionEvidence?: AdversarialValidationRow["resolutionEvidence"];
      resolvedBy: string;
      confidenceImpact?: number;
      claimModified?: string;
    }
  ): Promise<AdversarialValidationRow> {
    const [updated] = await this.db
      .update(adversarialValidations)
      .set({
        ...resolution,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(adversarialValidations.id, id))
      .returning();

    return updated;
  }

  async getChallengeStats(
    entityType: string,
    entityId: string
  ): Promise<{
    total: number;
    bySeverity: Record<string, number>;
    byResolution: Record<string, number>;
    avgConfidenceImpact: number;
  }> {
    const challenges = await this.findChallengesByEntity(entityType, entityId);

    const bySeverity: Record<string, number> = {};
    const byResolution: Record<string, number> = {};
    let totalImpact = 0;
    let impactCount = 0;

    for (const c of challenges) {
      bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
      byResolution[c.resolution] = (byResolution[c.resolution] || 0) + 1;
      if (c.confidenceImpact !== null) {
        totalImpact += c.confidenceImpact;
        impactCount++;
      }
    }

    return {
      total: challenges.length,
      bySeverity,
      byResolution,
      avgConfidenceImpact: impactCount > 0 ? totalImpact / impactCount : 0,
    };
  }

  // ==========================================================================
  // VALIDATION SESSIONS
  // ==========================================================================

  async createSession(
    data: NewValidationSessionRow
  ): Promise<ValidationSessionRow> {
    const [session] = await this.db
      .insert(validationSessions)
      .values(data)
      .returning();

    return session;
  }

  async findSessionById(id: string): Promise<ValidationSessionRow | undefined> {
    const [session] = await this.db
      .select()
      .from(validationSessions)
      .where(eq(validationSessions.id, id));

    return session;
  }

  async findSessionsByEntity(
    entityType: string,
    entityId: string
  ): Promise<ValidationSessionRow[]> {
    return this.db
      .select()
      .from(validationSessions)
      .where(
        and(
          eq(validationSessions.entityType, entityType),
          eq(validationSessions.entityId, entityId)
        )
      )
      .orderBy(desc(validationSessions.createdAt));
  }

  async getLatestSession(
    entityType: string,
    entityId: string
  ): Promise<ValidationSessionRow | undefined> {
    const [session] = await this.db
      .select()
      .from(validationSessions)
      .where(
        and(
          eq(validationSessions.entityType, entityType),
          eq(validationSessions.entityId, entityId)
        )
      )
      .orderBy(desc(validationSessions.createdAt))
      .limit(1);

    return session;
  }

  async completeSession(
    id: string,
    result: {
      overallResult: "validated" | "needs_revision" | "rejected";
      confidenceAdjustment: number;
      summary: string;
    }
  ): Promise<ValidationSessionRow> {
    // First, get session to count challenges
    const session = await this.findSessionById(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    // Count challenge statistics
    const challengeIds = session.challengeIds || [];
    let criticalChallenges = 0;
    let majorChallenges = 0;
    let resolvedChallenges = 0;

    for (const challengeId of challengeIds) {
      const challenge = await this.findChallengeById(challengeId);
      if (challenge) {
        if (challenge.severity === "critical") criticalChallenges++;
        if (challenge.severity === "major") majorChallenges++;
        if (
          challenge.resolution === "resolved" ||
          challenge.resolution === "accepted"
        ) {
          resolvedChallenges++;
        }
      }
    }

    const [updated] = await this.db
      .update(validationSessions)
      .set({
        ...result,
        completedAt: new Date(),
        criticalChallenges,
        majorChallenges,
        resolvedChallenges,
      })
      .where(eq(validationSessions.id, id))
      .returning();

    return updated;
  }

  async addChallengeToSession(
    sessionId: string,
    challengeId: string
  ): Promise<ValidationSessionRow> {
    const session = await this.findSessionById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const challengeIds = [...(session.challengeIds || []), challengeId];

    const [updated] = await this.db
      .update(validationSessions)
      .set({ challengeIds })
      .where(eq(validationSessions.id, sessionId))
      .returning();

    return updated;
  }

  /**
   * Get full session with all its challenges
   */
  async getSessionWithChallenges(sessionId: string): Promise<{
    session: ValidationSessionRow;
    challenges: AdversarialValidationRow[];
  } | null> {
    const session = await this.findSessionById(sessionId);
    if (!session) return null;

    const challenges = await Promise.all(
      (session.challengeIds || []).map((id) => this.findChallengeById(id))
    );

    return {
      session,
      challenges: challenges.filter(
        (c): c is AdversarialValidationRow => c !== undefined
      ),
    };
  }

  /**
   * Check if an entity has passed validation
   */
  async hasPassedValidation(
    entityType: string,
    entityId: string
  ): Promise<boolean> {
    const latest = await this.getLatestSession(entityType, entityId);
    return latest?.overallResult === "validated";
  }
}
