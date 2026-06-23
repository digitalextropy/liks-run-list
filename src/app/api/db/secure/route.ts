import { query } from "@/lib/db/pool";
import { NextResponse } from "next/server";

// One-off admin endpoint to enable Row-Level Security on the public tables and
// revoke anon/authenticated access. Idempotent — safe to hit more than once.
// Protected by the login middleware (requires the liks_session cookie).
// Safe to delete once the Supabase advisor warning clears.
export async function GET() {
  try {
    await query("ALTER TABLE products ENABLE ROW LEVEL SECURITY");
    await query("ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY");
    await query("ALTER TABLE product_ingredients ENABLE ROW LEVEL SECURITY");
    await query(
      "REVOKE ALL ON products, ingredients, product_ingredients FROM anon, authenticated"
    );

    // Report RLS status for every base table in the public schema so any
    // unexpected unprotected table also shows up.
    const status = await query(
      `SELECT relname AS table, relrowsecurity AS rls_enabled
       FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
       ORDER BY relname`
    );

    return NextResponse.json({ success: true, tables: status.rows });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to enable RLS", details: String(error) },
      { status: 500 }
    );
  }
}
