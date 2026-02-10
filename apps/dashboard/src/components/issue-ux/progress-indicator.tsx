"use client";

interface ProgressIndicatorProps {
  activeTab: string;
  tabs: Array<{
    id: string;
    label: string;
    count?: number;
  }>;
  hasEvidence: boolean;
  hasValidation: boolean;
  hasSolutions: boolean;
  hasActiveWork: boolean;
  hasOutcomes: boolean;
}

export function ProgressIndicator({
  activeTab,
  tabs,
  hasEvidence,
  hasValidation,
  hasSolutions,
  hasActiveWork,
  hasOutcomes,
}: ProgressIndicatorProps) {
  const getStatus = (tabId: string): "complete" | "in_progress" | "not_started" => {
    switch (tabId) {
      case "problem":
        return "complete"; // Always has problem definition
      case "evidence":
        return hasEvidence ? "complete" : "not_started";
      case "validation":
        return hasValidation ? "complete" : hasEvidence ? "in_progress" : "not_started";
      case "solutions":
        return hasSolutions ? "complete" : hasValidation ? "in_progress" : "not_started";
      case "efforts":
        return hasActiveWork ? "in_progress" : hasSolutions ? "not_started" : "not_started";
      case "outcomes":
        return hasOutcomes ? "complete" : hasActiveWork ? "in_progress" : "not_started";
      default:
        return "not_started";
    }
  };

  const statusIcons = {
    complete: { icon: "✓", color: "text-green-400", bg: "bg-green-900/30" },
    in_progress: { icon: "●", color: "text-yellow-400", bg: "bg-yellow-900/30" },
    not_started: { icon: "○", color: "text-gray-500", bg: "bg-gray-800/30" },
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {tabs.map((tab, index) => {
        const status = getStatus(tab.id);
        const { icon, color, bg } = statusIcons[status];
        const isActive = activeTab === tab.id;

        return (
          <div key={tab.id} className="flex items-center">
            <div
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs
                ${isActive ? "bg-cyan-900/50 border border-cyan-700" : bg}
                ${isActive ? "text-cyan-300" : color}
              `}
            >
              <span>{icon}</span>
              <span className="whitespace-nowrap">{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-gray-700 rounded-full text-gray-300">
                  {tab.count}
                </span>
              )}
            </div>
            {index < tabs.length - 1 && (
              <span className="mx-1 text-gray-600">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
