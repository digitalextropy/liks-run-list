import Anthropic from "@anthropic-ai/sdk";
import type { ProductionRules } from "./rules-schema";
import type { Recipe } from "./recipe-schema";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Kept for potential future use if a PDF format ever requires AI parsing.
// Currently the deterministic per-page parser in pdf-parser.ts handles
// the production format reliably without any AI call.
const RECIPE_PARSE_SYSTEM_PROMPT = `You parse Liks Ice Cream recipe PDFs into structured JSON.

The PDF contains many recipes concatenated together as one text blob. Each recipe follows this pattern:
- Recipe name and short tagline (e.g., "Almond Roca Almond Ice Cream with a swirl of Chocolate Fudge Marble...")
- "Base Flavors:" section listing base mix and ingredients
- "Add Ins:" section listing things mixed in during freezing
- "Fold Ins:" section (optional) listing things folded in by hand after freezing
- "Notes:" section with prep details
- "Ingredients:" detailed allergen list
- "Allergens:" line listing allergens
- A standard legal/copyright footer ("Liks meets the requirements... Copyright :...")
- Then the next recipe's name immediately after.

Extract every recipe in the document. For each one return:
{
  "name": string (just the recipe name, no tagline),
  "base": {
    "type": "plain" | "chocolate" | "sorbet" | "sherbet" | "vegan" | "graham" | "cheesecake",
    "ingredients": string[] (the base mix ingredients with quantities)
  },
  "addIns": [{ "name": string, "quantity": string, "taTrigger": "always" | "conditional" | "none" }],
  "foldIns": [{ "name": string, "quantity": string }],
  "allergens": string[] (e.g. ["Tree Nuts", "Milk", "Soy"]),
  "eligible44qt": boolean (false if has fold-ins OR is sorbet/sherbet, true otherwise),
  "notes": string | null (prep notes, abbreviated)
}

For taTrigger:
- "always" for sticky/chunky pieces (cookies, dough, brownie, graham, candy bars, marshmallow, M&Ms, Oreo, Heath, Toffee, Reese's, peanut butter cups, cotton candy)
- "conditional" for choco flakes, chocolate chips, fudge, caramel, cocoa
- "none" for sprinkles, fresh fruit, extracts, food coloring, dissolved coffee, etc.

For base type: detect from Base Flavors section. "Plain Ice Cream Mix" → plain. "Chocolate Mix" → chocolate. Sorbet/Sherbet/Vegan/Graham/Cheesecake mixes → matching type.

Return ONLY a valid JSON array of recipe objects. No markdown, no commentary. Output format:
[{ "name": "...", "base": {...}, ... }, { "name": "...", ... }, ...]`;

const RECIPE_BOUNDARY_MARKER = "without written permission from Liks Ice Cream.";
const RECIPES_PER_CHUNK = 10;

function chunkPdfByRecipes(pdfText: string): string[] {
  const segments = pdfText.split(RECIPE_BOUNDARY_MARKER);
  // Each segment past index 0 starts at a recipe name. Index 0 is preamble + first recipe.
  const recipeBlocks = segments
    .map((s) => s.trim())
    .filter((s) => s.length > 100); // Drop tiny tail fragments

  const chunks: string[] = [];
  for (let i = 0; i < recipeBlocks.length; i += RECIPES_PER_CHUNK) {
    chunks.push(recipeBlocks.slice(i, i + RECIPES_PER_CHUNK).join("\n\n--- NEXT RECIPE ---\n\n"));
  }
  return chunks;
}

async function parseChunk(chunkText: string): Promise<Recipe[]> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8000,
    system: RECIPE_PARSE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Parse every recipe from this text chunk. Return a JSON array of recipe objects.\n\n${chunkText}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`Chunk returned no JSON. Raw: ${text.slice(0, 200)}`);
  }
  return JSON.parse(jsonMatch[0]) as Recipe[];
}

