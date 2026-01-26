"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

/**
 * Verification detail page now redirects to the Issues page.
 * Verifications are displayed within their associated issue's detail page.
 */
export default function VerificationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["verification", id],
    queryFn: () => api.getVerification(id),
  });

  // Redirect to issues page after loading
  useEffect(() => {
    if (data?.data) {
      // Redirect to issues page - verifications are now shown in issue detail
      const timer = setTimeout(() => {
        router.replace("/issues");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [data, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-red-400 border border-red-800 rounded-lg p-4">
        <p className="font-medium">Error loading verification</p>
        <p className="text-sm mt-1">{error instanceof Error ? error.message : "Verification not found"}</p>
        <Link href="/issues" className="text-blue-400 text-sm mt-2 inline-block hover:underline">
          Go to issues
        </Link>
      </div>
    );
  }

  const verification = data.data;

  return (
    <div className="space-y-6">
      <div className="border border-blue-800/50 rounded-lg p-8 text-center">
        <div className="text-blue-400 text-4xl mb-4">🔍</div>
        <h1 className="text-xl font-bold mb-2">Verifications Moved to Issues</h1>
        <p className="text-gray-400 mb-4">
          This verification is now displayed within its associated issue&apos;s detail page.
        </p>
        <div className="text-sm text-gray-500 mb-4">
          <p><strong>Claim:</strong> {verification.claimStatement.slice(0, 100)}...</p>
          <p className="mt-1"><strong>Source:</strong> {verification.sourceType} / {verification.sourceId.slice(0, 12)}...</p>
        </div>
        <p className="text-gray-500 text-sm mb-6">
          Redirecting to Issues page...
        </p>
        <Link
          href="/issues"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Go to Issues
        </Link>
      </div>
    </div>
  );
}
