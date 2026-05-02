import { NextResponse } from "next/server";
import { saveRules } from "@/lib/blob";
import type { ProductionRules } from "@/lib/rules-schema";

const INITIAL_RULES: ProductionRules = {
  machines: [
    {
      name: "Batch A",
      capacity_gallons: 10,
      tubs_per_run: 8,
      notes: "Primary batch freezer. Handles all recipe types.",
    },
    {
      name: "Batch B",
      capacity_gallons: 10,
      tubs_per_run: 8,
      notes: "Secondary batch freezer. Handles all recipe types.",
    },
    {
      name: "44 QT",
      capacity_gallons: 11,
      tubs_per_run: 9,
      notes: "Large batch machine. NO fold-ins. Add-ins only. Not for sorbet/sherbet.",
    },
  ],
  cleaning_tiers: [
    {
      name: "No Clean",
      level: "NO_CLEAN",
      description: "Same base, no conflicting add-ins. Go directly to next batch.",
      duration_minutes: 0,
    },
    {
      name: "Water Rinse",
      level: "WATER_RINSE",
      description: "Light residue that rinses clean with water only. Minor flavor change within same base.",
      duration_minutes: 3,
    },
    {
      name: "Rinse",
      level: "RINSE",
      description: "Sanitizer rinse required. Moderate flavor/color change or minor allergen concern.",
      duration_minutes: 8,
    },
    {
      name: "Take-Apart",
      level: "TAKE_APART",
      description: "Full disassembly, wash, sanitize, reassemble. Required for sticky/chunky add-ins, major allergen transitions, or significant base changes.",
      duration_minutes: 25,
    },
  ],
  ta_triggers: [
    { ingredient: "Cotton Candy Base/Flavor", category: "always" },
    { ingredient: "Oreo/Cookie Crumbles", category: "always" },
    { ingredient: "Cookie Dough", category: "always" },
    { ingredient: "Brownie Pieces", category: "always" },
    { ingredient: "Graham Cracker", category: "always" },
    { ingredient: "Cheesecake Pieces", category: "always" },
    { ingredient: "Candy Bar Pieces (Snickers, Butterfinger, etc.)", category: "always" },
    { ingredient: "Peanut Butter Cups/Reese's", category: "always" },
    { ingredient: "M&Ms", category: "always" },
    { ingredient: "Heath/Toffee Pieces", category: "always" },
    { ingredient: "Marshmallow Pieces", category: "always" },
    { ingredient: "Choco Flakes", category: "conditional", condition: "TA required unless next flavor also uses choco flakes" },
    { ingredient: "Chocolate Chips", category: "conditional", condition: "TA required unless next flavor also uses chocolate chips" },
    { ingredient: "Fudge Swirl", category: "conditional", condition: "Rinse only if next batch is chocolate-based" },
    { ingredient: "Caramel Swirl", category: "conditional", condition: "Rinse only if staying in caramel family" },
    { ingredient: "Sprinkles", category: "never" },
    { ingredient: "Fruit Pieces (fresh)", category: "never" },
    { ingredient: "Vanilla Extract", category: "never" },
    { ingredient: "Food Coloring", category: "never" },
  ],
  allergen_rules: [
    {
      allergen: "Peanut",
      rule: "Must run at END of production day. Requires TA before if machine previously ran non-peanut.",
      sequencing: "last",
    },
    {
      allergen: "Tree Nuts",
      rule: "Must run at END of production day, before peanut if both present. Requires TA before.",
      sequencing: "last_before_peanut",
    },
    {
      allergen: "Wheat/Gluten",
      rule: "Group together. TA required when transitioning from non-wheat to wheat recipes.",
      sequencing: "group_together",
    },
  ],
  sequencing_rules: [
    { category: "Base Type", rule: "Light bases before dark. Plain → Vanilla → Chocolate → Dark Chocolate.", priority: 1 },
    { category: "Color", rule: "Light colors before dark colors within same base type.", priority: 2 },
    { category: "Vegan/DF", rule: "Run vegan/dairy-free BEFORE dairy when possible to avoid contamination.", priority: 3 },
    { category: "Sorbet", rule: "Sorbets can run together without cleaning. Different sorbets = water rinse only.", priority: 4 },
    { category: "Coffee", rule: "Group coffee flavors together. Coffee → Coffee + add-in chains save TAs.", priority: 5 },
    { category: "Mint", rule: "Mint is a strong flavor. Rinse required after mint unless going to chocolate-mint.", priority: 6 },
  ],
  optimization_rules: [
    {
      name: "Chain Same Add-ins",
      description: "If multiple recipes use the same add-in (e.g., choco flakes), run them consecutively to avoid TA between them.",
      example: "Moose Tracks → Chocolate Choco Flake → Vanilla Choco Flake = 0 TAs instead of 3",
    },
    {
      name: "Batch Doubles",
      description: "If a flavor needs 2+ runs (e.g., 16 tubs = 2 runs of 8), always run them back-to-back. Mark with ×2 badge.",
    },
    {
      name: "Cotton Candy Isolation",
      description: "Cotton candy ALWAYS needs TA before AND after. Place it strategically (e.g., at the start of a machine's day).",
    },
    {
      name: "Minimize Machine Switches",
      description: "Keep a flavor family on one machine rather than splitting across machines.",
    },
    {
      name: "Balance Load",
      description: "Distribute runs roughly evenly across active machines to minimize total production time.",
    },
  ],
  forty_four_qt_rules: {
    rule: "44 QT can only do ADD-INS (mixed into the batch during freezing). It CANNOT do FOLD-INS (swirled/layered in after freezing). Sorbet and sherbet are also NOT eligible.",
    exceptions: ["Any recipe with fold-ins", "Sorbet recipes", "Sherbet recipes"],
  },
  recipe_notes: [
    { recipe: "Cotton Candy", note: "ALWAYS requires TA before AND after. Extremely sticky base that contaminates everything.", override: "TAKE_APART both directions" },
    { recipe: "Superman", note: "Uses multiple food colorings. Water rinse after is sufficient unless going to white/vanilla base.", override: "WATER_RINSE after unless → vanilla" },
  ],
  day_structure: [
    { phase: "Startup Clean", description: "All machines get a rinse before first batch of the day.", order: 1 },
    { phase: "Light/Vegan First", description: "Start with lightest flavors, vegan/DF if any.", order: 2 },
    { phase: "Main Production", description: "Bulk of runs. Sequence by base type, light→dark.", order: 3 },
    { phase: "Strong Flavors", description: "Coffee, mint, heavily flavored batches.", order: 4 },
    { phase: "Nuts End of Day", description: "Tree nuts, then peanuts absolutely last.", order: 5 },
    { phase: "Final TA", description: "Full take-apart on all machines at end of day.", order: 6 },
  ],
};

export async function POST() {
  await saveRules(INITIAL_RULES);
  return NextResponse.json({ success: true, message: "Rules seeded successfully" });
}
