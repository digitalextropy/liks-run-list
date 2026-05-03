import { extractText as unpdfExtractText, getDocumentProxy } from "unpdf";
import type { Recipe } from "./recipe-schema";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await unpdfExtractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

export async function extractPdfTextFromUrl(url: string): Promise<string> {
  const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to fetch PDF (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return extractPdfText(buffer);
}

async function extractPagesFromBuffer(buffer: Buffer): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await unpdfExtractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

const ALWAYS_TA_PATTERNS = [
  /cotton candy/i,
  /oreo/i,
  /cookie dough/i,
  /brownie/i,
  /graham/i,
  /cheesecake/i,
  /candy bar/i,
  /snickers/i,
  /butterfinger/i,
  /reese/i,
  /peanut butter cup/i,
  /m&m/i,
  /m and m/i,
  /heath/i,
  /toffee/i,
  /marshmallow/i,
  /toll house/i,
  /chunk/i,
  /piece/i,
  /nerds/i,
];

const CONDITIONAL_TA_PATTERNS = [
  /choco flakes/i,
  /chocolate flake/i,
  /chocolate chip/i,
  /choc chip/i,
  /fudge/i,
  /caramel/i,
  /cocoa/i,
];

const SECTION_HEADERS = [
  "Base Flavors:",
  "Add Ins:",
  "Fold Ins:",
  "Notes:",
  "Ingredients:",
  "Allergens:",
] as const;

function getTaTrigger(name: string): "always" | "conditional" | "none" {
  if (ALWAYS_TA_PATTERNS.some((re) => re.test(name))) return "always";
  if (CONDITIONAL_TA_PATTERNS.some((re) => re.test(name))) return "conditional";
  return "none";
}

function detectBaseType(baseLines: string[]): Recipe["base"]["type"] {
  const text = baseLines.join(" ").toLowerCase();
  if (/cheesecake/i.test(text)) return "cheesecake";
  if (/graham/i.test(text)) return "graham";
  if (/chocolate (ice cream )?mix/i.test(text)) return "chocolate";
  if (/sorbet/i.test(text)) return "sorbet";
  if (/sherbet/i.test(text)) return "sherbet";
  if (/vegan|oat milk|coconut milk/i.test(text)) return "vegan";
  return "plain";
}

function isInstructionalLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^pour the following/i.test(t)) return true;
  if (/^fold-?in the below/i.test(t)) return true;
  if (/^before turning/i.test(t)) return true;
  if (/^halfway through/i.test(t)) return true;
  if (/^using the/i.test(t)) return true;
  if (/^after the freezing/i.test(t)) return true;
  return false;
}

function parseIngredient(line: string): { name: string; quantity: string } | null {
  const t = line.trim();
  if (!t) return null;
  // Match leading quantity like "1 2.5 Ga", "8 cups", "1 1/2 qts", "36 oz", "1/2 cup"
  const m = t.match(
    /^(\d+(\s+\d+)?(\s*\/\s*\d+)?\s+\d*\.?\d*\s*(ga|gal|gallon|qt|qts|cup|cups|oz|lb|lbs|tbsp|tsp|piece|pieces|pcs|each)?\b\s*)/i
  );
  if (m) {
    const quantity = m[1].trim();
    const name = t.slice(m[0].length).trim();
    if (name) return { name, quantity };
  }
  // Fallback: leading number(s) at start, rest is name
  const m2 = t.match(/^([\d/.\s]+\s*\w+)\s+(.+)$/);
  if (m2) {
    return { name: m2[2].trim(), quantity: m2[1].trim() };
  }
  return null;
}

function findSection(text: string, header: (typeof SECTION_HEADERS)[number]): string | null {
  const idx = text.indexOf(header);
  if (idx < 0) return null;
  let endIdx = text.length;
  for (const next of SECTION_HEADERS) {
    if (next === header) continue;
    const j = text.indexOf(next, idx + header.length);
    if (j > -1 && j < endIdx) endIdx = j;
  }
  return text.slice(idx + header.length, endIdx).trim();
}

