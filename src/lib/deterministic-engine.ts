import type { ProductionRules, CleanLevel, CleanDecisionRow, AllergenTransition } from "./rules-schema";
import type { RunListOutput } from "./claude";
import type { RecipeRequest, AssignedRecipe } from "./machine-assigner";
import { DEFAULT_ALLERGEN_ORDER } from "./rules-schema";

// ─── Static defaults (mirror of seed-structured/route.ts buildStaticDefaults) ───

function buildStaticCleaningDecisionTable(): CleanDecisionRow[] {
  return [
    { id: "cd-1-always-ta", priority: 1, condition_kind: "has_always_ta_addin", clean_after: "TAKE_APART", reason: "Recipe contains an always-TA add-in (sticky pieces in blades)." },
    { id: "cd-2-same-recipe", priority: 2, condition_kind: "same_recipe_back_to_back", clean_after: "NO_CLEAN", reason: "Identical recipes — no transfer concern." },
    { id: "cd-3-same-conditional", priority: 3, condition_kind: "same_conditional_ta_addin", clean_after: "NO_CLEAN", reason: "Same conditional-TA add-in carries over cleanly." },
    { id: "cd-4-same-base-foldin", priority: 4, condition_kind: "same_base_fold_in_only", clean_after: "NO_CLEAN", reason: "Same base, differences are fold-ins (outside machine)." },
    { id: "cd-5-last-conditional", priority: 5, condition_kind: "last_run_conditional_ta_chain", clean_after: "TAKE_APART", reason: "End of conditional-TA chain — clear residue." },
    { id: "cd-6-allergen-escalation", priority: 6, condition_kind: "allergen_escalation", clean_after: "from_allergen_table", reason: "See allergen transitions table." },
    { id: "cd-7-major-family", priority: 7, condition_kind: "major_family_change", clean_after: "RINSE", reason: "Major flavor family change." },
    { id: "cd-8-same-family-different-addin", priority: 8, condition_kind: "same_family_different_addin", clean_after: "WATER_RINSE", reason: "Same family, different add-in — minor transition." },
    { id: "cd-9-default", priority: 9, condition_kind: "default", clean_after: "NO_CLEAN", reason: "Default fallback: nothing requires a clean." },
  ];
}

function buildStaticAllergenTransitions(): AllergenTransition[] {
  return [
    { from: "peanut", to: "tree_nut", required_clean: "TAKE_APART", reason: "Peanut allergen must be fully cleared before any tree nut recipe." },
    { from: "tree_nut", to: "peanut", required_clean: "TAKE_APART", reason: "Tree nut allergen must be cleared before peanut (rare ordering)." },
    { from: "vegan", to: "plain", required_clean: "TAKE_APART", reason: "Vegan base + coconut (tree nut) must clear before dairy." },
  ];
}

// ─── Condition evaluators ───

function hasAlwaysTAAddIn(recipe: AssignedRecipe): boolean {
  return recipe.recipe.addIns.some(a => a.taTrigger === "always");
}

function sameRecipeBackToBack(prev: AssignedRecipe | null, curr: AssignedRecipe): boolean {
  if (!prev) return false;
  return prev.name.toLowerCase().trim() === curr.name.toLowerCase().trim();
}

function sameConditionalTAAddIn(prev: AssignedRecipe | null, curr: AssignedRecipe): boolean {
  if (!prev) return false;
  const prevConditional = prev.recipe.addIns
    .filter(a => a.taTrigger === "conditional")
    .map(a => a.name.toLowerCase().trim());
  const currConditional = curr.recipe.addIns
    .filter(a => a.taTrigger === "conditional")
    .map(a => a.name.toLowerCase().trim());
  return prevConditional.some(p => currConditional.includes(p));
}

function sameBaseFoldInOnly(prev: AssignedRecipe | null, curr: AssignedRecipe): boolean {
  if (!prev) return false;
  if (prev.family !== curr.family) return false;
  if (prev.recipe.base.type !== curr.recipe.base.type) return false;
  const prevHasAddIns = prev.recipe.addIns.some(a => a.taTrigger !== "none");
  const currHasAddIns = curr.recipe.addIns.some(a => a.taTrigger !== "none");
  return !prevHasAddIns && !currHasAddIns;
}

function areFamiliesAdjacent(prevFamily: string, currFamily: string, allergenOrder: string[]): boolean {
  const prevIdx = allergenOrder.indexOf(prevFamily);
  const currIdx = allergenOrder.indexOf(currFamily);
  if (prevIdx === -1 || currIdx === -1) return false;
  return Math.abs(prevIdx - currIdx) === 1;
}

function isMajorFamilyChange(prev: AssignedRecipe | null, curr: AssignedRecipe, allergenOrder: string[]): boolean {
  if (!prev) return false;
  if (prev.family === curr.family) return false;
  if (areFamiliesAdjacent(prev.family, curr.family, allergenOrder)) return false;
  return true;
}

