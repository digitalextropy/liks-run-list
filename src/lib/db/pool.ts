import { createPool } from "@vercel/postgres";

const pool = createPool({ connectionString: process.env.POSTGRES_URL });

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

export { pool };
