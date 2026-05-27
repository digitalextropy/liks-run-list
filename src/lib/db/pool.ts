import { createPool, type VercelPool } from "@vercel/postgres";

// Lazy pool init — createPool throws synchronously when POSTGRES_URL is unset,
// which broke Next.js page-data collection on Vercel preview deploys (where
// production env vars aren't always present). Defer to first request instead.
let _pool: VercelPool | null = null;

function getPool(): VercelPool {
  if (!_pool) {
    _pool = createPool({ connectionString: process.env.POSTGRES_URL });
  }
  return _pool;
}

export async function query(text: string, params?: unknown[]) {
  return getPool().query(text, params);
}
