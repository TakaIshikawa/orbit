"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, useMemo, useCallback } from "react";
import { api, type Issue } from "@/lib/api";

interface IssueNode {
  id: string;
  title: string;
  compositeScore: number;
  issueStatus: string;
  x: number;
  y: number;
  level: number; // -1 = upstream, 0 = current, 1 = downstream
  relationship: "upstream" | "current" | "downstream" | "related";
}

interface IssueEdge {
  from: string;
  to: string;
  type: "upstream" | "downstream" | "related";
}

interface Props {
  currentIssueId: string;
  upstreamIssues: string[];
  downstreamIssues: string[];
  relatedIssues: string[];
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const LEVEL_GAP = 200;
const NODE_GAP = 80;

export function IssueRelationshipGraph({
  currentIssueId,
  upstreamIssues,
  downstreamIssues,
  relatedIssues,
}: Props) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Fetch all related issues to get their details
  const allRelatedIds = [...upstreamIssues, ...downstreamIssues, ...relatedIssues];

  const { data: issuesData } = useQuery({
    queryKey: ["issues-for-graph", currentIssueId],
    queryFn: async () => {
      if (allRelatedIds.length === 0) return [];
      // Fetch each issue individually
      const promises = allRelatedIds.map((id) =>
        api.getIssue(id).catch(() => null)
      );
      const results = await Promise.all(promises);
      return results.filter((r): r is { data: Issue } => r !== null).map((r) => r.data);
    },
    enabled: allRelatedIds.length > 0,
  });

  const { data: currentIssueData } = useQuery({
    queryKey: ["issue", currentIssueId],
    queryFn: () => api.getIssue(currentIssueId),
  });

  const { nodes, edges, viewBox } = useMemo(() => {
    const nodes: IssueNode[] = [];
    const edges: IssueEdge[] = [];

    // Current issue at center
    if (currentIssueData?.data) {
      nodes.push({
        id: currentIssueId,
        title: currentIssueData.data.title,
        compositeScore: currentIssueData.data.compositeScore,
        issueStatus: currentIssueData.data.issueStatus,
        x: 0,
        y: 0,
        level: 0,
        relationship: "current",
      });
    }

    const issueMap = new Map<string, Issue>();
    issuesData?.forEach((issue) => issueMap.set(issue.id, issue));

    // Position upstream issues (left side)
    upstreamIssues.forEach((id, index) => {
      const issue = issueMap.get(id);
      const yOffset = (index - (upstreamIssues.length - 1) / 2) * (NODE_HEIGHT + NODE_GAP);
      nodes.push({
        id,
        title: issue?.title || id,
        compositeScore: issue?.compositeScore || 0,
        issueStatus: issue?.issueStatus || "unknown",
        x: -LEVEL_GAP,
        y: yOffset,
        level: -1,
        relationship: "upstream",
      });
      edges.push({ from: id, to: currentIssueId, type: "upstream" });
    });

    // Position downstream issues (right side)
    downstreamIssues.forEach((id, index) => {
      const issue = issueMap.get(id);
      const yOffset = (index - (downstreamIssues.length - 1) / 2) * (NODE_HEIGHT + NODE_GAP);
      nodes.push({
        id,
        title: issue?.title || id,
        compositeScore: issue?.compositeScore || 0,
        issueStatus: issue?.issueStatus || "unknown",
        x: LEVEL_GAP,
        y: yOffset,
        level: 1,
        relationship: "downstream",
      });
      edges.push({ from: currentIssueId, to: id, type: "downstream" });
    });

    // Position related issues (below)
    relatedIssues.forEach((id, index) => {
      const issue = issueMap.get(id);
      const xOffset = (index - (relatedIssues.length - 1) / 2) * (NODE_WIDTH + 40);
      nodes.push({
        id,
        title: issue?.title || id,
        compositeScore: issue?.compositeScore || 0,
        issueStatus: issue?.issueStatus || "unknown",
        x: xOffset,
        y: LEVEL_GAP * 0.8,
        level: 0,
        relationship: "related",
      });
      edges.push({ from: currentIssueId, to: id, type: "related" });
    });

    // Calculate viewBox
    const padding = 50;
    const minX = Math.min(...nodes.map((n) => n.x)) - NODE_WIDTH / 2 - padding;
    const maxX = Math.max(...nodes.map((n) => n.x)) + NODE_WIDTH / 2 + padding;
    const minY = Math.min(...nodes.map((n) => n.y)) - NODE_HEIGHT / 2 - padding;
    const maxY = Math.max(...nodes.map((n) => n.y)) + NODE_HEIGHT / 2 + padding;

    const width = Math.max(maxX - minX, 400);
    const height = Math.max(maxY - minY, 200);

    return {
      nodes,
      edges,
      viewBox: `${minX} ${minY} ${width} ${height}`,
    };
  }, [currentIssueId, currentIssueData, issuesData, upstreamIssues, downstreamIssues, relatedIssues]);

