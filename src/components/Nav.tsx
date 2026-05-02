"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();

  const linkClass = (active: boolean) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      active
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
            <Link href="/generate" className={linkClass(pathname === "/generate")}>
              Generate
            </Link>
            <Link href="/rules" className={linkClass(pathname === "/rules")}>
              Rules
            </Link>
            <Link
              href="/admin/recipes"
              className={linkClass(pathname.startsWith("/admin/recipes"))}
            >
              Recipes
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
