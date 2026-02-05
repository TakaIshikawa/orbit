"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWebSocketContext } from "./websocket-provider";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  step?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "",
    items: [
      { href: "/", label: "Home", icon: "◉" },
      { href: "/issues", label: "Issues", icon: "!" },
      { href: "/my-work", label: "My Work", icon: "◆" },
      { href: "/sources", label: "Sources", icon: "🌐" },
      { href: "/feedback", label: "Feedback", icon: "↻" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isConnected } = useWebSocketContext();

  return (
    <aside className="w-64 border-r border-gray-800 p-4 flex flex-col">
      <div className="mb-6">
        <Link href="/" className="text-xl font-bold">
          Orbit
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto">
        {navSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className={section.title ? "mt-6 first:mt-0" : ""}>
            {section.title && (
              <div className="px-3 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {section.title}
              </div>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive
                        ? "bg-gray-800 text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                    }`}
                  >
                    <span className="text-lg w-6 text-center">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.step && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        isActive ? "bg-gray-700 text-gray-300" : "bg-gray-800/50 text-gray-500"
                      }`}>
                        {item.step}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="pt-4 border-t border-gray-800">
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span>{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>
    </aside>
  );
}
