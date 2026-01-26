import { z } from "zod";
import { BaseRecordSchema } from "./base.js";

export const IUTLNScoresSchema = z.object({
  impact: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1),
  tractability: z.number().min(0).max(1),
  legitimacy: z.number().min(0).max(1),
  neglectedness: z.number().min(0).max(1),
});

export const TimeHorizonSchema = z.enum(["months", "years", "decades"]);
export const PropagationVelocitySchema = z.enum(["fast", "medium", "slow"]);

export const IssueStatusSchema = z.enum([
  "identified",
  "investigating",
  "solution_proposed",
  "in_progress",
  "resolved",
  "wont_fix",
]);

export const IssueSchema = BaseRecordSchema.extend({
  type: z.literal("Issue"),

  // Identity
  title: z.string().min(1).max(200),
  summary: z.string().min(1),

  // Source
  patternIds: z.array(z.string()),

  // Systemic framing
  rootCauses: z.array(z.string()),
  affectedDomains: z.array(z.string()).min(1),
  leveragePoints: z.array(z.string()),

  // IUTLN scoring
  scores: IUTLNScoresSchema,
  compositeScore: z.number().min(0).max(1),

  // Issue graph
  upstreamIssues: z.array(z.string()),
  downstreamIssues: z.array(z.string()),
  relatedIssues: z.array(z.string()),

  // Time dimension
  timeHorizon: TimeHorizonSchema,
  propagationVelocity: PropagationVelocitySchema,

  // State
  issueStatus: IssueStatusSchema,
});

export type IUTLNScores = z.infer<typeof IUTLNScoresSchema>;
export type TimeHorizon = z.infer<typeof TimeHorizonSchema>;
export type PropagationVelocity = z.infer<typeof PropagationVelocitySchema>;
export type IssueStatus = z.infer<typeof IssueStatusSchema>;
export type Issue = z.infer<typeof IssueSchema>;

// Compute composite score from IUTLN
export const computeCompositeScore = (scores: IUTLNScores): number => {
  // Weighted average - can be adjusted based on priorities
  const weights = {
    impact: 0.25,
    urgency: 0.20,
    tractability: 0.25,
    legitimacy: 0.10,
    neglectedness: 0.20,
  };

  return (
    scores.impact * weights.impact +
    scores.urgency * weights.urgency +
    scores.tractability * weights.tractability +
    scores.legitimacy * weights.legitimacy +
    scores.neglectedness * weights.neglectedness
  );
};

export const CreateIssueInputSchema = IssueSchema.omit({
  id: true,
  contentHash: true,
  parentHash: true,
  authorSignature: true,
  createdAt: true,
  version: true,
  status: true,
  compositeScore: true,
}).extend({
  status: z.enum(["draft", "active"]).optional().default("draft"),
});

export type CreateIssueInput = z.infer<typeof CreateIssueInputSchema>;
