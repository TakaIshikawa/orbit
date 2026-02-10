"use client";

import type { Issue, Solution, Verification } from "@/lib/api";

interface TimelineViewProps {
  issue: Issue;
  solutions: Solution[];
  verifications: Verification[];
}

interface TimelineEvent {
  date: Date;
  type: "created" | "evidence" | "solution" | "alert" | "progress" | "projected";
  title: string;
  description?: string;
  color: string;
}

export function TimelineView({ issue, solutions, verifications }: TimelineViewProps) {
  // Build timeline events
  const events: TimelineEvent[] = [];

  // Issue creation
  events.push({
    date: new Date(issue.createdAt),
    type: "created",
    title: "Issue identified",
    description: `First detected from ${issue.sources?.length || 0} sources`,
    color: "bg-blue-500",
  });

  // Verifications (group by month)
  const verificationsByMonth = new Map<string, Verification[]>();
  verifications.forEach((v) => {
    const date = new Date(v.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!verificationsByMonth.has(key)) {
      verificationsByMonth.set(key, []);
    }
    verificationsByMonth.get(key)!.push(v);
  });

  verificationsByMonth.forEach((vList, key) => {
    const [year, month] = key.split("-");
    const corroborated = vList.filter((v) => v.status === "corroborated").length;
    const contested = vList.filter((v) => v.status === "contested").length;

    events.push({
      date: new Date(parseInt(year), parseInt(month), 15),
      type: "evidence",
      title: `${vList.length} evidence items added`,
      description: `${corroborated} corroborated, ${contested} contested`,
      color: corroborated > contested ? "bg-green-500" : "bg-yellow-500",
    });
  });

  // Solutions proposed
  solutions.forEach((s) => {
    events.push({
      date: new Date(s.createdAt),
      type: "solution",
      title: `Solution proposed: ${s.title.slice(0, 30)}...`,
      color: "bg-purple-500",
    });
  });

  // Solutions started
  solutions
    .filter((s) => s.assignedAt)
    .forEach((s) => {
      events.push({
        date: new Date(s.assignedAt!),
        type: "progress",
        title: `Work started: ${s.title.slice(0, 30)}...`,
        description: s.assignedTo ? `Assigned to ${s.assignedTo}` : undefined,
        color: "bg-cyan-500",
      });
    });

  // Urgency alert (if high)
  if (issue.scoreUrgency >= 0.7) {
    events.push({
      date: new Date(),
      type: "alert",
      title: "HIGH URGENCY",
      description: "Immediate attention required",
      color: "bg-red-500",
    });
  }

  // Projected future (if no solutions in progress)
  const inProgress = solutions.filter((s) => s.solutionStatus === "in_progress").length;
  if (inProgress === 0 && issue.scoreUrgency >= 0.5) {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    events.push({
      date: futureDate,
      type: "projected",
      title: "Projected: Situation worsens",
      description: "If no action taken",
      color: "bg-gray-500",
    });
  }

  // Sort by date
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  const formatDate = (date: Date) => {
    const now = new Date();
    if (date > now) return date.getFullYear().toString();
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  const isNow = (date: Date) => {
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - date.getTime());
    return diffMs < 1000 * 60 * 60 * 24 * 30; // Within 30 days
  };

  const isFuture = (date: Date) => date > new Date();

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Issue Timeline</h3>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-700" />

        <div className="space-y-4">
          {events.map((event, index) => (
            <div key={index} className="relative flex items-start gap-4 pl-8">
              {/* Dot */}
              <div
                className={`absolute left-1.5 w-3 h-3 rounded-full ${event.color} ${
                  isNow(event.date) ? "ring-2 ring-white ring-opacity-50" : ""
                } ${isFuture(event.date) ? "opacity-50" : ""}`}
              />

              {/* Content */}
              <div className={`flex-1 ${isFuture(event.date) ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{formatDate(event.date)}</span>
                  {isNow(event.date) && (
                    <span className="px-1.5 py-0.5 bg-white/10 rounded text-xs text-white">NOW</span>
                  )}
                  {isFuture(event.date) && (
                    <span className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-400">
                      PROJECTED
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-200 mt-1">{event.title}</div>
                {event.description && (
                  <div className="text-xs text-gray-500 mt-0.5">{event.description}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
