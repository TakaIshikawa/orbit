"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SchedulerPage() {
  const router = useRouter();

  useEffect(() => {
    // Auto-redirect after 3 seconds
    const timer = setTimeout(() => {
      router.push("/playbooks");
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold mb-4">Scheduler has moved</h1>
        <p className="text-gray-400 mb-6">
          Scheduled jobs are now managed through Playbooks. Create a playbook with a
          schedule trigger to run automated tasks on a cron schedule.
        </p>
        <div className="space-y-3">
          <Link
            href="/playbooks"
            className="block w-full bg-white text-black px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Go to Playbooks
          </Link>
          <p className="text-sm text-gray-500">
            Redirecting automatically...
          </p>
        </div>
      </div>
    </div>
  );
}
