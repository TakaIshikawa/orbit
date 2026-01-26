/**
 * Source Health Monitoring Job
 *
 * Recalculates health metrics for all domains with recent fetch activity.
 * Should be scheduled to run periodically (e.g., every hour or daily).
 */

import {
  SourceFetchLogRepository,
  SourceHealthRepository,
  type Database,
} from "@orbit/db";

export interface SourceHealthJobResult {
  domainsProcessed: number;
  alertsGenerated: number;
  alertsCleared: number;
  healthySources: number;
  degradedSources: number;
  unhealthySources: number;
}

export interface SourceHealthJobOptions {
  windowDays?: number; // Rolling window for health calculation (default: 7)
  recordHistory?: boolean; // Whether to record reliability snapshots (default: true)
}

/**
 * Run the source health monitoring job
 *
 * @param db - Database connection
 * @param options - Job configuration options
 * @returns Summary of job results
 */
export async function runSourceHealthJob(
  db: Database,
  options: SourceHealthJobOptions = {}
): Promise<SourceHealthJobResult> {
  const { windowDays = 7, recordHistory = true } = options;

  const fetchLogRepo = new SourceFetchLogRepository(db);
  const healthRepo = new SourceHealthRepository(db);

  // Get all unique domains with recent fetch activity
  const domains = await fetchLogRepo.getUniqueDomains(windowDays);

  console.log(`[SourceHealth] Processing ${domains.length} domains...`);

  let domainsProcessed = 0;
  let alertsGenerated = 0;
  let alertsCleared = 0;
  let healthySources = 0;
  let degradedSources = 0;
  let unhealthySources = 0;

  for (const domain of domains) {
    try {
      // Get previous health status to track alert changes
      const previousHealth = await healthRepo.findByDomain(domain);
      const wasAlertActive = previousHealth?.alertActive ?? false;

      // Recalculate health
      const health = await healthRepo.recalculateHealth(domain, windowDays);

      domainsProcessed++;

      // Track health status counts
      switch (health.healthStatus) {
        case "healthy":
          healthySources++;
          break;
        case "degraded":
          degradedSources++;
          break;
        case "unhealthy":
          unhealthySources++;
          break;
      }

      // Track alert changes
      if (health.alertActive && !wasAlertActive) {
        alertsGenerated++;
        console.log(
          `[SourceHealth] Alert generated for ${domain}: ${health.alertReason}`
        );
      } else if (!health.alertActive && wasAlertActive) {
        alertsCleared++;
        console.log(`[SourceHealth] Alert cleared for ${domain}`);
      }

      // Record historical snapshot if enabled
      if (recordHistory) {
        await healthRepo.recordReliabilitySnapshot(domain);
      }
    } catch (error) {
      console.error(
        `[SourceHealth] Error processing ${domain}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`[SourceHealth] Completed processing ${domainsProcessed} domains`);
  console.log(
    `[SourceHealth] Status: ${healthySources} healthy, ${degradedSources} degraded, ${unhealthySources} unhealthy`
  );
  if (alertsGenerated > 0 || alertsCleared > 0) {
    console.log(
      `[SourceHealth] Alerts: ${alertsGenerated} generated, ${alertsCleared} cleared`
    );
  }

  return {
    domainsProcessed,
    alertsGenerated,
    alertsCleared,
    healthySources,
    degradedSources,
    unhealthySources,
  };
}

/**
 * Get a summary report of current source health
 */
export async function getSourceHealthReport(db: Database): Promise<string> {
  const healthRepo = new SourceHealthRepository(db);
  const summary = await healthRepo.getHealthSummary();

  const lines = [
    "=== Source Health Report ===",
    "",
    `Total Sources Monitored: ${summary.totalSources}`,
    "",
    "Health Status Breakdown:",
    `  Healthy:   ${summary.healthy}`,
    `  Degraded:  ${summary.degraded}`,
    `  Unhealthy: ${summary.unhealthy}`,
    `  Unknown:   ${summary.unknown}`,
    "",
    `Active Alerts: ${summary.activeAlerts}`,
  ];

  if (summary.activeAlerts > 0) {
    lines.push("");
    lines.push("Domains with Active Alerts:");

    const alertSources = await healthRepo.findWithActiveAlerts();
    for (const source of alertSources.slice(0, 10)) {
      lines.push(
        `  - ${source.domain}: ${source.alertReason ?? "Unknown reason"}`
      );
    }
    if (alertSources.length > 10) {
      lines.push(`  ... and ${alertSources.length - 10} more`);
    }
  }

  // Show degraded sources
  const degradedSources = await healthRepo.findDegraded();
  if (degradedSources.length > 0) {
    lines.push("");
    lines.push("Degraded/Unhealthy Sources:");
    for (const source of degradedSources.slice(0, 10)) {
      const rate = source.successRate
        ? `${(source.successRate * 100).toFixed(1)}%`
        : "N/A";
      lines.push(`  - ${source.domain}: ${source.healthStatus} (${rate} success)`);
    }
    if (degradedSources.length > 10) {
      lines.push(`  ... and ${degradedSources.length - 10} more`);
    }
  }

  return lines.join("\n");
}
