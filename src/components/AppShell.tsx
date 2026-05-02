"use client";

import Nav from "./Nav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>
      <footer className="text-center text-xs text-gray-400 py-3 border-t">
        Confidential — Internal Use Only
      </footer>
    </>
  );
}
