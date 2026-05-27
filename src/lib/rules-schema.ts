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

  // Optional structured fields read by the upcoming deterministic engine on the
  // deterministic-engine branch. Declared here so the rules API preserves them
  // across edits even though the production UI on master doesn't render them yet.
  // Removing or skipping these would cause data loss when prod autosaves.
  allergen_order?: string[];
  allergen_transitions?: unknown[];
  base_boldness_order?: string[];
  family_transition_defaults?: unknown[];
  cleaning_decision_table?: unknown[];
  optimization_flags?: Record<string, boolean>;
  forty_four_qt_eligibility?: Record<string, unknown>;
}
