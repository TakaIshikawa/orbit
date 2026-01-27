import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  getDatabase,
  IssueRepository,
  SolutionRepository,
  SolutionEffectivenessRepository,
} from "@orbit/db";

export const dashboardRoutes = new Hono();

// Helper to compute actionability score
function computeActionability(issue: {
  scoreTractability: number | null;
  scoreUrgency: number | null;
  scoreNeglectedness: number | null;
}, hasFeasibleSolution: boolean): number {
  const tractability = issue.scoreTractability ?? 0.5;
  const urgency = issue.scoreUrgency ?? 0.5;
  const neglectedness = issue.scoreNeglectedness ?? 0.5;

  return (
    tractability * 0.4 +
    (hasFeasibleSolution ? 0.3 : 0) +
    urgency * 0.2 +
    neglectedness * 0.1
  );
}

// GET /dashboard/summary - Main dashboard summary endpoint
dashboardRoutes.get("/summary", async (c) => {
  try {
    const db = getDatabase();
    const issueRepo = new IssueRepository(db);
    const solutionRepo = new SolutionRepository(db);
    const effectivenessRepo = new SolutionEffectivenessRepository(db);

    // Get all active issues - use empty filter to get all
    let issuesResult;
    try {
      issuesResult = await issueRepo.findByFilters(
        {},
        { limit: 50, sortBy: "compositeScore", order: "desc" }
      );
    } catch (e) {
      console.error("Error fetching issues:", e);
      issuesResult = { data: [], total: 0, limit: 50, offset: 0 };
    }

    // Get solutions for each issue to determine actionability
    const issuesWithActionability = await Promise.all(
      issuesResult.data.map(async (issue) => {
        try {
          const solutions = await solutionRepo.findByFilters(
            { issueId: issue.id },
            { limit: 10 }
          );

          const hasFeasibleSolution = solutions.data.some(
            (s) => (s.feasibilityScore ?? 0) >= 0.6
          );

          const actionability = computeActionability(issue, hasFeasibleSolution);

          return {
            ...issue,
            actionability,
            solutionCount: solutions.total,
            hasFeasibleSolution,
          };
        } catch {
          return {
            ...issue,
            actionability: computeActionability(issue, false),
            solutionCount: 0,
            hasFeasibleSolution: false,
          };
        }
      })
    );

    // Sort by actionability and take top 5
    const topActionableIssues = issuesWithActionability
      .sort((a, b) => b.actionability - a.actionability)
      .slice(0, 5);

    // Get in-progress solutions (active work)
    let activeWork: Array<Record<string, unknown>> = [];
    try {
      const activeWorkResult = await solutionRepo.findByFilters(
        { solutionStatus: "in_progress" },
        { limit: 10 }
      );
      activeWork = activeWorkResult.data.map((solution) => ({
        ...solution,
        daysSinceStarted: null, // assignedAt column may not exist yet
      }));
    } catch (e) {
      console.error("Error fetching in-progress solutions:", e);
    }

    // Get recently completed solutions with effectiveness
    let recentOutcomes: Array<Record<string, unknown>> = [];
    try {
      const completedResult = await solutionRepo.findCompleted({ limit: 10 });
      recentOutcomes = await Promise.all(
        completedResult.data.map(async (solution) => {
          try {
            const effectiveness = await effectivenessRepo.findBySolution(solution.id);
            return {
              ...solution,
              effectiveness: effectiveness
                ? {
                    overallScore: effectiveness.overallEffectivenessScore,
                    metricsAchieved: effectiveness.metricsAchieved,
                    metricsMissed: effectiveness.metricsMissed,
                    impactVariance: effectiveness.impactVariance,
                  }
                : null,
            };
          } catch {
            return { ...solution, effectiveness: null };
          }
        })
      );
    } catch (e) {
      console.error("Error fetching completed solutions:", e);
    }

    return c.json({
      data: {
        topActionableIssues,
        activeWork,
        recentOutcomes,
      },
    });
  } catch (e) {
    console.error("Dashboard summary error:", e);
    return c.json({
      data: {
        topActionableIssues: [],
        activeWork: [],
        recentOutcomes: [],
      },
    });
  }
});

// GET /dashboard/my-work - User's personal work summary
const myWorkQuerySchema = z.object({
  userId: z.string(),
});

dashboardRoutes.get("/my-work", zValidator("query", myWorkQuerySchema), async (c) => {
  try {
    const { userId } = c.req.valid("query");

    const db = getDatabase();
    const solutionRepo = new SolutionRepository(db);
    const effectivenessRepo = new SolutionEffectivenessRepository(db);

    // Try to get solutions assigned to user, but the column might not exist yet
    let inProgress: Array<Record<string, unknown>> = [];
    let completedWithEffectiveness: Array<Record<string, unknown>> = [];

    try {
      const assignedResult = await solutionRepo.findByAssignedTo(userId, { limit: 50 });

      // Separate by status
      const inProgressSolutions = assignedResult.data.filter((s) => s.solutionStatus === "in_progress");
      const completedSolutions = assignedResult.data.filter((s) => s.solutionStatus === "completed");

      inProgress = inProgressSolutions.map((s) => ({
        ...s,
        daysSinceStarted: null,
      }));

      completedWithEffectiveness = await Promise.all(
        completedSolutions.map(async (solution) => {
          try {
            const effectiveness = await effectivenessRepo.findBySolution(solution.id);
            return {
              ...solution,
              effectiveness: effectiveness
                ? {
                    overallScore: effectiveness.overallEffectivenessScore,
                    metricsAchieved: effectiveness.metricsAchieved,
                    metricsMissed: effectiveness.metricsMissed,
                    impactVariance: effectiveness.impactVariance,
                  }
                : null,
            };
          } catch {
            return { ...solution, effectiveness: null };
          }
        })
      );
    } catch (e) {
      console.error("Error fetching assigned solutions (column may not exist):", e);
    }

    return c.json({
      data: {
        inProgress,
        completed: completedWithEffectiveness,
        totalInProgress: inProgress.length,
        totalCompleted: completedWithEffectiveness.length,
      },
    });
  } catch (e) {
    console.error("My work error:", e);
    return c.json({
      data: {
        inProgress: [],
        completed: [],
        totalInProgress: 0,
        totalCompleted: 0,
      },
    });
  }
});
