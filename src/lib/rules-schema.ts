export type CalloutType = "info" | "warning" | "critical" | "success";

export interface Callout {
  type: CalloutType;
  text: string;
}

export interface Machine {
  name: string;
  capacity_gallons: number;
  tubs_per_run: number;
  rules: string;
  warnings: string[];
  highlight?: boolean;
}

export interface CleaningTier {
  name: string;
  level: "NO_CLEAN" | "WATER_RINSE" | "RINSE" | "TAKE_APART";
  definition: string;
  description: string;
  duration_minutes: number;
}

export interface TATrigger {
  name: string;
  category: "always" | "conditional" | "never" | "dissolving";
  note?: string;
}

export interface RecipeNote {
  recipe: string;
  note: string;
  overrides?: RecipeOverrides;
}

export interface DayPhase {
  order: number;
  phase: string;
  description: string;
}

export interface ProductionRules {
  machines: Machine[];
  machines_callouts: Callout[];

  cleaning_tiers: CleaningTier[];
  cleaning_tiers_callouts: Callout[];

  ta_triggers: TATrigger[];
  ta_triggers_callouts_top: Callout[];
  ta_triggers_callouts_bottom: Callout[];
  ta_triggers_dissolving_intro: string;

  allergen_rules: string[];
  allergen_rules_callouts: Callout[];

  sequencing_rules: string[];
  optimization_rules: string[];

  forty_four_qt_rule: string;
  forty_four_qt_callouts: Callout[];

  recipe_notes: RecipeNote[];
  day_structure: DayPhase[];
  critical_rules: string[];

  // ─── Stage 1: structured fields the deterministic engine reads ───
  // All optional — engine falls back to defaults when undefined.
  allergen_order?: string[];
  allergen_transitions?: AllergenTransition[];
  base_boldness_order?: string[];
  family_transition_defaults?: FamilyTransitionDefault[];
  cleaning_decision_table?: CleanDecisionRow[];
  optimization_flags?: Record<string, boolean>;
  forty_four_qt_eligibility?: FortyFourQtRules;
}

export type CleanLevel = "NO_CLEAN" | "WATER_RINSE" | "RINSE" | "TAKE_APART";

export interface AllergenTransition {
  from: string;
  to: string;
  required_clean: CleanLevel;
  reason: string;
}

export type FamilyTransitionScenario =
  | "same_family"
  | "adjacent_family"
  | "major_family_change"
  | "boldness_reversed";

export interface FamilyTransitionDefault {
  scenario: FamilyTransitionScenario;
  min_clean: CleanLevel;
}

export type CleanDecisionConditionKind =
  | "has_always_ta_addin"
  | "same_recipe_back_to_back"
  | "same_conditional_ta_addin"
  | "same_base_fold_in_only"
  | "last_run_conditional_ta_chain"
  | "allergen_escalation"
  | "major_family_change"
  | "same_family_different_addin"
  | "default";

export interface CleanDecisionRow {
  id: string;
  priority: number;
  condition_kind: CleanDecisionConditionKind;
  clean_after: CleanLevel | "from_allergen_table";
  reason: string;
}

export interface FortyFourQtRules {
  allow_vegan: boolean;
  allow_sorbet: boolean;
  allow_fold_ins: boolean;
  target_pct: number;
  max_pct: number;
}

export const OPTIMIZATION_FLAG_KEYS = [
  "chain_identical_recipes",
  "defer_conditional_ta_to_last_run",
  "mildest_flavor_first",
  "minimize_ta_over_rinse",
  "group_identical_addins",
] as const;

export type OptimizationFlagKey = (typeof OPTIMIZATION_FLAG_KEYS)[number];

export const OPTIMIZATION_FLAG_LABELS: Record<OptimizationFlagKey, string> = {
  chain_identical_recipes: "Chain identical recipes back-to-back (skip clean between)",
  defer_conditional_ta_to_last_run: "Defer conditional TA to last run of chain",
  mildest_flavor_first: "Run mildest flavor first within each machine",
  minimize_ta_over_rinse: "Minimize TAs over minimizing rinses",
  group_identical_addins: "Group identical add-ins across different recipes",
};

export const DEFAULT_ALLERGEN_ORDER: string[] = [
  "vegan",
  "sorbet",
  "plain",
  "chocolate",
  "coffee",
  "fruit",
  "peanut",
  "tree_nut",
];

export const DEFAULT_BASE_BOLDNESS_ORDER: string[] = [
  "vegan",
  "plain",
  "chocolate",
  "cheesecake",
  "graham",
  "sherbet",
  "sorbet",
];

export const DEFAULT_FORTY_FOUR_QT_ELIGIBILITY: FortyFourQtRules = {
  allow_vegan: false,
  allow_sorbet: false,
  allow_fold_ins: false,
  target_pct: 33,
  max_pct: 50,
};

export interface RecipeOverrides {
  force_allergen_group?: string;
  force_clean_after?: CleanLevel;
  force_machine?: string;
}
