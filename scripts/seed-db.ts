import { readFileSync } from "fs";
import { createPool } from "@vercel/postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const pool = createPool({ connectionString: process.env.POSTGRES_URL });

function parseTable(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split("|").slice(1, -1).map((h) => h.trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length !== headers.length) continue;
    if (cells.every((c) => c === "")) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j];
    }
    rows.push(row);
  }
  return rows;
}

function toBool(val: string): boolean {
  return val === "-1" || val?.toLowerCase() === "yes";
}

function toDecimal(val: string): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[$,]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function toInt(val: string): number | null {
  if (!val) return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

async function main() {
  console.log("Reading files...");
  const productsText = readFileSync("C:/Users/justi/Downloads/jProduct.txt", "utf8");
  const ingredientsText = readFileSync("C:/Users/justi/Downloads/jIngredients.txt", "utf8");
  const piText = readFileSync("C:/Users/justi/Downloads/jProductIngredients.txt", "utf8");

  console.log("Creating tables...");
  const schemaSQL = readFileSync("src/lib/db/schema.sql", "utf8");
  const statements = schemaSQL.split(";").filter((s) => s.trim().length > 0);
  for (const stmt of statements) {
    await pool.query(stmt);
  }

  console.log("Parsing data...");
  const products = parseTable(productsText);
  const ingredients = parseTable(ingredientsText);
  const productIngredients = parseTable(piText);
  console.log(`  Products: ${products.length}, Ingredients: ${ingredients.length}, Links: ${productIngredients.length}`);

  console.log("Clearing existing data...");
  await pool.query("DELETE FROM product_ingredients");
  await pool.query("DELETE FROM products");
  await pool.query("DELETE FROM ingredients");

  console.log("Seeding ingredients...");
  let ingredientCount = 0;
  for (const row of ingredients) {
    const legacyId = toInt(row["ID"]);
    if (!legacyId) continue;
    await pool.query(
      `INSERT INTO ingredients (legacy_id, item_name, generic_name, item_cost, item_measurement, item_unit, item_unit_qty, item_number, company_name, company_name_2, supplier, active, ingredient_text, allergen_alcohol, allergen_corn_syrup, allergen_egg, allergen_milk, allergen_peanuts, allergen_soy, allergen_sulfites, allergen_tree_nuts, allergen_wheat)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (legacy_id) DO NOTHING`,
      [legacyId, row["ItemName"] || "", row["GenericName"] || null, toDecimal(row["ItemCost"]), row["ItemMeasurement"] || null, row["ItemUnit"] || null, toInt(row["ItemUnitQty"]), row["xItem Number"] || null, row["xCompany Name2"] || null, row["xCompany Name"] || null, row["xSupplier"] || null, toBool(row["Active"]), row["Ingredient"] || null, toBool(row["Alcohol"]), toBool(row["Corn Syrup"]), toBool(row["Egg"]), toBool(row["Milk and Milk Derivatives"]), toBool(row["Peanuts and Peanut Derivatives"]), toBool(row["Soybean and Soybean Derivatives"]), toBool(row["Sulfites"]), toBool(row["Tree Nuts"]), toBool(row["Wheat and Other Gluten Sources"])]
    );
    ingredientCount++;
    if (ingredientCount % 50 === 0) process.stdout.write(`  ${ingredientCount}...\r`);
  }
  console.log(`  Done: ${ingredientCount} ingredients`);

  console.log("Seeding products...");
  let productCount = 0;
  for (const row of products) {
    const legacyId = toInt(row["ID"]);
    if (!legacyId) continue;
    await pool.query(
      `INSERT INTO products (legacy_id, sold_id, name, tagline, notes, label_text, label_type, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (legacy_id) DO NOTHING`,
      [legacyId, row["SoldID"] || null, row["ProductName"] || "", row["TagLine"] || null, row["Notes"] || null, row["LabelText"] || null, row["LabelType"] || null, toBool(row["Active"])]
    );
    productCount++;
  }
  console.log(`  Done: ${productCount} products`);

  console.log("Seeding product_ingredients...");
  let piCount = 0;

  // Build lookup maps for IDs
  const productIdMap = new Map<number, number>();
  const pRes = await pool.query("SELECT id, legacy_id FROM products");
  for (const r of pRes.rows) productIdMap.set(r.legacy_id, r.id);

  const ingredientIdMap = new Map<number, number>();
  const iRes = await pool.query("SELECT id, legacy_id FROM ingredients");
  for (const r of iRes.rows) ingredientIdMap.set(r.legacy_id, r.id);

  for (const row of productIngredients) {
    const productLegacyId = toInt(row["ProductID"]);
    if (!productLegacyId) continue;
    const productId = productIdMap.get(productLegacyId);
    if (!productId) continue;

    // Bases (1-8)
    for (let i = 1; i <= 8; i++) {
      const vol = row[`BaseVol ${i}`];
      const ingLegacyId = toInt(row[`Base ${i}`]);
      if (!ingLegacyId || ingLegacyId === 0) continue;
      const ingId = ingredientIdMap.get(ingLegacyId);
      if (!ingId) continue;
      await pool.query(
        `INSERT INTO product_ingredients (product_id, ingredient_id, role, position, volume)
         VALUES ($1,$2,'base',$3,$4)
         ON CONFLICT (product_id, role, position) DO NOTHING`,
        [productId, ingId, i, vol || null]
      );
      piCount++;
    }

    // Add-ins (1-3)
    for (let i = 1; i <= 3; i++) {
      const vol = row[`AddVol ${i}`];
      const ingLegacyId = toInt(row[`Add In ${i}`]);
      if (!ingLegacyId || ingLegacyId === 0) continue;
      const ingId = ingredientIdMap.get(ingLegacyId);
      if (!ingId) continue;
      await pool.query(
        `INSERT INTO product_ingredients (product_id, ingredient_id, role, position, volume)
         VALUES ($1,$2,'addin',$3,$4)
         ON CONFLICT (product_id, role, position) DO NOTHING`,
        [productId, ingId, i, vol || null]
      );
      piCount++;
    }

    // Fold-ins (1-3)
    for (let i = 1; i <= 3; i++) {
      const vol = row[`FoldVol ${i}`];
      const ingLegacyId = toInt(row[`Fold In ${i}`]);
      if (!ingLegacyId || ingLegacyId === 0) continue;
      const ingId = ingredientIdMap.get(ingLegacyId);
      if (!ingId) continue;
      await pool.query(
        `INSERT INTO product_ingredients (product_id, ingredient_id, role, position, volume)
         VALUES ($1,$2,'foldin',$3,$4)
         ON CONFLICT (product_id, role, position) DO NOTHING`,
        [productId, ingId, i, vol || null]
      );
      piCount++;
    }

    if (piCount % 100 === 0) process.stdout.write(`  ${piCount}...\r`);
  }
  console.log(`  Done: ${piCount} product-ingredient links`);

  console.log("\nSeed complete!");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