  const getNodeColor = useCallback((relationship: string, score: number) => {
    if (relationship === "current") return "#3b82f6"; // blue
    if (score >= 0.7) return "#ef4444"; // red
    if (score >= 0.4) return "#eab308"; // yellow
    return "#22c55e"; // green
  }, []);

  const getEdgeColor = useCallback((type: string) => {
    switch (type) {
      case "upstream":
        return "#f97316"; // orange
      case "downstream":
        return "#8b5cf6"; // purple
      case "related":
        return "#6b7280"; // gray
      default:
        return "#6b7280";
    }
  }, []);

  if (nodes.length <= 1) {
    return (
      <div className="border border-gray-800 rounded-lg p-4 text-center text-gray-500">
        No related issues to display
      </div>
    );
  }

  return (
    <div className="border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Issue Relationship Graph</h2>
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-orange-500" /> Upstream (causes)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-purple-500" /> Downstream (effects)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-gray-500" /> Related
          </span>
        </div>
      </div>

      <svg
        viewBox={viewBox}
        className="w-full"
        style={{ minHeight: 300, maxHeight: 500 }}
      >
        <defs>
          <marker
            id="arrowhead-upstream"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#f97316" />
          </marker>
          <marker
            id="arrowhead-downstream"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#8b5cf6" />
          </marker>
          <marker
            id="arrowhead-related"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge, i) => {
          const fromNode = nodes.find((n) => n.id === edge.from);
          const toNode = nodes.find((n) => n.id === edge.to);
          if (!fromNode || !toNode) return null;

          // Calculate edge endpoints at node boundaries
          const dx = toNode.x - fromNode.x;
          const dy = toNode.y - fromNode.y;
          const angle = Math.atan2(dy, dx);

          const fromX = fromNode.x + (NODE_WIDTH / 2) * Math.cos(angle);
          const fromY = fromNode.y + (NODE_HEIGHT / 2) * Math.sin(angle);
          const toX = toNode.x - (NODE_WIDTH / 2 + 10) * Math.cos(angle);
          const toY = toNode.y - (NODE_HEIGHT / 2 + 10) * Math.sin(angle);

          return (
            <line
              key={i}
              x1={fromX}
              y1={fromY}
              x2={toX}
              y2={toY}
              stroke={getEdgeColor(edge.type)}
              strokeWidth={2}
              markerEnd={`url(#arrowhead-${edge.type})`}
              opacity={hoveredNode && hoveredNode !== edge.from && hoveredNode !== edge.to ? 0.3 : 1}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => (
          <g
            key={node.id}
            transform={`translate(${node.x - NODE_WIDTH / 2}, ${node.y - NODE_HEIGHT / 2})`}
            onMouseEnter={() => setHoveredNode(node.id)}
            onMouseLeave={() => setHoveredNode(null)}
            style={{ cursor: "pointer" }}
            opacity={hoveredNode && hoveredNode !== node.id ? 0.5 : 1}
          >
            <Link href={`/issues/${node.id}`}>
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={8}
                fill="#1f2937"
                stroke={getNodeColor(node.relationship, node.compositeScore)}
                strokeWidth={node.relationship === "current" ? 3 : 2}
              />
              <text
                x={NODE_WIDTH / 2}
                y={22}
                textAnchor="middle"
                fill="white"
                fontSize={12}
                fontWeight={node.relationship === "current" ? 600 : 400}
              >
                {node.title.length > 22 ? node.title.slice(0, 20) + "..." : node.title}
              </text>
              <text
                x={NODE_WIDTH / 2}
                y={42}
                textAnchor="middle"
                fill="#9ca3af"
                fontSize={10}
              >
                Score: {(node.compositeScore * 100).toFixed(0)}%
              </text>
            </Link>
          </g>
        ))}
      </svg>

      <div className="mt-2 text-xs text-gray-500 text-center">
        Click on a node to navigate to that issue
      </div>
    </div>
  );
}
