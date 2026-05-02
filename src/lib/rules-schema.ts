export interface Machine {
  name: string;
  capacity_gallons: number;
  tubs_per_run: number;
  notes: string;
}

export interface CleaningTier {
  name: string;
  level: "NO_CLEAN" | "WATER_RINSE" | "RINSE" | "TAKE_APART";
  description: string;
  duration_minutes: number;
}

export interface TATrigger {
  ingredient: string;
  category: "always" | "conditional" | "never";
  condition?: string;
}

export interface AllergenRule {
  allergen: string;
  rule: string;
  sequencing: string;
}

export interface SequencingRule {
  category: string;
  rule: string;
  priority: number;
}

export interface OptimizationRule {
  name: string;
  description: string;
  example?: string;
}

export interface FortyFourQtRule {
  rule: string;
  exceptions: string[];
}

export interface RecipeNote {
  recipe: string;
  note: string;
  override?: string;
}

export interface DayStructure {
  phase: string;
  description: string;
  order: number;
}

export interface ProductionRules {
  machines: Machine[];
  cleaning_tiers: CleaningTier[];
  ta_triggers: TATrigger[];
  allergen_rules: AllergenRule[];
  sequencing_rules: SequencingRule[];
  optimization_rules: OptimizationRule[];
  forty_four_qt_rules: FortyFourQtRule;
  recipe_notes: RecipeNote[];
  day_structure: DayStructure[];
}
