import { query } from "@/lib/db/pool";
import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

function parseTable(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine
    .split("|")
    .slice(1, -1)
    .map((h) => h.trim());

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

    const schemaSQL = readFileSync(join(process.cwd(), "src/lib/db/schema.sql"), "utf8");
    const statements = schemaSQL.split(";").filter((s) => s.trim().length > 0);
    for (const stmt of statements) {
      await query(stmt);
    }

    const products = parseTable(productsText);
    const ingredients = parseTable(ingredientsText);
    const productIngredients = parseTable(productIngredientsText);

    await query("DELETE FROM product_ingredients");
    await query("DELETE FROM products");
    await query("DELETE FROM ingredients");

    let ingredientCount = 0;
    for (const row of ingredients) {
      const legacyId = toInt(row["ID"]);
      if (!legacyId) continue;
      await query(
        `INSERT INTO ingredients (legacy_id, item_name, generic_name, item_cost, item_measurement, item_unit, item_unit_qty, active, ingredient_text, allergen_alcohol, allergen_corn_syrup, allergen_egg, allergen_milk, allergen_peanuts, allergen_soy, allergen_sulfites, allergen_tree_nuts, allergen_wheat)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (legacy_id) DO NOTHING`,
        [legacyId, row["ItemName"] || "", row["GenericName"] || null, toDecimal(row["ItemCost"]), row["ItemMeasurement"] || null, row["ItemUnit"] || null, toInt(row["ItemUnitQty"]), toBool(row["Active"]), row["Ingredient"] || null, toBool(row["Alcohol"]), toBool(row["Corn Syrup"]), toBool(row["Egg"]), toBool(row["Milk and Milk Derivatives"]), toBool(row["Peanuts and Peanut Derivatives"]), toBool(row["Soybean and Soybean Derivatives"]), toBool(row["Sulfites"]), toBool(row["Tree Nuts"]), toBool(row["Wheat and Other Gluten Sources"])]
      );
      ingredientCount++;
    }

    let productCount = 0;
    for (const row of products) {
      const legacyId = toInt(row["ID"]);
      if (!legacyId) continue;
      await query(
        `INSERT INTO products (legacy_id, sold_id, name, tagline, notes, label_text, label_type, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (legacy_id) DO NOTHING`,
        [legacyId, row["SoldID"] || null, row["ProductName"] || "", row["TagLine"] || null, row["Notes"] || null, row["LabelText"] || null, row["LabelType"] || null, toBool(row["Active"])]
      );
      productCount++;
    }

    let piCount = 0;
    for (const row of productIngredients) {
      const productLegacyId = toInt(row["ProductID"]);
      if (!productLegacyId) continue;

      const productResult = await query("SELECT id FROM products WHERE legacy_id = $1", [productLegacyId]);
      if (productResult.rows.length === 0) continue;
      const productId = productResult.rows[0].id;

      for (let i = 1; i <= 8; i++) {
        const vol = row[`BaseVol ${i}`];
        const ingId = toInt(row[`Base ${i}`]);
        if (!ingId || ingId === 0) continue;
        const ingResult = await query("SELECT id FROM ingredients WHERE legacy_id = $1", [ingId]);
        if (ingResult.rows.length === 0) continue;
        await query(
          `INSERT INTO product_ingredients (product_id, ingredient_id, role, position, volume)
           VALUES ($1, $2, 'base', $3, $4)
           ON CONFLICT (product_id, role, position) DO NOTHING`,
          [productId, ingResult.rows[0].id, i, vol || null]
        );
        piCount++;
      }

      for (let i = 1; i <= 3; i++) {
        const vol = row[`AddVol ${i}`];
        const ingId = toInt(row[`Add In ${i}`]);
        if (!ingId || ingId === 0) continue;
        const ingResult = await query("SELECT id FROM ingredients WHERE legacy_id = $1", [ingId]);
        if (ingResult.rows.length === 0) continue;
        await query(
          `INSERT INTO product_ingredients (product_id, ingredient_id, role, position, volume)
           VALUES ($1, $2, 'addin', $3, $4)
           ON CONFLICT (product_id, role, position) DO NOTHING`,
          [productId, ingResult.rows[0].id, i, vol || null]
        );
        piCount++;
      }

      for (let i = 1; i <= 3; i++) {
        const vol = row[`FoldVol ${i}`];
        const ingId = toInt(row[`Fold In ${i}`]);
        if (!ingId || ingId === 0) continue;
        const ingResult = await query("SELECT id FROM ingredients WHERE legacy_id = $1", [ingId]);
        if (ingResult.rows.length === 0) continue;
        await query(
          `INSERT INTO product_ingredients (product_id, ingredient_id, role, position, volume)
           VALUES ($1, $2, 'foldin', $3, $4)
           ON CONFLICT (product_id, role, position) DO NOTHING`,
          [productId, ingResult.rows[0].id, i, vol || null]
        );
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
