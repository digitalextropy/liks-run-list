import Anthropic from "@anthropic-ai/sdk";
import type { ProductionRules } from "./rules-schema";
import type { Recipe } from "./recipe-schema";
import { assignMachines } from "./machine-assigner";
import type { RecipeRequest, AssignedRecipe } from "./machine-assigner";
export type { RecipeRequest } from "./machine-assigner";

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

function callouts(list: { type: string; text: string }[]): string {
  return list.map((c) => `[${c.type.toUpperCase()}] ${c.text}`).join("\n");
}

function buildSystemPrompt(rules: ProductionRules): string {
  return `You are an expert ice cream production scheduler for Liks Ice Cream.

## YOUR JOB
Machines are pre-assigned by the system. Do NOT change machine assignments.
Your job for each machine: sequence the pre-assigned recipes optimally (minimize take-aparts, respect allergen order, ascending boldness) and determine the correct cleaning step between each consecutive run.

## MACHINES
${JSON.stringify(rules.machines, null, 2)}
${rules.machines_callouts?.length ? callouts(rules.machines_callouts) : ""}

## CLEANING TIERS
${JSON.stringify(rules.cleaning_tiers, null, 2)}
${rules.cleaning_tiers_callouts?.length ? callouts(rules.cleaning_tiers_callouts) : ""}

## TAKE-APART TRIGGERS
${rules.ta_triggers_callouts_top?.length ? callouts(rules.ta_triggers_callouts_top) + "\n" : ""}${JSON.stringify(rules.ta_triggers, null, 2)}
${rules.ta_triggers_dissolving_intro ? rules.ta_triggers_dissolving_intro + "\n" : ""}${rules.ta_triggers_callouts_bottom?.length ? callouts(rules.ta_triggers_callouts_bottom) : ""}

## ALLERGEN SEQUENCING RULES
${rules.allergen_rules.map((r) => `- ${r}`).join("\n")}
${rules.allergen_rules_callouts?.length ? callouts(rules.allergen_rules_callouts) : ""}

## FLAVOR & BASE SEQUENCING
${rules.sequencing_rules.map((r) => `- ${r}`).join("\n")}

## OPTIMIZATION RULES
${rules.optimization_rules.map((r) => `- ${r}`).join("\n")}

## 44 QT MACHINE RULES
${rules.forty_four_qt_rule}
${rules.forty_four_qt_callouts?.length ? callouts(rules.forty_four_qt_callouts) : ""}

## RECIPE-SPECIFIC NOTES
${JSON.stringify(rules.recipe_notes, null, 2)}

## DAY STRUCTURE
${JSON.stringify(rules.day_structure, null, 2)}

## CRITICAL RULES
${(rules.critical_rules || []).map((r, i) => `${i + 1}. ${r}`).join("\n")}

## OUTPUT FORMAT
You MUST respond with ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "machines": [
    {
      "name": string,
      "capacity_gallons": number,
      "tubs_per_run": number,
      "runs": [
        {
          "order": number,
          "flavor": string,
          "tubs": number,
          "clean_after": "NO_CLEAN" | "WATER_RINSE" | "RINSE" | "TAKE_APART",
          "reason": string,
          "chain_badge": boolean,
          "chain_label": string (optional),
          "flags": string[],
          "mix_ins": string (optional),
          "section_label": string (optional — ONLY on the first run of a new logical section)
        }
      ],
      "summary": { "total_runs": number, "total_tubs": number, "take_aparts": number, "rinses": number, "water_rinses": number, "no_cleans": number },
      "footer_note": string
    }
  ],
  "totals": { "runs": number, "tubs": number, "gallons": number, "take_aparts": number, "rinses": number, "water_rinses": number, "no_cleans": number }
}

Optimize for fewest total take-aparts while respecting all safety and allergen rules.`;
}

