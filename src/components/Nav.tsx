"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Nav() {
  const pathname = usePathname();
  const [adminOpen, setAdminOpen] = useState(false);

  const linkClass = (path: string) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      pathname === path
        ? "bg-indigo-700 text-white"
        : "text-indigo-100 hover:bg-indigo-600 hover:text-white"
    }`;

  return (
    <nav className="bg-indigo-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-lg">Liks Run List</span>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/generate" className={linkClass("/generate")}>
              Generate
            </Link>
            <Link href="/rules" className={linkClass("/rules")}>
              Rules
            </Link>
            <div className="relative">
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="px-3 py-2 rounded-md text-sm font-medium text-indigo-100 hover:bg-indigo-600 hover:text-white transition-colors"
              >
                Admin
              </button>
              {adminOpen && (
                <div className="absolute right-0 mt-1 w-40 bg-white rounded-md shadow-lg py-1 z-50">
                  <Link
                    href="/admin/recipes"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setAdminOpen(false)}
                  >
                    Recipes
                  </Link>
                  <Link
                    href="/admin/rules"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => setAdminOpen(false)}
                  >
                    Rules
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
