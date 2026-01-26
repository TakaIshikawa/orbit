"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

/**
 * Solution detail page now redirects to the issue's Solutions tab.
 * Solutions are displayed within their associated issue page.
 */
export default function SolutionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["solution", id],
    queryFn: () => api.getSolution(id),
  });

  // Redirect to issue page once we have the solution data
  useEffect(() => {
    if (data?.data?.issueId) {
      router.replace(`/issues/${data.data.issueId}`);
    }
  }, [data, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Redirecting to issue...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-red-400 border border-red-800 rounded-lg p-4">
        <p className="font-medium">Error loading solution</p>
        <p className="text-sm mt-1">{error instanceof Error ? error.message : "Solution not found"}</p>
        <Link href="/issues" className="text-blue-400 text-sm mt-2 inline-block hover:underline">
          Back to issues
        </Link>
      </div>
    );
  }

  const solution = data.data;

  // If no issueId, show fallback with solution info
  if (!solution.issueId) {
    return (
      <div className="space-y-6">
        <div className="border border-yellow-800/50 rounded-lg p-8 text-center">
          <div className="text-yellow-400 text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold mb-2">Orphaned Solution</h1>
          <p className="text-gray-400 mb-4">
            This solution is not linked to any issue.
          </p>
          <p className="text-gray-500 text-sm mb-2">
            <strong>{solution.title}</strong>
          </p>
          <p className="text-gray-600 text-xs mb-6">
            ID: {solution.id}
          </p>
          <Link
            href="/issues"
            className="inline-block bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Go to Issues
          </Link>
        </div>
      </div>
    );
  }

  // Show redirecting message
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-gray-400">
        Redirecting to{" "}
        <Link href={`/issues/${solution.issueId}`} className="text-blue-400 hover:underline">
          issue page
        </Link>
        ...
      </div>
    </div>
  );
}