export async function suggestRecipeMatches(
  inputs: string[],
  knownRecipeNames: string[]
): Promise<Record<string, string[]>> {
  if (inputs.length === 0) return {};

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system: `You match user-typed ice cream flavor names to a fixed list of valid recipe names.

For each user input, return up to 5 most likely matches from the valid list, ordered by likelihood (best first). Consider:
- Spelling typos and abbreviations (e.g. "MCC" → "Mint Chocolate Chip")
- Word order ("Choc Chip Mint" → "Mint Chocolate Chip")
- Partial names ("Jack Daniels" → "Jack Daniels Chocolate Chip" if it exists, NOT just "Chocolate")
- Plural/singular variations
- Common shorthand ("Bday Cake" → "Birthday Cake")

CRITICAL: Only return names from the valid list. Do NOT pick a generic match (e.g. "Chocolate") if a more specific match exists ("Jack Daniels Chocolate Chip"). If nothing reasonably matches, return [].

Return a JSON object mapping each user input verbatim to an array of valid names.
Example: { "MCC": ["Mint Chocolate Chip"], "Vanilla": ["Vanilla", "Vanilla Bean"] }
Output ONLY the JSON object, no markdown or commentary.`,
    messages: [
      {
        role: "user",
        content: `Valid recipes (${knownRecipeNames.length}):
${knownRecipeNames.map((n) => `- ${n}`).join("\n")}

User inputs to match:
${inputs.map((i) => `- ${i}`).join("\n")}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, string[]>;
  } catch {
    return {};
  }
}

export async function parseRecipesWithClaude(pdfText: string): Promise<Recipe[]> {
  const chunks = chunkPdfByRecipes(pdfText);
  if (chunks.length === 0) {
    throw new Error("No recipe boundaries found in PDF text");
  }
  const results = await Promise.all(chunks.map((c) => parseChunk(c)));
  return results.flat();
}

interface RecipeRequest {
  name: string;
  tubs: number;
  recipe: Recipe;
}

export interface RunListOutput {
  machines: {
    name: string;
    capacity_gallons: number;
    tubs_per_run: number;
    runs: {
      order: number;
      flavor: string;
      tubs: number;
      clean_after: "NO_CLEAN" | "WATER_RINSE" | "RINSE" | "TAKE_APART";
      reason: string;
      chain_badge: boolean;
      chain_label?: string;
      flags: string[];
      mix_ins?: string;
      section_label?: string;
    }[];
    summary: {
      total_runs: number;
      total_tubs: number;
      take_aparts: number;
      rinses: number;
      water_rinses: number;
      no_cleans: number;
    };
    footer_note: string;
  }[];
  totals: {
    runs: number;
    tubs: number;
    gallons: number;
    take_aparts: number;
    rinses: number;
    water_rinses: number;
    no_cleans: number;
  };
  _tubWarnings?: string[];
  _tubAccounting?: { name: string; requested: number; scheduled: number; matchedAs: string | null; ok: boolean }[];
  _totalsCheck?: { requested: number; scheduled: number; claudeReported: number; allFlavorsSeen: string[]; retried?: boolean };
  _retried?: boolean;
}

function buildSystemPrompt(rules: ProductionRules): string {
  return `You are an expert ice cream production scheduler for Liks Ice Cream. Your job is to take a list of recipes with tub counts and produce an optimized production run list across the available machines.

## MACHINES
${JSON.stringify(rules.machines, null, 2)}

## CLEANING TIERS
${JSON.stringify(rules.cleaning_tiers, null, 2)}

## TAKE-APART TRIGGERS
${JSON.stringify(rules.ta_triggers, null, 2)}

## ALLERGEN SEQUENCING RULES
${JSON.stringify(rules.allergen_rules, null, 2)}

## FLAVOR & BASE SEQUENCING
${JSON.stringify(rules.sequencing_rules, null, 2)}

## OPTIMIZATION RULES
${JSON.stringify(rules.optimization_rules, null, 2)}

## 44 QT MACHINE RULES
${rules.forty_four_qt_rule}
${(rules.forty_four_qt_callouts || []).map((c) => `- (${c.type.toUpperCase()}) ${c.text}`).join("\n")}

## RECIPE-SPECIFIC NOTES
${JSON.stringify(rules.recipe_notes, null, 2)}

## DAY STRUCTURE
${JSON.stringify(rules.day_structure, null, 2)}

## OUTPUT FORMAT
You MUST respond with ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "machines": [
    {
      "name": "Batch A" | "Batch B" | "44 QT",
      "capacity_gallons": number,
      "tubs_per_run": number,
      "runs": [
        {
          "order": number,
          "flavor": string,
          "tubs": number,
          "clean_after": "NO_CLEAN" | "WATER_RINSE" | "RINSE" | "TAKE_APART",
          "reason": string (BRIEF — under 60 chars when possible — e.g. "Cookie pieces — nothing similar follows.", "Identical — skip.", "Mint→coffee = major change."),
          "chain_badge": boolean,
          "chain_label": string (optional: "chain", "×2", "×3"),
          "flags": string[] (e.g. ["nut", "peanut", "moved", "fix"]),
          "mix_ins": string (optional: short ingredient detail — e.g. "Add-in: choco flakes.", "No add-ins. Fold-in: caramel + cookie var.", "Base: banana puree."),
          "section_label": string (optional: ONLY on the FIRST run of a new logical section, e.g. "Conditional TA", "Identical-pair chains", "Coffee family chain", "Nuts — end of day", "Fold-in block (0 TAs)", "Plain base — mild sweet block")
        }
      ],
      "summary": {
        "total_runs": number,
        "total_tubs": number,
        "take_aparts": number,
        "rinses": number,
        "water_rinses": number,
        "no_cleans": number
      },
      "footer_note": string
    }
  ],
  "totals": {
    "runs": number,
    "tubs": number,
    "gallons": number,
    "take_aparts": number,
    "rinses": number,
    "water_rinses": number,
    "no_cleans": number
  }
}

## CRITICAL RULES:
1. Minimize take-aparts by chaining same-ingredient flavors consecutively
2. Nuts and peanuts MUST go at end of day (last runs)
3. Cotton candy ALWAYS requires take-apart before AND after
4. 44 QT machine CANNOT do fold-ins (only add-ins)
5. Sorbet/sherbet NOT eligible for 44 QT
6. Sequence light → dark within base types
7. Vegan/dairy-free should run before dairy when possible
8. Balance workload across machines
9. Group runs into logical sections and emit a "section_label" on the FIRST run of each section. Sections might be: "Conditional TA", "Identical-pair chains", "Coffee family chain", "Lemon choco chain", "Peanut handling → nuts", "Nuts — end of day", "Fold-in block (0 TAs)", "Plain base — mild sweet block", "Plain base — bold flavors", "Chocolate base chain". Use the most descriptive label for the actual contents.

Optimize for fewest total take-aparts while respecting all safety and allergen rules.`;
}

function parseRunListJson(text: string): RunListOutput {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON found. Raw: ${text.slice(0, 300)}`);
  return JSON.parse(jsonMatch[0]) as RunListOutput;
}

