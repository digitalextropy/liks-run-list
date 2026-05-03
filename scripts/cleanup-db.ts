import { createPool } from "@vercel/postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const pool = createPool({ connectionString: process.env.POSTGRES_URL });

async function main() {
  // Show before samples
  console.log("=== BEFORE: Sample ingredients ===");
  const before = await pool.query(
    `SELECT id, item_name, item_number, company_name, company_name_2, supplier, ingredient_text
     FROM ingredients LIMIT 5`
  );
  console.table(before.rows);

  // Drop unused columns
  console.log("\nDropping columns: item_number, company_name, company_name_2, supplier...");
  await pool.query(`ALTER TABLE ingredients DROP COLUMN IF EXISTS item_number`);
  await pool.query(`ALTER TABLE ingredients DROP COLUMN IF EXISTS company_name`);
  await pool.query(`ALTER TABLE ingredients DROP COLUMN IF EXISTS company_name_2`);
  await pool.query(`ALTER TABLE ingredients DROP COLUMN IF EXISTS supplier`);
  console.log("Done dropping columns.");

  // Normalize ingredient_text to Title Case using INITCAP
  console.log("\nNormalizing ingredient_text to Title Case with INITCAP()...");
  const updateResult = await pool.query(
    `UPDATE ingredients SET ingredient_text = INITCAP(ingredient_text) WHERE ingredient_text IS NOT NULL`
  );
  console.log(`Updated ${updateResult.rowCount} rows.`);

  // Show after samples
  console.log("\n=== AFTER: Sample ingredients ===");
  const after = await pool.query(
    `SELECT id, item_name, ingredient_text FROM ingredients LIMIT 5`
  );
  console.table(after.rows);

  await pool.end();
  console.log("\nCleanup complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
