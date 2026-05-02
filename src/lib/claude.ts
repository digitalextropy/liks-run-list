import Anthropic from "@anthropic-ai/sdk";
import type { ProductionRules } from "./rules-schema";
import type { Recipe } from "./recipe-schema";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
${JSON.stringify(rules.forty_four_qt_rules, null, 2)}

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
          "reason": string (brief explanation for the cleaning level),
          "chain_badge": boolean,
          "chain_label": string (optional: "chain", "×2", "×3"),
          "flags": string[] (e.g. ["nut", "peanut", "moved", "fix"]),
          "mix_ins": string (optional: display text for add-ins/fold-ins)
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

Optimize for fewest total take-aparts while respecting all safety and allergen rules.`;
}

export async function generateRunList(
  recipes: RecipeRequest[],
  rules: ProductionRules
): Promise<RunListOutput> {
  const systemPrompt = buildSystemPrompt(rules);

  const userMessage = `Generate an optimized production run list for the following recipes:

${recipes.map((r) => `- ${r.name}: ${r.tubs} tubs
  Base: ${r.recipe.base.type} (${r.recipe.base.ingredients.join(", ")})
  Add-ins: ${r.recipe.addIns.map((a) => `${a.name} [${a.taTrigger} TA]`).join(", ") || "none"}
  Fold-ins: ${r.recipe.foldIns.map((f) => f.name).join(", ") || "none"}
  Allergens: ${r.recipe.allergens.join(", ") || "none"}
  44QT eligible: ${r.recipe.eligible44qt}`).join("\n\n")}

Total recipes: ${recipes.length}
Total tubs: ${recipes.reduce((sum, r) => sum + r.tubs, 0)}

Assign to machines and sequence optimally. Return JSON only.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      `Claude returned no JSON. Raw response: ${text.slice(0, 300)}`
    );
  }

  try {
    return JSON.parse(jsonMatch[0]) as RunListOutput;
  } catch (e) {
    throw new Error(
      `Claude returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
