import { NextResponse } from "next/server";
import { getRules } from "@/lib/blob";
import {
  DEFAULT_ALLERGEN_ORDER,
  DEFAULT_BASE_BOLDNESS_ORDER,
  DEFAULT_FORTY_FOUR_QT_ELIGIBILITY,
  OPTIMIZATION_FLAG_KEYS,
  type ProductionRules,
  type AllergenTransition,
  type FamilyTransitionDefault,
  type CleanDecisionRow,
  type FortyFourQtRules,
} from "@/lib/rules-schema";

// Seed structured fields the deterministic engine will eventually read.
//
// Returns the partial fields only — the client merges them into its current
// rules state and the existing autosave persists.
//
// This endpoint uses STATIC defaults derived from the prose seen in the existing
// rules document. A future enhancement can opt into a Claude-based derivation
// via ?ai=true; for Stage 1 the static path is the safe choice — deterministic,
// fast, no extra API call.

interface SeedStructuredResponse {
  allergen_order: string[];
  allergen_transitions: AllergenTransition[];
  base_boldness_order: string[];
  family_transition_defaults: FamilyTransitionDefault[];
  cleaning_decision_table: CleanDecisionRow[];
  optimization_flags: Record<string, boolean>;
  forty_four_qt_eligibility: FortyFourQtRules;
}

function buildStaticDefaults(): SeedStructuredResponse {
  const allergen_transitions: AllergenTransition[] = [
    {
      from: "peanut",
      to: "tree_nut",
      required_clean: "TAKE_APART",
      reason: "Peanut allergen must be fully cleared before any tree nut recipe.",
    },
    {
      from: "tree_nut",
      to: "peanut",
      required_clean: "TAKE_APART",
      reason: "Tree nut allergen must be cleared before peanut (rare ordering).",
    },
    {
      from: "vegan",
      to: "plain",
      required_clean: "TAKE_APART",
      reason: "Vegan base + coconut (tree nut) must clear before dairy.",
    },
  ];

  const family_transition_defaults: FamilyTransitionDefault[] = [
    { scenario: "same_family", min_clean: "NO_CLEAN" },
    { scenario: "adjacent_family", min_clean: "WATER_RINSE" },
    { scenario: "major_family_change", min_clean: "RINSE" },
    { scenario: "boldness_reversed", min_clean: "RINSE" },
  ];

  const cleaning_decision_table: CleanDecisionRow[] = [
    {
      id: "cd-1-same-recipe",
      priority: 1,
      condition_kind: "same_recipe_back_to_back",
      clean_after: "NO_CLEAN",
      reason: "Identical recipes — no transfer concern.",
    },
    {
      id: "cd-2-always-ta",
      priority: 2,
      condition_kind: "has_always_ta_addin",
      clean_after: "TAKE_APART",
      reason: "Recipe contains an always-TA add-in (sticky pieces in blades).",
    },
    {
      id: "cd-3-same-conditional",
      priority: 3,
      condition_kind: "same_conditional_ta_addin",
      clean_after: "NO_CLEAN",
      reason: "Same conditional-TA add-in carries over cleanly.",
    },
    {
      id: "cd-4-same-base-foldin",
      priority: 4,
      condition_kind: "same_base_fold_in_only",
      clean_after: "NO_CLEAN",
      reason: "Same base, differences are fold-ins (outside machine).",
    },
    {
      id: "cd-5-last-conditional",
      priority: 5,
      condition_kind: "last_run_conditional_ta_chain",
      clean_after: "TAKE_APART",
      reason: "End of conditional-TA chain — clear residue.",
    },
    {
      id: "cd-6-allergen-escalation",
      priority: 6,
      condition_kind: "allergen_escalation",
      clean_after: "from_allergen_table",
      reason: "See allergen transitions table.",
    },
    {
      id: "cd-7-major-family",
      priority: 7,
      condition_kind: "major_family_change",
      clean_after: "RINSE",
      reason: "Major flavor family change.",
    },
    {
      id: "cd-8-same-family-different-addin",
      priority: 8,
      condition_kind: "same_family_different_addin",
      clean_after: "WATER_RINSE",
      reason: "Same family, different add-in — minor transition.",
    },
    {
      id: "cd-9-default",
      priority: 9,
      condition_kind: "default",
      clean_after: "NO_CLEAN",
      reason: "Default fallback: nothing requires a clean.",
    },
  ];

  const optimization_flags: Record<string, boolean> = {};
  for (const key of OPTIMIZATION_FLAG_KEYS) {
    optimization_flags[key] = true;
  }
  // The one we ship off by default — group_identical_addins is a future strategy.
  optimization_flags["group_identical_addins"] = false;

  return {
    allergen_order: [...DEFAULT_ALLERGEN_ORDER],
    allergen_transitions,
    base_boldness_order: [...DEFAULT_BASE_BOLDNESS_ORDER],
    family_transition_defaults,
    cleaning_decision_table,
    optimization_flags,
    forty_four_qt_eligibility: { ...DEFAULT_FORTY_FOUR_QT_ELIGIBILITY },
  };
}

export async function POST() {
  try {
    const rules = (await getRules()) as ProductionRules | null;
    if (!rules) {
      return NextResponse.json(
        { error: "No rules document exists yet — seed initial rules first." },
        { status: 404 }
      );
    }
    const defaults = buildStaticDefaults();
    return NextResponse.json(defaults);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to derive structured defaults", details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
