"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Briefs list page now redirects to Issues page.
 * Since Issue and Brief have a 1:1 relationship, they're displayed together
 * on the unified Issues page.
 */
export default function BriefsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to issues page after a brief delay to show the message
    const timer = setTimeout(() => {
      router.replace("/issues");
    }, 2000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="space-y-6">
      <div className="border border-purple-800/50 rounded-lg p-8 text-center">
        <div className="text-purple-400 text-4xl mb-4">📋</div>
        <h1 className="text-xl font-bold mb-2">Briefs are now part of Issues</h1>
        <p className="text-gray-400 mb-4">
          Since each issue has exactly one problem brief, they are now displayed together
          on a unified page with tabs.
        </p>
        <p className="text-gray-500 text-sm mb-6">
          Redirecting to Issues page...
        </p>
        <Link
          href="/issues"
          className="inline-block bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Go to Issues & Briefs
        </Link>
      </div>
    </div>
  );
}
