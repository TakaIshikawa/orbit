"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Solutions list page now redirects to Issues page.
 * Solutions are displayed in the Solutions tab within each issue's detail page.
 */
export default function SolutionsPage() {
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
      <div className="border border-green-800/50 rounded-lg p-8 text-center">
        <div className="text-green-400 text-4xl mb-4">✓</div>
        <h1 className="text-xl font-bold mb-2">Solutions are now part of Issues</h1>
        <p className="text-gray-400 mb-4">
          Each issue can have multiple solutions, which are now displayed in the
          Solutions tab on the issue detail page.
        </p>
        <p className="text-gray-500 text-sm mb-6">
          Redirecting to Issues page...
        </p>
        <Link
          href="/issues"
          className="inline-block bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Go to Issues
        </Link>
      </div>
    </div>
  );
}
