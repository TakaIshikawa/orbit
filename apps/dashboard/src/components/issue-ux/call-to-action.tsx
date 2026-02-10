"use client";

interface CallToActionProps {
  hasProposedSolutions: boolean;
  hasInProgressSolutions: boolean;
  bestSolutionId?: string;
  bestSolutionTitle?: string;
  onTakeAction?: (solutionId: string) => void;
}

export function CallToAction({
  hasProposedSolutions,
  hasInProgressSolutions,
  bestSolutionId,
  bestSolutionTitle,
  onTakeAction,
}: CallToActionProps) {
  // Generate contextual actions based on state
  const generateActions = () => {
    const actions: Array<{ icon: string; text: string; priority: "high" | "medium" | "low" }> = [];

    // No solutions yet
    if (!hasProposedSolutions) {
      actions.push({
        icon: "🔍",
        text: "Research existing interventions for this problem",
        priority: "high",
      });
      actions.push({
        icon: "👥",
        text: "Identify key stakeholders and experts",
        priority: "medium",
      });
    }

    // Has solutions but none in progress
    if (hasProposedSolutions && !hasInProgressSolutions) {
      if (bestSolutionTitle) {
        actions.push({
          icon: "🚀",
          text: `Start implementing "${bestSolutionTitle.slice(0, 40)}..."`,
          priority: "high",
        });
      }
      actions.push({
        icon: "📊",
        text: "Validate solution feasibility with domain experts",
        priority: "medium",
      });
    }

    // Default actions
    if (actions.length === 0) {
      actions.push({
        icon: "📋",
        text: "Review progress on active solutions",
        priority: "low",
      });
      actions.push({
        icon: "📈",
        text: "Track outcome metrics",
        priority: "low",
      });
    }

    return actions.slice(0, 3);
  };

  const actions = generateActions();

  const priorityColors = {
    high: "border-red-500/30 bg-red-900/10",
    medium: "border-yellow-500/30 bg-yellow-900/10",
    low: "border-gray-500/30 bg-gray-800/30",
  };

  const priorityLabels = {
    high: "text-red-400",
    medium: "text-yellow-400",
    low: "text-gray-400",
  };

  return (
    <div className="bg-gradient-to-r from-cyan-900/20 to-blue-900/20 border border-cyan-700/30 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">💡</span>
        <h3 className="text-sm font-semibold text-cyan-300 uppercase tracking-wide">
          What You Can Do
        </h3>
      </div>

      <div className="space-y-2">
        {actions.map((action, index) => (
          <div
            key={index}
            className={`flex items-start gap-3 p-3 rounded-lg border ${priorityColors[action.priority]}`}
          >
            <span className="text-lg">{action.icon}</span>
            <div className="flex-1">
              <p className="text-sm text-gray-200">{action.text}</p>
            </div>
            <span className={`text-xs uppercase ${priorityLabels[action.priority]}`}>
              {action.priority}
            </span>
          </div>
        ))}
      </div>

      {bestSolutionId && bestSolutionTitle && (
        <div className="mt-4 pt-3 border-t border-cyan-700/30">
          <div className="text-xs text-gray-500 mb-1">Recommended Solution</div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-cyan-400 font-medium">{bestSolutionTitle}</span>
            {onTakeAction && (
              <button
                onClick={() => onTakeAction(bestSolutionId)}
                className="px-3 py-1 bg-cyan-600 text-white text-xs rounded hover:bg-cyan-700 transition-colors"
              >
                Take Action
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
