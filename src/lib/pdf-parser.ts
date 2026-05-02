import { PDFParse } from "pdf-parse";
import type { Recipe } from "./recipe-schema";

async function extractText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = result as any;
  if (typeof r === "string") return r;
  if (r.text) return r.text;
  if (r.pages) return r.pages.map((p: { text: string }) => p.text).join("\n");
  return String(r);
}

const ALWAYS_TA_INGREDIENTS = [
  "cotton candy",
  "oreo",
  "cookie dough",
  "brownie",
  "graham cracker",
  "cheesecake",
  "candy bar",
  "snickers",
  "butterfinger",
  "reese",
  "peanut butter cup",
  "m&m",
  "heath",
  "toffee",
  "marshmallow",
];

const CONDITIONAL_TA_INGREDIENTS = [
  "choco flakes",
  "chocolate flakes",
  "chocolate chips",
  "cocoa",
  "fudge",
  "caramel",
];

export async function parsePdfBuffer(buffer: Buffer): Promise<Recipe[]> {
  const text = await extractText(buffer);
  return parseRecipeText(text);
}

export async function parsePdfFromUrl(url: string): Promise<Recipe[]> {
  const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return parsePdfBuffer(buffer);
}

function parseRecipeText(text: string): Recipe[] {
  const recipes: Recipe[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentRecipe: Partial<Recipe> | null = null;
  let section: "base" | "addins" | "foldins" | "none" = "none";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isRecipeHeader(line, lines[i + 1])) {
      if (currentRecipe?.name) {
        recipes.push(finalizeRecipe(currentRecipe));
      }
      currentRecipe = {
        name: cleanRecipeName(line),
        base: { type: "plain", ingredients: [] },
        addIns: [],
        foldIns: [],
        allergens: [],
        eligible44qt: true,
        notes: null,
      };
      section = "base";
      continue;
    }

    if (!currentRecipe) continue;

    if (/add.?in/i.test(line) || /mix.?in/i.test(line)) {
      section = "addins";
      continue;
    }
    if (/fold.?in/i.test(line) || /swirl/i.test(line) || /ribbon/i.test(line)) {
      section = "foldins";
      continue;
    }

    if (section === "base" && currentRecipe.base) {
      currentRecipe.base.ingredients.push(line);
      if (/chocolate|cocoa/i.test(line)) currentRecipe.base.type = "chocolate";
      if (/sorbet/i.test(line)) currentRecipe.base.type = "sorbet";
      if (/sherbet/i.test(line)) currentRecipe.base.type = "sherbet";
      if (/vegan|oat|coconut milk/i.test(line)) currentRecipe.base.type = "vegan";
      if (/graham/i.test(line)) currentRecipe.base.type = "graham";
      if (/cheesecake/i.test(line)) currentRecipe.base.type = "cheesecake";
    } else if (section === "addins") {
      const parsed = parseIngredientLine(line);
      if (parsed) {
        currentRecipe.addIns!.push({
          name: parsed.name,
          quantity: parsed.quantity,
          taTrigger: getTaTrigger(parsed.name),
        });
      }
    } else if (section === "foldins") {
      const parsed = parseIngredientLine(line);
      if (parsed) {
        currentRecipe.foldIns!.push({
          name: parsed.name,
          quantity: parsed.quantity,
        });
        currentRecipe.eligible44qt = false;
      }
    }
  }

  if (currentRecipe?.name) {
    recipes.push(finalizeRecipe(currentRecipe));
  }

  return recipes;
}

function isRecipeHeader(line: string, nextLine?: string): boolean {
  if (!line || line.length < 3 || line.length > 60) return false;
  if (/^\d+(\.\d+)?\s*(qt|oz|lb|cup|gal)/i.test(line)) return false;
  if (/^(add|fold|mix|swirl|ribbon)/i.test(line)) return false;
  const hasUpperStart = /^[A-Z]/.test(line);
  const looksLikeTitle = !/^\d/.test(line) && !line.includes("=");
  return hasUpperStart && looksLikeTitle && line.split(" ").length <= 8;
}

function cleanRecipeName(line: string): string {
  return line.replace(/[*#_]/g, "").trim();
}

function parseIngredientLine(line: string): { name: string; quantity: string } | null {
  const match = line.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (match) return { name: match[1].trim(), quantity: match[2].trim() };

  const qtyMatch = line.match(/^(.+?)\s+(\d+[\d./]*\s*(qt|oz|lb|cup|gal|each|pc)s?)/i);
  if (qtyMatch) return { name: qtyMatch[1].trim(), quantity: qtyMatch[2].trim() };

  if (line.length > 2 && line.length < 50) {
    return { name: line, quantity: "as needed" };
  }
  return null;
}

function getTaTrigger(ingredient: string): "always" | "conditional" | "none" {
  const lower = ingredient.toLowerCase();
  if (ALWAYS_TA_INGREDIENTS.some((t) => lower.includes(t))) return "always";
  if (CONDITIONAL_TA_INGREDIENTS.some((t) => lower.includes(t))) return "conditional";
  return "none";
}

function finalizeRecipe(partial: Partial<Recipe>): Recipe {
  const recipe: Recipe = {
    name: partial.name || "Unknown",
    base: partial.base || { type: "plain", ingredients: [] },
    addIns: partial.addIns || [],
    foldIns: partial.foldIns || [],
    allergens: detectAllergens(partial),
    eligible44qt: partial.eligible44qt !== false && (partial.foldIns?.length || 0) === 0,
    notes: partial.notes || null,
  };

  if (recipe.base.type === "sorbet" || recipe.base.type === "sherbet") {
    recipe.eligible44qt = false;
  }

  return recipe;
}

function detectAllergens(partial: Partial<Recipe>): string[] {
  const allergens = new Set<string>();
  const allText = [
    ...(partial.base?.ingredients || []),
    ...(partial.addIns?.map((a) => a.name) || []),
    ...(partial.foldIns?.map((f) => f.name) || []),
  ]
    .join(" ")
    .toLowerCase();

  if (/peanut|pb/i.test(allText)) allergens.add("Peanut");
  if (/almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|tree.?nut/i.test(allText))
    allergens.add("Tree Nuts");
  if (/wheat|flour|cookie|brownie|cake|graham/i.test(allText)) allergens.add("Wheat");
  if (/egg/i.test(allText)) allergens.add("Egg");
  if (/soy/i.test(allText)) allergens.add("Soy");

  return Array.from(allergens);
}

export function fuzzyMatchRecipe(input: string, recipes: Recipe[]): Recipe | null {
  const normalized = input.toLowerCase().trim();
  const exact = recipes.find((r) => r.name.toLowerCase() === normalized);
  if (exact) return exact;

  const partial = recipes.find((r) => r.name.toLowerCase().includes(normalized));
  if (partial) return partial;

  const reversePartial = recipes.find((r) => normalized.includes(r.name.toLowerCase()));
  if (reversePartial) return reversePartial;

  const words = normalized.split(/\s+/);
  const scored = recipes.map((r) => {
    const rWords = r.name.toLowerCase().split(/\s+/);
    const matchCount = words.filter((w) => rWords.some((rw) => rw.includes(w) || w.includes(rw))).length;
    return { recipe: r, score: matchCount / Math.max(words.length, rWords.length) };
  });
  scored.sort((a, b) => b.score - a.score);

  if (scored[0] && scored[0].score > 0.5) return scored[0].recipe;
  return null;
}
