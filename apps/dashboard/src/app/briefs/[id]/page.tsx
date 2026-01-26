"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

/**
 * Briefs detail page now redirects to the unified Issue page.
 * Since Issue and Brief have a 1:1 relationship, they're displayed together.
 */
export default function BriefDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: briefData, isLoading, error } = useQuery({
    queryKey: ["brief", id],
    queryFn: () => api.getBrief(id),
  });

  // Redirect to issue page once we have the brief data
  useEffect(() => {
    if (briefData?.data?.issueId) {
      router.replace(`/issues/${briefData.data.issueId}`);
    }
  }, [briefData, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Redirecting to issue...</div>
      </div>
    );
  }

  if (error || !briefData) {
    return (
      <div className="text-red-400 border border-red-800 rounded-lg p-4">
        <p className="font-medium">Error loading brief</p>
        <p className="text-sm mt-1">{error instanceof Error ? error.message : "Brief not found"}</p>
        <Link href="/issues" className="text-blue-400 text-sm mt-2 inline-block hover:underline">
          Back to issues
        </Link>
      </div>
    );
  }

  // Show a fallback while redirecting
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-gray-400">
        Redirecting to{" "}
        <Link href={`/issues/${briefData.data.issueId}`} className="text-blue-400 hover:underline">
          issue page
        </Link>
        ...
      </div>
    </div>
  );
}
