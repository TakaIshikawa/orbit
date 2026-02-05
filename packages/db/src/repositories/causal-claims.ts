import { eq, and, desc, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import {
  causalClaims,
  causalChains,
  type CausalClaimRow,
  type NewCausalClaimRow,
  type CausalChainRow,
  type NewCausalChainRow,
} from "../schema/causal-claims.js";

/**
 * Evidence strength weights for scoring
 * Higher = stronger evidence
 */
const EVIDENCE_STRENGTH_WEIGHTS: Record<string, number> = {
  experimental: 1.0,
  quasi_experimental: 0.85,
  longitudinal: 0.75,
  cross_sectional: 0.6,
  case_control: 0.55,
  observational: 0.4,
  expert_consensus: 0.35,
  anecdotal: 0.2,
  theoretical: 0.15,
};

export class CausalClaimRepository {
  constructor(private db: Database) {}

  // ==========================================================================
  // CAUSAL CLAIMS
  // ==========================================================================

  async createClaim(data: NewCausalClaimRow): Promise<CausalClaimRow> {
    // Calculate evidence score based on strength and Hill criteria
    const evidenceScore = this.calculateEvidenceScore(data);

    const [claim] = await this.db
      .insert(causalClaims)
      .values({
        ...data,
        evidenceScore,
      })
      .returning();

    return claim;
  }

  async findClaimById(id: string): Promise<CausalClaimRow | undefined> {
    const [claim] = await this.db
      .select()
      .from(causalClaims)
      .where(eq(causalClaims.id, id));

    return claim;
  }

  async findClaimsByIssue(issueId: string): Promise<CausalClaimRow[]> {
    return this.db
      .select()
      .from(causalClaims)
      .where(eq(causalClaims.issueId, issueId))
      .orderBy(desc(causalClaims.evidenceScore));
  }

  async findClaimsByStrength(
    minStrength: string,
    limit = 50
  ): Promise<CausalClaimRow[]> {
    const strengthOrder = Object.keys(EVIDENCE_STRENGTH_WEIGHTS);
    const minIndex = strengthOrder.indexOf(minStrength);

    if (minIndex === -1) {
      throw new Error(`Invalid evidence strength: ${minStrength}`);
    }

    const validStrengths = strengthOrder.slice(0, minIndex + 1);

    return this.db
      .select()
      .from(causalClaims)
      .where(sql`${causalClaims.evidenceStrength} = ANY(${validStrengths})`)
      .orderBy(desc(causalClaims.evidenceScore))
      .limit(limit);
  }

  async updateClaim(
    id: string,
    data: Partial<Omit<CausalClaimRow, "id" | "createdAt">>
  ): Promise<CausalClaimRow> {
    // Recalculate evidence score if relevant fields changed
    let evidenceScore = data.evidenceScore;
    if (
      data.evidenceStrength ||
      data.hillCriteria ||
      data.counterfactualStatus
    ) {
      const existing = await this.findClaimById(id);
      if (existing) {
        evidenceScore = this.calculateEvidenceScore({
          ...existing,
          ...data,
        });
      }
    }

    const [updated] = await this.db
      .update(causalClaims)
      .set({
        ...data,
        evidenceScore,
        updatedAt: new Date(),
      })
      .where(eq(causalClaims.id, id))
      .returning();

    return updated;
  }

  async updateCounterfactualAnalysis(
    id: string,
    analysis: NonNullable<CausalClaimRow["counterfactualAnalysis"]>
  ): Promise<CausalClaimRow> {
    return this.updateClaim(id, {
      counterfactualStatus: analysis.alternativeExplanations.some(
        (a) => a.plausibility > 0.7 && !a.refutation
      )
        ? "assessed_weakened"
        : "assessed_supported",
      counterfactualAnalysis: analysis,
    });
  }

  async updateHillCriteria(
    id: string,
    criteria: NonNullable<CausalClaimRow["hillCriteria"]>
  ): Promise<CausalClaimRow> {
    return this.updateClaim(id, {
      hillCriteria: criteria,
    });
  }

  async deleteClaim(id: string): Promise<void> {
    await this.db.delete(causalClaims).where(eq(causalClaims.id, id));
  }

  // ==========================================================================
  // CAUSAL CHAINS
  // ==========================================================================

  async createChain(data: NewCausalChainRow): Promise<CausalChainRow> {
    // Calculate chain-level confidence
    const chainData = await this.calculateChainMetrics(data);

    const [chain] = await this.db
      .insert(causalChains)
      .values(chainData)
      .returning();

    return chain;
  }

  async findChainById(id: string): Promise<CausalChainRow | undefined> {
    const [chain] = await this.db
      .select()
      .from(causalChains)
      .where(eq(causalChains.id, id));

    return chain;
  }

  async findChainsByIssue(issueId: string): Promise<CausalChainRow[]> {
    return this.db
      .select()
      .from(causalChains)
      .where(eq(causalChains.issueId, issueId))
      .orderBy(desc(causalChains.isPrimary), desc(causalChains.overallConfidence));
  }

  async getPrimaryChain(issueId: string): Promise<CausalChainRow | undefined> {
    const [chain] = await this.db
      .select()
      .from(causalChains)
      .where(
        and(eq(causalChains.issueId, issueId), eq(causalChains.isPrimary, true))
      );

    return chain;
  }

  async updateChain(
    id: string,
    data: Partial<Omit<CausalChainRow, "id" | "createdAt">>
  ): Promise<CausalChainRow> {
    // Recalculate metrics if claim list changed
    let updatedData = data;
    if (data.claimIds) {
      updatedData = await this.calculateChainMetrics({
        ...data,
        claimIds: data.claimIds,
      } as NewCausalChainRow);
    }

    const [updated] = await this.db
      .update(causalChains)
      .set(updatedData)
      .where(eq(causalChains.id, id))
      .returning();

    return updated;
  }

  async setAsPrimaryChain(id: string, issueId: string): Promise<void> {
    // First, unset any existing primary chain for this issue
    await this.db
      .update(causalChains)
      .set({ isPrimary: false })
      .where(
        and(eq(causalChains.issueId, issueId), eq(causalChains.isPrimary, true))
      );

    // Then set the new primary
    await this.db
      .update(causalChains)
      .set({ isPrimary: true })
      .where(eq(causalChains.id, id));
  }

  async deleteChain(id: string): Promise<void> {
    await this.db.delete(causalChains).where(eq(causalChains.id, id));
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private calculateEvidenceScore(
    data: Partial<CausalClaimRow> & Pick<CausalClaimRow, "evidenceStrength">
  ): number {
    // Base score from evidence strength
    const strengthWeight =
      EVIDENCE_STRENGTH_WEIGHTS[data.evidenceStrength] ?? 0.3;

    // Adjust for Hill criteria if available
    let hillBonus = 0;
    if (data.hillCriteria) {
      hillBonus = (data.hillCriteria.overallScore - 0.5) * 0.2; // -0.1 to +0.1 adjustment
    }

    // Adjust for counterfactual analysis
    let counterfactualBonus = 0;
    switch (data.counterfactualStatus) {
      case "assessed_supported":
        counterfactualBonus = 0.1;
        break;
      case "assessed_weakened":
        counterfactualBonus = -0.1;
        break;
      case "assessed_refuted":
        counterfactualBonus = -0.3;
        break;
    }

    // Adjust for confidence
    const confidenceWeight = (data.confidence ?? 0.5) * 0.1;

    return Math.max(
      0,
      Math.min(1, strengthWeight + hillBonus + counterfactualBonus + confidenceWeight)
    );
  }

  private async calculateChainMetrics(
    data: NewCausalChainRow
  ): Promise<NewCausalChainRow> {
    if (!data.claimIds || data.claimIds.length === 0) {
      return {
        ...data,
        overallConfidence: 0,
        hasGaps: true,
        gapDescription: "No causal claims in chain",
      };
    }

    // Fetch all claims in the chain
    const claims = await Promise.all(
      data.claimIds.map((id) => this.findClaimById(id))
    );

    const validClaims = claims.filter(
      (c): c is CausalClaimRow => c !== undefined
    );

    if (validClaims.length === 0) {
      return {
        ...data,
        overallConfidence: 0,
        hasGaps: true,
        gapDescription: "No valid causal claims found",
      };
    }

    // Find weakest link
    let weakestClaim = validClaims[0];
    for (const claim of validClaims) {
      if ((claim.evidenceScore ?? 0) < (weakestClaim.evidenceScore ?? 0)) {
        weakestClaim = claim;
      }
    }

    // Overall confidence is the product of individual confidences
    // (chain is only as strong as weakest link, but we use product for multiplicative effect)
    const overallConfidence = validClaims.reduce(
      (acc, claim) => acc * (claim.confidence ?? 0.5),
      1
    );

    // Check for gaps (missing claims in the chain)
    const hasGaps = validClaims.length < data.claimIds.length;

    return {
      ...data,
      weakestLinkId: weakestClaim.id,
      overallConfidence: Math.max(0, Math.min(1, overallConfidence)),
      hasGaps,
      gapDescription: hasGaps
        ? `${data.claimIds.length - validClaims.length} claims not found`
        : undefined,
    };
  }

  /**
   * Get a complete causal chain with all its claims
   */
  async getChainWithClaims(chainId: string): Promise<{
    chain: CausalChainRow;
    claims: CausalClaimRow[];
  } | null> {
    const chain = await this.findChainById(chainId);
    if (!chain) return null;

    const claims = await Promise.all(
      (chain.claimIds || []).map((id) => this.findClaimById(id))
    );

    return {
      chain,
      claims: claims.filter((c): c is CausalClaimRow => c !== undefined),
    };
  }
}
