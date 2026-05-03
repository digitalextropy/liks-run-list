import { config } from "dotenv";
config({ path: ".env.local" });
import { createPool } from "@vercel/postgres";

const pool = createPool({ connectionString: process.env.POSTGRES_URL });

async function check() {
  const p = await pool.query("SELECT COUNT(*) as c FROM products");
  const i = await pool.query("SELECT COUNT(*) as c FROM ingredients");
  const pi = await pool.query("SELECT COUNT(*) as c FROM product_ingredients");
  const active = await pool.query("SELECT COUNT(*) as c FROM products WHERE active = true");
  console.log("Products:", p.rows[0].c);
  console.log("Ingredients:", i.rows[0].c);
  console.log("Product-Ingredients:", pi.rows[0].c);
  console.log("Active Products:", active.rows[0].c);

  const sample = await pool.query(
    `SELECT p.name, i.item_name, pi.role, pi.position, pi.volume
     FROM product_ingredients pi
     JOIN products p ON p.id = pi.product_id
     JOIN ingredients i ON i.id = pi.ingredient_id
     WHERE p.name = 'Almond Roca'
     ORDER BY pi.role, pi.position`
  );
  console.log("\nSample - Almond Roca:");
  for (const r of sample.rows) {
    console.log(`  ${r.role} #${r.position}: ${r.volume} — ${r.item_name}`);
  }

  await pool.end();
}

check().catch((e) => { console.error(e); process.exit(1); });