function parseRunListJson(text: string): RunListOutput {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON found. Raw: ${text.slice(0, 300)}`);
  return JSON.parse(jsonMatch[0]) as RunListOutput;
}

// Deterministically enforce correct run counts and tub values.
// Claude only provides sequencing and cleaning — we own quantities.
function enforceRunCounts(
  result: RunListOutput,
  assigned: AssignedRecipe[],
  rules: ProductionRules
): RunListOutput {
  const tubsPerRun = new Map(rules.machines.map((m) => [m.name, m.tubs_per_run]));

  // Build requirement: per machine, per flavor → exact run count
  const required = new Map<string, Map<string, { runs: number; recipe: AssignedRecipe }>>();
  for (const r of assigned) {
    if (!required.has(r.assignedMachine)) required.set(r.assignedMachine, new Map());
    const machineReqs = required.get(r.assignedMachine)!;
    const key = r.name.toLowerCase().trim();
    const existing = machineReqs.get(key);
    if (existing) {
      existing.runs += r.runsNeeded;
    } else {
      machineReqs.set(key, { runs: r.runsNeeded, recipe: r });
    }
  }

  // Ensure all machines from rules exist in the result
  for (const m of rules.machines) {
    if (!result.machines.find((rm) => rm.name === m.name)) {
      result.machines.push({
        name: m.name,
        capacity_gallons: m.capacity_gallons,
        tubs_per_run: m.tubs_per_run,
        runs: [],
        summary: { total_runs: 0, total_tubs: 0, take_aparts: 0, rinses: 0, water_rinses: 0, no_cleans: 0 },
        footer_note: "",
      });
    }
  }

  for (const machine of result.machines) {
    const perRun = tubsPerRun.get(machine.name) ?? machine.tubs_per_run;
    machine.tubs_per_run = perRun;
    const machineReqs = required.get(machine.name) ?? new Map();

    // Build fuzzy matcher: Claude's output name → our canonical requirement key
    const reqKeys = Array.from(machineReqs.keys());
    function matchToReqKey(flavorName: string): string | null {
      const key = flavorName.toLowerCase().trim();
      // Exact match
      if (machineReqs.has(key)) return key;
      // Normalized (strip spaces, punctuation)
      const norm = key.replace(/[\s\-'']/g, "");
      for (const rk of reqKeys) {
        if (rk.replace(/[\s\-'']/g, "") === norm) return rk;
      }
      // Substring: Claude's name contains our key or vice versa
      for (const rk of reqKeys) {
        const rkNorm = rk.replace(/[\s\-'']/g, "");
        if (rkNorm.includes(norm) || norm.includes(rkNorm)) return rk;
      }
      return null;
    }

    // Fix: remove excess runs or add missing runs
    const fixedRuns: typeof machine.runs = [];
    const seen = new Map<string, number>(); // reqKey → runs added so far

    // First pass: keep Claude's runs in order, but cap at required count
    for (const run of machine.runs) {
      const reqKey = matchToReqKey(run.flavor);
      if (!reqKey) continue; // flavor shouldn't be on this machine — drop it
      const req = machineReqs.get(reqKey)!;
      const soFar = seen.get(reqKey) || 0;
      if (soFar < req.runs) {
        run.tubs = perRun;
        run.flavor = req.recipe.name; // normalize to canonical name
        fixedRuns.push(run);
        seen.set(reqKey, soFar + 1);
      }
      // else: excess run — dropped
    }

    // Second pass: add any missing flavors that Claude forgot
    for (const [key, req] of machineReqs.entries()) {
      const soFar = seen.get(key) || 0;
      for (let i = soFar; i < req.runs; i++) {
        fixedRuns.push({
          order: 0,
          flavor: req.recipe.name,
          tubs: perRun,
          clean_after: "RINSE",
          reason: "Sequenced by system — verify cleaning step",
          chain_badge: false,
          flags: ["auto-placed"],
        });
        seen.set(key, (seen.get(key) || 0) + 1);
      }
    }

    // Re-number orders
    fixedRuns.forEach((run, idx) => { run.order = idx + 1; });

    machine.runs = fixedRuns;
    machine.summary = {
      total_runs: fixedRuns.length,
      total_tubs: fixedRuns.length * perRun,
      take_aparts: fixedRuns.filter((r) => r.clean_after === "TAKE_APART").length,
      rinses: fixedRuns.filter((r) => r.clean_after === "RINSE").length,
      water_rinses: fixedRuns.filter((r) => r.clean_after === "WATER_RINSE").length,
      no_cleans: fixedRuns.filter((r) => r.clean_after === "NO_CLEAN").length,
    };
  }

  result.totals = {
    runs: result.machines.reduce((s, m) => s + m.summary.total_runs, 0),
    tubs: result.machines.reduce((s, m) => s + m.summary.total_tubs, 0),
    gallons: result.machines.reduce((s, m) => s + m.summary.total_tubs * (m.capacity_gallons / m.tubs_per_run), 0),
    take_aparts: result.machines.reduce((s, m) => s + m.summary.take_aparts, 0),
    rinses: result.machines.reduce((s, m) => s + m.summary.rinses, 0),
    water_rinses: result.machines.reduce((s, m) => s + m.summary.water_rinses, 0),
    no_cleans: result.machines.reduce((s, m) => s + m.summary.no_cleans, 0),
  };

  return result;
}

export async function generateRunList(
  recipes: RecipeRequest[],
  rules: ProductionRules
): Promise<RunListOutput> {
  const systemPrompt = buildSystemPrompt(rules);

  // Phase 1: deterministic machine assignment — keeps each flavor family on one machine.
  const assigned = assignMachines(recipes, rules);

  // Group pre-assigned recipes by machine for the prompt.
  const byMachine = new Map<string, typeof assigned>();
  for (const r of assigned) {
    if (!byMachine.has(r.assignedMachine)) byMachine.set(r.assignedMachine, []);
    byMachine.get(r.assignedMachine)!.push(r);
  }

  // Build the per-machine run requirement block for Claude.
  const machineCapacityLines = rules.machines
    .map((m) => `  - ${m.name}: ${m.tubs_per_run} tub${m.tubs_per_run === 1 ? "" : "s"} per run (fixed)`)
    .join("\n");

  const machineAssignmentBlock = Array.from(byMachine.entries())
    .map(([machineName, recs]) => {
      const machine = rules.machines.find((m) => m.name === machineName);
      const tubsPerRun = machine?.tubs_per_run ?? 2;
      const lines = recs.map((r) => {
        const runsNeeded = Math.ceil(r.tubs / tubsPerRun);
        return `    ${r.name}: ${r.tubs} tubs → ${runsNeeded} run${runsNeeded === 1 ? "" : "s"} [family: ${r.family}]`;
      });
      return `  ${machineName}:\n${lines.join("\n")}`;
    })
    .join("\n\n");

  const userMessage = `Generate an optimized production run list. Machine assignments are FIXED — do not move any recipe to a different machine.

Machine capacities (fixed — do not change tub values in output):
${machineCapacityLines}

PRE-ASSIGNED RECIPES PER MACHINE (sequence and clean between runs optimally):
${machineAssignmentBlock}

Grand total: ${recipes.reduce((sum, r) => sum + r.tubs, 0)} tubs

RECIPE DETAILS (for sequencing/allergen/cleaning decisions):
${assigned.map((r) => `- ${r.name} [→ ${r.assignedMachine}]: ${r.tubs} tubs
  Base: ${r.recipe.base.type} (${r.recipe.base.ingredients.join(", ")})
  Add-ins: ${r.recipe.addIns.map((a) => `${a.name} [${a.taTrigger} TA]`).join(", ") || "none"}
  Fold-ins: ${r.recipe.foldIns.map((f) => f.name).join(", ") || "none"}
  Allergens: ${r.recipe.allergens.join(", ") || "none"}
  44QT eligible: ${r.recipe.eligible44qt}`).join("\n\n")}

Sequence each machine's runs optimally. Return JSON only.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  let result: RunListOutput;
  try {
    result = parseRunListJson(text);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Deterministically enforce correct run counts and tub values.
  // Claude's sequencing and cleaning decisions are preserved, but quantities are ours.
  enforceRunCounts(result, assigned, rules);

  return result;
}