// After Claude returns, inject correct tub values from machine config.
// Claude decides sequencing and machine assignment — we own the tub counts.
function injectTubCounts(result: RunListOutput, rules: ProductionRules): RunListOutput {
  const tubsPerRun = new Map(rules.machines.map((m) => [m.name, m.tubs_per_run]));
  for (const machine of result.machines) {
    const perRun = tubsPerRun.get(machine.name) ?? machine.tubs_per_run;
    machine.tubs_per_run = perRun;
    for (const run of machine.runs) {
      run.tubs = perRun;
    }
    machine.summary.total_tubs = machine.runs.length * perRun;
    machine.summary.total_runs = machine.runs.length;
  }
  result.totals.tubs = result.machines.reduce((s, m) => s + m.summary.total_tubs, 0);
  result.totals.runs = result.machines.reduce((s, m) => s + m.summary.total_runs, 0);
  return result;
}

// Check whether Claude scheduled the right number of RUNS per flavor.
// (Tub values are now deterministic, but run counts still come from Claude.)
function checkRunCounts(
  result: RunListOutput,
  recipes: RecipeRequest[],
  rules: ProductionRules
): { errors: string[]; runsByFlavor: Record<string, { machine: string; runs: number }[]> } {
  const tubsPerRun = new Map(rules.machines.map((m) => [m.name, m.tubs_per_run]));

  // Build: flavorKey -> list of { machine, runs }
  const runsByFlavor: Record<string, { machine: string; runs: number }[]> = {};
  for (const machine of result.machines) {
    const flavorCounts: Record<string, number> = {};
    for (const run of machine.runs) {
      const key = run.flavor.toLowerCase().trim();
      flavorCounts[key] = (flavorCounts[key] || 0) + 1;
    }
    for (const [key, count] of Object.entries(flavorCounts)) {
      runsByFlavor[key] = runsByFlavor[key] || [];
      runsByFlavor[key].push({ machine: machine.name, runs: count });
    }
  }

  const errors: string[] = [];
  for (const r of recipes) {
    const key = r.name.toLowerCase().trim();
    const entries = runsByFlavor[key] || [];
    const scheduledTubs = entries.reduce((s, e) => {
      return s + e.runs * (tubsPerRun.get(e.machine) ?? 0);
    }, 0);
    if (scheduledTubs !== r.tubs) {
      const detail = entries.length
        ? entries.map((e) => `${e.runs} run(s) on ${e.machine}`).join(", ")
        : "not scheduled";
      errors.push(`"${r.name}": need ${r.tubs} tubs but got ${scheduledTubs} (${detail})`);
    }
  }
  return { errors, runsByFlavor };
}

