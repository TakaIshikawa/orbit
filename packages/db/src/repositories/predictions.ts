import { eq, and, desc, lt, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import {
  predictions,
  calibrationRecords,
  predictionSets,
  type PredictionRow,
  type NewPredictionRow,
  type CalibrationRecordRow,
  type NewCalibrationRecordRow,
  type PredictionSetRow,
  type NewPredictionSetRow,
} from "../schema/predictions.js";

/**
 * Calibration bin boundaries
 */
const CALIBRATION_BINS = [
  { start: 0.0, end: 0.1 },
  { start: 0.1, end: 0.2 },
  { start: 0.2, end: 0.3 },
  { start: 0.3, end: 0.4 },
  { start: 0.4, end: 0.5 },
  { start: 0.5, end: 0.6 },
  { start: 0.6, end: 0.7 },
  { start: 0.7, end: 0.8 },
  { start: 0.8, end: 0.9 },
  { start: 0.9, end: 1.0 },
];

export class PredictionRepository {
  constructor(private db: Database) {}

  // ==========================================================================
  // PREDICTIONS
  // ==========================================================================

  async createPrediction(data: NewPredictionRow): Promise<PredictionRow> {
    const [prediction] = await this.db
      .insert(predictions)
      .values(data)
      .returning();

    return prediction;
  }

  async createPredictions(data: NewPredictionRow[]): Promise<PredictionRow[]> {
    if (data.length === 0) return [];

    return this.db.insert(predictions).values(data).returning();
  }

  async findPredictionById(id: string): Promise<PredictionRow | undefined> {
    const [prediction] = await this.db
      .select()
      .from(predictions)
      .where(eq(predictions.id, id));

    return prediction;
  }

  async findPredictionsByIssue(issueId: string): Promise<PredictionRow[]> {
    return this.db
      .select()
      .from(predictions)
      .where(eq(predictions.issueId, issueId))
      .orderBy(desc(predictions.createdAt));
  }

  async findActivePredictions(limit = 50): Promise<PredictionRow[]> {
    return this.db
      .select()
      .from(predictions)
      .where(eq(predictions.status, "active"))
      .orderBy(predictions.resolutionDeadline)
      .limit(limit);
  }

  async findPredictionsDueSoon(withinDays = 7): Promise<PredictionRow[]> {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + withinDays);

    return this.db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.status, "active"),
          lt(predictions.resolutionDeadline, deadline)
        )
      )
      .orderBy(predictions.resolutionDeadline);
  }

  async findOverduePredictions(): Promise<PredictionRow[]> {
    return this.db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.status, "active"),
          lt(predictions.resolutionDeadline, new Date())
        )
      )
      .orderBy(predictions.resolutionDeadline);
  }

  async resolvePrediction(
    id: string,
    resolution: {
      status:
        | "resolved_correct"
        | "resolved_incorrect"
        | "resolved_partial"
        | "expired"
        | "withdrawn";
      actualOutcome: string;
      actualValue?: number;
      outcomeSource?: string;
      postMortem?: string;
      modelUpdates?: NonNullable<PredictionRow["modelUpdates"]>;
    }
  ): Promise<PredictionRow> {
    const prediction = await this.findPredictionById(id);
    if (!prediction) {
      throw new Error(`Prediction ${id} not found`);
    }

    // Calculate Brier score if we have actual outcome
    let brierScore: number | null = null;
    let logScore: number | null = null;

    if (
      resolution.status === "resolved_correct" ||
      resolution.status === "resolved_incorrect"
    ) {
      const outcome = resolution.status === "resolved_correct" ? 1 : 0;
      brierScore = Math.pow(prediction.probability - outcome, 2);
      logScore =
        outcome === 1
          ? Math.log(Math.max(0.001, prediction.probability))
          : Math.log(Math.max(0.001, 1 - prediction.probability));
    }

    const [updated] = await this.db
      .update(predictions)
      .set({
        ...resolution,
        brierScore,
        logScore,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(predictions.id, id))
      .returning();

    return updated;
  }

  async withdrawPrediction(
    id: string,
    reason: string
  ): Promise<PredictionRow> {
    const [updated] = await this.db
      .update(predictions)
      .set({
        status: "withdrawn",
        postMortem: reason,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(predictions.id, id))
      .returning();

    return updated;
  }

  // ==========================================================================
  // CALIBRATION
  // ==========================================================================

  async calculateCalibration(
    periodStart: Date,
    periodEnd: Date,
    scope = "all"
  ): Promise<CalibrationRecordRow> {
    // Get all resolved predictions in the period
    const resolved = await this.db
      .select()
      .from(predictions)
      .where(
        and(
          sql`${predictions.resolvedAt} >= ${periodStart}`,
          sql`${predictions.resolvedAt} < ${periodEnd}`,
          sql`${predictions.status} IN ('resolved_correct', 'resolved_incorrect')`
        )
      );

    if (resolved.length === 0) {
      throw new Error("No resolved predictions in the specified period");
    }

    // Calculate calibration bins
    const calibrationBins = CALIBRATION_BINS.map((bin) => {
      const inBin = resolved.filter(
        (p) => p.probability >= bin.start && p.probability < bin.end
      );
      const correctCount = inBin.filter(
        (p) => p.status === "resolved_correct"
      ).length;

      return {
        binStart: bin.start,
        binEnd: bin.end,
        count: inBin.length,
        correctCount,
        actualFrequency: inBin.length > 0 ? correctCount / inBin.length : 0,
        expectedFrequency: (bin.start + bin.end) / 2,
      };
    });

    // Calculate overall metrics
    const totalPredictions = resolved.length;
    const brierScores = resolved
      .filter((p) => p.brierScore !== null)
      .map((p) => p.brierScore!);
    const logScores = resolved
      .filter((p) => p.logScore !== null)
      .map((p) => p.logScore!);

    const meanBrierScore =
      brierScores.length > 0
        ? brierScores.reduce((a, b) => a + b, 0) / brierScores.length
        : null;
    const meanLogScore =
      logScores.length > 0
        ? logScores.reduce((a, b) => a + b, 0) / logScores.length
        : null;

    // Calibration error (mean absolute deviation from perfect calibration)
    const calibrationError =
      calibrationBins
        .filter((b) => b.count > 0)
        .reduce(
          (acc, b) =>
            acc +
            Math.abs(b.actualFrequency - b.expectedFrequency) * b.count,
          0
        ) / totalPredictions;

    // Overconfidence ratio
    const overconfident = resolved.filter(
      (p) =>
        (p.probability > 0.5 && p.status === "resolved_incorrect") ||
        (p.probability < 0.5 && p.status === "resolved_correct")
    ).length;
    const overconfidenceRatio = overconfident / totalPredictions;

    // By prediction type
    const byType: Record<
      string,
      { count: number; brierScore: number; calibrationError: number }
    > = {};
    for (const p of resolved) {
      if (!byType[p.predictionType]) {
        byType[p.predictionType] = { count: 0, brierScore: 0, calibrationError: 0 };
      }
      byType[p.predictionType].count++;
      if (p.brierScore !== null) {
        byType[p.predictionType].brierScore += p.brierScore;
      }
    }
    // Average the scores
    for (const type of Object.keys(byType)) {
      if (byType[type].count > 0) {
        byType[type].brierScore /= byType[type].count;
      }
    }

    // Generate ID and save
    const id = `cal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const [record] = await this.db
      .insert(calibrationRecords)
      .values({
        id,
        periodStart,
        periodEnd,
        scope,
        calibrationBins,
        totalPredictions,
        meanBrierScore,
        meanLogScore,
        calibrationError,
        overconfidenceRatio,
        byType,
      })
      .returning();

    return record;
  }

  async findCalibrationRecords(
    scope = "all",
    limit = 10
  ): Promise<CalibrationRecordRow[]> {
    return this.db
      .select()
      .from(calibrationRecords)
      .where(eq(calibrationRecords.scope, scope))
      .orderBy(desc(calibrationRecords.periodEnd))
      .limit(limit);
  }

  async getLatestCalibration(
    scope = "all"
  ): Promise<CalibrationRecordRow | undefined> {
    const [record] = await this.db
      .select()
      .from(calibrationRecords)
      .where(eq(calibrationRecords.scope, scope))
      .orderBy(desc(calibrationRecords.periodEnd))
      .limit(1);

    return record;
  }

  // ==========================================================================
  // PREDICTION SETS
  // ==========================================================================

  async createPredictionSet(data: NewPredictionSetRow): Promise<PredictionSetRow> {
    const [set] = await this.db
      .insert(predictionSets)
      .values(data)
      .returning();

    return set;
  }

  async findPredictionSetById(id: string): Promise<PredictionSetRow | undefined> {
    const [set] = await this.db
      .select()
      .from(predictionSets)
      .where(eq(predictionSets.id, id));

    return set;
  }

  async findPredictionSetsByIssue(issueId: string): Promise<PredictionSetRow[]> {
    return this.db
      .select()
      .from(predictionSets)
      .where(eq(predictionSets.issueId, issueId))
      .orderBy(desc(predictionSets.createdAt));
  }

  async addPredictionToSet(
    setId: string,
    predictionId: string
  ): Promise<PredictionSetRow> {
    const set = await this.findPredictionSetById(setId);
    if (!set) {
      throw new Error(`Prediction set ${setId} not found`);
    }

    const predictionIds = [...(set.predictionIds || []), predictionId];

    const [updated] = await this.db
      .update(predictionSets)
      .set({ predictionIds })
      .where(eq(predictionSets.id, setId))
      .returning();

    return updated;
  }

  async resolvePredictionSet(setId: string): Promise<PredictionSetRow> {
    const set = await this.findPredictionSetById(setId);
    if (!set) {
      throw new Error(`Prediction set ${setId} not found`);
    }

    // Get all predictions in the set
    const preds = await Promise.all(
      (set.predictionIds || []).map((id) => this.findPredictionById(id))
    );

    const validPreds = preds.filter(
      (p): p is PredictionRow => p !== undefined
    );

    // Check if all are resolved
    const allResolved = validPreds.every(
      (p) =>
        p.status === "resolved_correct" ||
        p.status === "resolved_incorrect" ||
        p.status === "expired"
    );

    if (!allResolved) {
      throw new Error("Not all predictions in set are resolved");
    }

    // Calculate set metrics
    const correctCount = validPreds.filter(
      (p) => p.status === "resolved_correct"
    ).length;
    const setAccuracy = validPreds.length > 0 ? correctCount / validPreds.length : 0;

    const brierScores = validPreds
      .filter((p) => p.brierScore !== null)
      .map((p) => p.brierScore!);
    const setBrierScore =
      brierScores.length > 0
        ? brierScores.reduce((a, b) => a + b, 0) / brierScores.length
        : null;

    const [updated] = await this.db
      .update(predictionSets)
      .set({
        resolved: true,
        setAccuracy,
        setBrierScore,
      })
      .where(eq(predictionSets.id, setId))
      .returning();

    return updated;
  }

  /**
   * Get prediction set with all its predictions
   */
  async getSetWithPredictions(setId: string): Promise<{
    set: PredictionSetRow;
    predictions: PredictionRow[];
  } | null> {
    const set = await this.findPredictionSetById(setId);
    if (!set) return null;

    const preds = await Promise.all(
      (set.predictionIds || []).map((id) => this.findPredictionById(id))
    );

    return {
      set,
      predictions: preds.filter((p): p is PredictionRow => p !== undefined),
    };
  }
}
