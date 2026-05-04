import { readFileSync } from "fs";
import { createPool } from "@vercel/postgres";
import { config } from "dotenv";
import * as XLSX from "xlsx";

config({ path: ".env.local" });

const pool = createPool({ connectionString: process.env.POSTGRES_URL });

function toBool(val: unknown): boolean {
  if (val === true || val === -1 || val === "Yes" || val === "yes" || val === "-1") return true;
  return false;
}

async function main() {
  const workbook = XLSX.readFile("C:/Users/justi/Downloads/jProduct.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  console.log(`Parsed ${rows.length} rows from Excel`);
  console.log("Headers:", Object.keys(rows[0]));

  // Show a sample to verify full-length fields
  const sample = rows.find((r) => r["ProductName"] === "Almond Roca");
  if (sample) {
    console.log("\nSample - Almond Roca:");
    console.log("  TagLine:", JSON.stringify(sample["TagLine"]));
    console.log("  Notes:", JSON.stringify(sample["Notes"]));
    console.log("  LabelText:", JSON.stringify(sample["LabelText"]));
  }

  // Check for truncation: count taglines > 76 chars
  const longTaglines = rows.filter((r) => String(r["TagLine"] || "").length > 76);
  console.log(`\nTaglines > 76 chars: ${longTaglines.length} (were truncated before)`);
  const longNotes = rows.filter((r) => String(r["Notes"] || "").length > 100);
  console.log(`Notes > 100 chars: ${longNotes.length} (were truncated before)`);

  // Update each product by legacy_id
  let updated = 0;
  let notFound = 0;
  for (const row of rows) {
    const legacyId = Number(row["ID"]);
    if (!legacyId) continue;

    const name = String(row["ProductName"] || "");
    const soldId = row["SoldID"] ? String(row["SoldID"]) : null;
    const tagline = row["TagLine"] ? String(row["TagLine"]) : null;
    const notes = row["Notes"] ? String(row["Notes"]) : null;
    const labelText = row["LabelText"] ? String(row["LabelText"]) : null;
    const labelType = row["LabelType"] ? String(row["LabelType"]) : null;
    const active = toBool(row["Active"]);

    const result = await pool.query(
      `UPDATE products SET name=$1, sold_id=$2, tagline=$3, notes=$4, label_text=$5, label_type=$6, active=$7
       WHERE legacy_id=$8`,
      [name, soldId, tagline, notes, labelText, labelType, active, legacyId]
    );

    if (result.rowCount && result.rowCount > 0) {
      updated++;
    } else {
      notFound++;
      console.log(`  Not found in DB: legacy_id=${legacyId} (${name})`);
    }
  }

  console.log(`\nUpdated ${updated} products, ${notFound} not found in DB`);

  // Now fix special characters across all text fields
  console.log("\nFixing special characters...");

  // Replace common bad chars: â€™ -> ', Ã© -> é, Â® -> (remove), etc.
  // But per user preference: use plain ASCII (Creme not Crème, drop ® ™)
  const fixResult = await pool.query(
    `SELECT id, name, tagline, notes, label_text FROM products
     WHERE name ~ '[^\\x20-\\x7E]' OR tagline ~ '[^\\x20-\\x7E]' OR notes ~ '[^\\x20-\\x7E]' OR label_text ~ '[^\\x20-\\x7E]'`
  );

  console.log(`Found ${fixResult.rows.length} products with special characters`);

  for (const row of fixResult.rows) {
    const fix = (s: string | null) => {
      if (!s) return s;
      return s
        .replace(/Cr[èé]me/g, "Creme")
        .replace(/CR[ÈÉ]ME/g, "CREME")
        .replace(/[®™©]/g, "")
        .replace(/['']/g, "'")
        .replace(/[""]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/®/g, "")  // ®
        .replace(/™/g, "")  // ™
        .replace(/è/g, "e") // è
        .replace(/é/g, "e") // é
        .replace(/È/g, "E") // È
        .replace(/É/g, "E") // É
        .replace(/î/g, "i") // î
        .replace(/û/g, "u") // û
        .replace(/à/g, "a") // à
        .replace(/â/g, "a") // â
        .replace(/ô/g, "o") // ô
        .replace(/[-ÿ]/g, (ch) => {
          // Fallback: strip any remaining Latin-1 supplement chars
          console.log(`  Stripping unhandled char U+${ch.charCodeAt(0).toString(16).padStart(4, "0")} in product ${row.id} (${row.name})`);
          return "";
        });
    };

    const fixedName = fix(row.name);
    const fixedTagline = fix(row.tagline);
    const fixedNotes = fix(row.notes);
    const fixedLabelText = fix(row.label_text);

    if (fixedName !== row.name || fixedTagline !== row.tagline || fixedNotes !== row.notes || fixedLabelText !== row.label_text) {
      await pool.query(
        `UPDATE products SET name=$1, tagline=$2, notes=$3, label_text=$4 WHERE id=$5`,
        [fixedName, fixedTagline, fixedNotes, fixedLabelText, row.id]
      );
      console.log(`  Fixed: ${row.name} -> ${fixedName}`);
    }
  }

  // Also fix ingredients
  const ingFix = await pool.query(
    `SELECT id, item_name, generic_name, ingredient_text FROM ingredients
     WHERE item_name ~ '[^\\x20-\\x7E]' OR generic_name ~ '[^\\x20-\\x7E]' OR ingredient_text ~ '[^\\x20-\\x7E]'`
  );

  console.log(`\nFound ${ingFix.rows.length} ingredients with special characters`);
  for (const row of ingFix.rows) {
    const fix = (s: string | null) => {
      if (!s) return s;
      return s
        .replace(/Cr[èé]me/g, "Creme")
        .replace(/CR[ÈÉ]ME/g, "CREME")
        .replace(/[®™©]/g, "")
        .replace(/['']/g, "'")
        .replace(/[""]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/[-ÿ]/g, "");
    };

    const fixedName = fix(row.item_name);
    const fixedGeneric = fix(row.generic_name);
    const fixedText = fix(row.ingredient_text);

    if (fixedName !== row.item_name || fixedGeneric !== row.generic_name || fixedText !== row.ingredient_text) {
      await pool.query(
        `UPDATE ingredients SET item_name=$1, generic_name=$2, ingredient_text=$3 WHERE id=$4`,
        [fixedName, fixedGeneric, fixedText, row.id]
      );
      console.log(`  Fixed: ${row.item_name} -> ${fixedName}`);
    }
  }

  // Final check
  const remaining = await pool.query(
    `SELECT COUNT(*) as c FROM products WHERE name ~ '[^\\x20-\\x7E]' OR tagline ~ '[^\\x20-\\x7E]' OR notes ~ '[^\\x20-\\x7E]' OR label_text ~ '[^\\x20-\\x7E]'`
  );
  const remainingIng = await pool.query(
    `SELECT COUNT(*) as c FROM ingredients WHERE item_name ~ '[^\\x20-\\x7E]' OR generic_name ~ '[^\\x20-\\x7E]' OR ingredient_text ~ '[^\\x20-\\x7E]'`
  );
  console.log(`\nRemaining special chars: ${remaining.rows[0].c} products, ${remainingIng.rows[0].c} ingredients`);

  console.log("\nDone!");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