export async function generateRunList(
  recipes: RecipeRequest[],
  rules: ProductionRules
): Promise<RunListOutput & { _retried?: boolean }> {
  const systemPrompt = buildSystemPrompt(rules);

  // Tell Claude exactly how many runs each flavor needs per machine.
  // Claude decides WHICH machine and the ORDER — we own the tub values.
  const runSummary = recipes
    .map((r) => {
      const options = rules.machines.map((m) => {
        const runs = Math.ceil(r.tubs / m.tubs_per_run);
        return `${runs} run${runs === 1 ? "" : "s"} on ${m.name}`;
      });
      return `  ${r.name}: ${r.tubs} tubs → ${options.join(" OR ")}`;
    })
    .join("\n");

  const machineCapacityLines = rules.machines
    .map((m) => `  - ${m.name}: ${m.tubs_per_run} tub${m.tubs_per_run === 1 ? "" : "s"} per run (fixed)`)
    .join("\n");

  const userMessage = `Generate an optimized production run list for the following recipes.

Machine capacities (fixed — do not change tub values in output):
${machineCapacityLines}

Your job: decide (1) which machine each flavor runs on and (2) the sequence.
The tub count per run is fixed by machine config — you do not set it.
Schedule exactly the required number of runs per flavor:

${runSummary}

Grand total: ${recipes.reduce((sum, r) => sum + r.tubs, 0)} tubs

RECIPES (for sequencing/allergen/cleaning decisions):
${recipes.map((r) => `- ${r.name}: ${r.tubs} tubs
  Base: ${r.recipe.base.type} (${r.recipe.base.ingredients.join(", ")})
  Add-ins: ${r.recipe.addIns.map((a) => `${a.name} [${a.taTrigger} TA]`).join(", ") || "none"}
  Fold-ins: ${r.recipe.foldIns.map((f) => f.name).join(", ") || "none"}
  Allergens: ${r.recipe.allergens.join(", ") || "none"}
  44QT eligible: ${r.recipe.eligible44qt}`).join("\n\n")}

Assign to machines and sequence optimally. Return JSON only.`;

  const firstResponse = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const firstText = firstResponse.content[0].type === "text" ? firstResponse.content[0].text : "";
  let result: RunListOutput;
  try {
    result = parseRunListJson(firstText);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Inject correct tub counts — Claude's tub values are discarded.
  injectTubCounts(result, rules);

  // Verify run counts produce correct totals. Retry once if wrong.
  const { errors } = checkRunCounts(result, recipes, rules);
  if (errors.length === 0) return result;

  const correctionMessage = `The run COUNTS are wrong for some flavors. Fix only these and return the corrected JSON:

${errors.map((e) => `- ${e}`).join("\n")}

The required run counts per flavor are:
${runSummary}

Rules:
- Keep all other flavors exactly as scheduled.
- Keep flavor names exactly as in the recipe list (no abbreviations).
- Return ONLY the corrected JSON.`;

  const retryResponse = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: firstText },
      { role: "user", content: correctionMessage },
    ],
  });

  const retryText = retryResponse.content[0].type === "text" ? retryResponse.content[0].text : "";
  try {
    const retried = parseRunListJson(retryText);
    injectTubCounts(retried, rules);
    return { ...retried, _retried: true };
  } catch {
    return result;
  }
}