function sameFamilyDifferentAddIn(prev: AssignedRecipe | null, curr: AssignedRecipe): boolean {
  if (!prev) return false;
  if (prev.family !== curr.family) return false;
  const prevAddIns = prev.recipe.addIns.map(a => a.name.toLowerCase().trim()).sort().join("|");
  const currAddIns = curr.recipe.addIns.map(a => a.name.toLowerCase().trim()).sort().join("|");
  return prevAddIns !== currAddIns;
}

function lookupAllergenTransition(
  prev: AssignedRecipe,
  curr: AssignedRecipe,
  transitions: AllergenTransition[]
): AllergenTransition | null {
  // Map family keys to allergen group names for lookup.
  // The "nut" family key maps to "tree_nut" in the allergen transitions table.
  const mapFamily = (f: string) => f === "nut" ? "tree_nut" : f;
  const prevGroup = mapFamily(prev.family);
  const currGroup = mapFamily(curr.family);
  return transitions.find(t => t.from === prevGroup && t.to === currGroup) ?? null;
}

function hasAllergenEscalation(prev: AssignedRecipe | null, curr: AssignedRecipe, transitions: AllergenTransition[]): boolean {
  if (!prev) return false;
  return lookupAllergenTransition(prev, curr, transitions) !== null;
}

// ─── Condition dispatcher ───

interface ConditionContext {
  prev: AssignedRecipe | null;
  curr: AssignedRecipe;
  rules: ProductionRules;
  allergenOrder: string[];
  allergenTransitions: AllergenTransition[];
}

function evaluateCondition(kind: CleanDecisionRow["condition_kind"], ctx: ConditionContext): boolean {
  switch (kind) {
    case "has_always_ta_addin":
      return hasAlwaysTAAddIn(ctx.curr);
    case "same_recipe_back_to_back":
      return sameRecipeBackToBack(ctx.prev, ctx.curr);
    case "same_conditional_ta_addin":
      return sameConditionalTAAddIn(ctx.prev, ctx.curr);
    case "same_base_fold_in_only":
      return sameBaseFoldInOnly(ctx.prev, ctx.curr);
    case "last_run_conditional_ta_chain":
      return !!(ctx.curr as AssignedRecipe & { isLastOfConditionalChain?: boolean }).isLastOfConditionalChain;
    case "allergen_escalation":
      return hasAllergenEscalation(ctx.prev, ctx.curr, ctx.allergenTransitions);
    case "major_family_change":
      return isMajorFamilyChange(ctx.prev, ctx.curr, ctx.allergenOrder);
    case "same_family_different_addin":
      return sameFamilyDifferentAddIn(ctx.prev, ctx.curr);
    case "default":
      return true;
    default:
      return false;
  }
}

// ─── Main function ───

export interface CleanDecision {
  clean_after: CleanLevel;
  reason: string;
}

export function decideCleanAfter(
  prev: AssignedRecipe | null,
  curr: AssignedRecipe,
  rules: ProductionRules
): CleanDecision {
  // First run on machine — no cleaning needed
  if (!prev) {
    return { clean_after: "NO_CLEAN", reason: "First run on machine — no previous residue." };
  }

  // Recipe override: short-circuit if force_clean_after is set
  const recipeNote = rules.recipe_notes?.find(
    n => n.recipe.toLowerCase().trim() === curr.name.toLowerCase().trim()
  );
  if (recipeNote?.overrides?.force_clean_after) {
    return {
      clean_after: recipeNote.overrides.force_clean_after,
      reason: `Force-set via recipe override for ${curr.name}.`,
    };
  }

  const table = rules.cleaning_decision_table?.length
    ? [...rules.cleaning_decision_table].sort((a, b) => a.priority - b.priority)
    : buildStaticCleaningDecisionTable();

  const allergenOrder = rules.allergen_order ?? [...DEFAULT_ALLERGEN_ORDER];
  const allergenTransitions = rules.allergen_transitions ?? buildStaticAllergenTransitions();

  const ctx: ConditionContext = { prev, curr, rules, allergenOrder, allergenTransitions };

  for (const row of table) {
    if (!evaluateCondition(row.condition_kind, ctx)) continue;

    // Resolve clean level
    let cleanAfter: CleanLevel;
    let reason: string;

    if (row.clean_after === "from_allergen_table") {
      const transition = lookupAllergenTransition(prev, curr, allergenTransitions);
      if (transition) {
        cleanAfter = transition.required_clean;
        reason = transition.reason;
      } else {
        // No specific transition found — fall through to next row
        continue;
      }
    } else {
      cleanAfter = row.clean_after;
      reason = row.reason;
    }

    return { clean_after: cleanAfter, reason };
  }

  // Should never reach here if table has a "default" row, but safety fallback
  return { clean_after: "NO_CLEAN", reason: "No matching rule — default." };
}

// ─── Existing exports ───

export async function generateRunListDeterministic(
  _recipes: RecipeRequest[],
  _rules: ProductionRules
): Promise<RunListOutput> {
  throw new Error(
    "Deterministic engine is not yet implemented. " +
      "Set USE_DETERMINISTIC_ENGINE=false (or unset) to use the Claude-based flow."
  );
}

export function isDeterministicEngineEnabled(): boolean {
  return process.env.USE_DETERMINISTIC_ENGINE === "true";
}
