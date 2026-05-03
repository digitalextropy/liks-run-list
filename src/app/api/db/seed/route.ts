import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Parse Access-exported pipe-delimited table text
function parseTable(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return [];

  // First pipe-line is the header
  const headerLine = lines[0];
  const headers = headerLine
    .split("|")
    .slice(1, -1)
    .map((h) => h.trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length !== headers.length) continue;
    // Skip rows that are all empty (continuation lines from multi-line fields)
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
  return val === "-1" || val.toLowerCase() === "yes";
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

export async function POST(request: Request) {
  try {
    const { productsText, ingredientsText, productIngredientsText } = await request.json();

    if (!productsText || !ingredientsText || !productIngredientsText) {
      return NextResponse.json(
        { error: "Must provide productsText, ingredientsText, and productIngredientsText" },
        { status: 400 }
      );
    }

    // Create tables
    const schemaSQL = readFileSync(join(process.cwd(), "src/lib/db/schema.sql"), "utf8");
    const statements = schemaSQL.split(";").filter((s) => s.trim().length > 0);
    for (const stmt of statements) {
      await sql.query(stmt);
    }

    // Parse data
    const products = parseTable(productsText);
    const ingredients = parseTable(ingredientsText);
    const productIngredients = parseTable(productIngredientsText);

    // Clear existing data (in order due to foreign keys)
    await sql`DELETE FROM product_ingredients`;
    await sql`DELETE FROM products`;
    await sql`DELETE FROM ingredients`;

    // Seed ingredients
    let ingredientCount = 0;
    for (const row of ingredients) {
      const legacyId = toInt(row["ID"]);
      if (!legacyId) continue;
      await sql`
        INSERT INTO ingredients (legacy_id, item_name, generic_name, item_cost, item_measurement, item_unit, item_unit_qty, item_number, company_name, company_name_2, supplier, active, ingredient_text, allergen_alcohol, allergen_corn_syrup, allergen_egg, allergen_milk, allergen_peanuts, allergen_soy, allergen_sulfites, allergen_tree_nuts, allergen_wheat)
        VALUES (${legacyId}, ${row["ItemName"] || ""}, ${row["GenericName"] || null}, ${toDecimal(row["ItemCost"])}, ${row["ItemMeasurement"] || null}, ${row["ItemUnit"] || null}, ${toInt(row["ItemUnitQty"])}, ${row["xItem Number"] || null}, ${row["xCompany Name2"] || null}, ${row["xCompany Name"] || null}, ${row["xSupplier"] || null}, ${toBool(row["Active"])}, ${row["Ingredient"] || null}, ${toBool(row["Alcohol"])}, ${toBool(row["Corn Syrup"])}, ${toBool(row["Egg"])}, ${toBool(row["Milk and Milk Derivatives"])}, ${toBool(row["Peanuts and Peanut Derivatives"])}, ${toBool(row["Soybean and Soybean Derivatives"])}, ${toBool(row["Sulfites"])}, ${toBool(row["Tree Nuts"])}, ${toBool(row["Wheat and Other Gluten Sources"])})
        ON CONFLICT (legacy_id) DO NOTHING
      `;
      ingredientCount++;
    }

    // Seed products
    let productCount = 0;
    for (const row of products) {
      const legacyId = toInt(row["ID"]);
      if (!legacyId) continue;
      await sql`
        INSERT INTO products (legacy_id, sold_id, name, tagline, notes, label_text, label_type, active)
        VALUES (${legacyId}, ${row["SoldID"] || null}, ${row["ProductName"] || ""}, ${row["TagLine"] || null}, ${row["Notes"] || null}, ${row["LabelText"] || null}, ${row["LabelType"] || null}, ${toBool(row["Active"])})
        ON CONFLICT (legacy_id) DO NOTHING
      `;
      productCount++;
    }

    // Seed product_ingredients (normalized from wide format)
    let piCount = 0;
    for (const row of productIngredients) {
      const productLegacyId = toInt(row["ProductID"]);
      if (!productLegacyId) continue;

      // Get the internal product ID
      const productResult = await sql`SELECT id FROM products WHERE legacy_id = ${productLegacyId}`;
      if (productResult.rows.length === 0) continue;
      const productId = productResult.rows[0].id;

      // Bases (1-8)
      for (let i = 1; i <= 8; i++) {
        const vol = row[`BaseVol ${i}`];
        const ingId = toInt(row[`Base ${i}`]);
        if (!ingId || ingId === 0) continue;
        const ingResult = await sql`SELECT id FROM ingredients WHERE legacy_id = ${ingId}`;
        if (ingResult.rows.length === 0) continue;
        await sql`
          INSERT INTO product_ingredients (product_id, ingredient_id, role, position, volume)
          VALUES (${productId}, ${ingResult.rows[0].id}, 'base', ${i}, ${vol || null})
          ON CONFLICT (product_id, role, position) DO NOTHING
        `;
        piCount++;
      }

      // Add-ins (1-3)
      for (let i = 1; i <= 3; i++) {
        const vol = row[`AddVol ${i}`];
        const ingId = toInt(row[`Add In ${i}`]);
        if (!ingId || ingId === 0) continue;
        const ingResult = await sql`SELECT id FROM ingredients WHERE legacy_id = ${ingId}`;
        if (ingResult.rows.length === 0) continue;
        await sql`
          INSERT INTO product_ingredients (product_id, ingredient_id, role, position, volume)
          VALUES (${productId}, ${ingResult.rows[0].id}, 'addin', ${i}, ${vol || null})
          ON CONFLICT (product_id, role, position) DO NOTHING
        `;
        piCount++;
      }

      // Fold-ins (1-3)
      for (let i = 1; i <= 3; i++) {
        const vol = row[`FoldVol ${i}`];
        const ingId = toInt(row[`Fold In ${i}`]);
        if (!ingId || ingId === 0) continue;
        const ingResult = await sql`SELECT id FROM ingredients WHERE legacy_id = ${ingId}`;
        if (ingResult.rows.length === 0) continue;
        await sql`
          INSERT INTO product_ingredients (product_id, ingredient_id, role, position, volume)
          VALUES (${productId}, ${ingResult.rows[0].id}, 'foldin', ${i}, ${vol || null})
          ON CONFLICT (product_id, role, position) DO NOTHING
        `;
        piCount++;
      }
    }

    return NextResponse.json({
      success: true,
      counts: { ingredients: ingredientCount, products: productCount, productIngredients: piCount },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Seed failed", details: String(error) },
      { status: 500 }
    );
  }
}

export const maxDuration = 300;