function getIngredientLines(section: string): string[] {
  // Split by line breaks first; if the section is one long line, split on the
  // pattern "<digits>... <Capitalized word>" — quantities always start with a digit.
  let lines = section.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !isInstructionalLine(l));
  if (lines.length <= 1 && section.trim().length > 0) {
    // Single line — split before each new quantity
    const t = section.replace(/^\s*Pour[^.]+\.\s*/i, "").replace(/^\s*Fold-?in[^.]+\.\s*/i, "");
    lines = t
      .split(/(?=\b\d+(?:\s+\d+)?(?:\s*\/\s*\d+)?\s+(?:ga|gal|qt|cup|oz|lb|tbsp|tsp)\b)/i)
      .map((l) => l.trim())
      .filter((l) => l && !isInstructionalLine(l) && /^\d/.test(l));
  }
  return lines;
}

function parseAllergens(section: string | null): string[] {
  if (!section) return [];
  // Allergens are usually a comma-separated list followed by boilerplate.
  // Take the first sentence/line.
  const firstLine = section.split(/[\n.]/)[0];
  return firstLine
    .split(/,|\sand\s/i)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 0 &&
        s.length < 60 &&
        !/derivative/i.test(s) &&
        !/our products/i.test(s)
    )
    .map((s) => s.replace(/\s+derivatives?$/i, "").trim())
    .filter(Boolean);
}

function parsePage(pageText: string): Recipe | null {
  // Split into lines and find the recipe name (first non-empty line).
  const lines = pageText.split(/\r?\n/).map((l) => l.trim());
  const firstNonEmpty = lines.find((l) => l.length > 0);
  if (!firstNonEmpty) return null;
  // Skip pages that don't look like recipes (no Base Flavors marker).
  if (!pageText.includes("Base Flavors:")) return null;

  const name = firstNonEmpty;

  const baseSection = findSection(pageText, "Base Flavors:");
  const addInsSection = findSection(pageText, "Add Ins:");
  const foldInsSection = findSection(pageText, "Fold Ins:");
  const allergensSection = findSection(pageText, "Allergens:");

  const baseLines = baseSection ? getIngredientLines(baseSection) : [];
  const addInLines = addInsSection ? getIngredientLines(addInsSection) : [];
  const foldInLines = foldInsSection ? getIngredientLines(foldInsSection) : [];

  const baseType = detectBaseType(baseLines);
  const addIns = addInLines
    .map(parseIngredient)
    .filter((x): x is { name: string; quantity: string } => x !== null)
    .map(({ name, quantity }) => ({
      name,
      quantity,
      taTrigger: getTaTrigger(name),
    }));

  const foldIns = foldInLines
    .map(parseIngredient)
    .filter((x): x is { name: string; quantity: string } => x !== null);

  const allergens = parseAllergens(allergensSection);
  const eligible44qt =
    foldIns.length === 0 && baseType !== "sorbet" && baseType !== "sherbet";

  return {
    name,
    base: { type: baseType, ingredients: baseLines },
    addIns,
    foldIns,
    allergens,
    eligible44qt,
    notes: null,
  };
}

export async function parsePdfBuffer(buffer: Buffer): Promise<Recipe[]> {
  const pages = await extractPagesFromBuffer(buffer);
  const recipes: Recipe[] = [];
  for (const page of pages) {
    const recipe = parsePage(page);
    if (recipe) recipes.push(recipe);
  }
  return recipes;
}

export async function parsePdfFromUrl(url: string): Promise<Recipe[]> {
  const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to fetch PDF (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return parsePdfBuffer(buffer);
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
    const matchCount = words.filter((w) =>
      rWords.some((rw) => rw.includes(w) || w.includes(rw))
    ).length;
    return { recipe: r, score: matchCount / Math.max(words.length, rWords.length) };
  });
  scored.sort((a, b) => b.score - a.score);

  if (scored[0] && scored[0].score > 0.5) return scored[0].recipe;
  return null;
}
