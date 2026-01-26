"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Verifications list page now redirects to Issues page.
 * Verifications are displayed in the Verifications tab within each issue's detail page.
 */
export default function VerificationsPage() {
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
      <div className="border border-blue-800/50 rounded-lg p-8 text-center">
        <div className="text-blue-400 text-4xl mb-4">🔍</div>
        <h1 className="text-xl font-bold mb-2">Verifications are now part of Issues</h1>
        <p className="text-gray-400 mb-4">
          Claim verifications are displayed in the Verifications tab on each issue&apos;s detail page,
          showing verified claims from patterns and briefs linked to that issue.
        </p>
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
