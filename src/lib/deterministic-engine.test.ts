import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideCleanAfter } from "./deterministic-engine";
import type { AssignedRecipe } from "./machine-assigner";
import type { ProductionRules } from "./rules-schema";

// ─── Helpers ───

function makeRecipe(overrides: Partial<AssignedRecipe> & { name: string }): AssignedRecipe {
  return {
    tubs: 4,
    recipe: {
      name: overrides.name,
      base: { type: "plain", ingredients: [] },
      addIns: [],
      foldIns: [],
      allergens: [],
      eligible44qt: false,
      notes: null,
    },
    assignedMachine: "Batch A",
    runsNeeded: 1,
    family: "plain",
    ...overrides,
  };
}

function minimalRules(overrides?: Partial<ProductionRules>): ProductionRules {
  return {
    machines: [{ name: "Batch A", capacity_gallons: 6, tubs_per_run: 2, rules: "", warnings: [] }],
    machines_callouts: [],
    cleaning_tiers: [],
    cleaning_tiers_callouts: [],
    ta_triggers: [],
    ta_triggers_callouts_top: [],
    ta_triggers_callouts_bottom: [],
    ta_triggers_dissolving_intro: "",
    allergen_rules: [],
    allergen_rules_callouts: [],
    sequencing_rules: [],
    optimization_rules: [],
    forty_four_qt_rule: "",
    forty_four_qt_callouts: [],
    recipe_notes: [],
    day_structure: [],
    critical_rules: [],
    ...overrides,
  };
}

// ─── Tests ───

describe("decideCleanAfter", () => {
  it("always-TA add-in → TAKE_APART regardless of prev", () => {
    const curr = makeRecipe({
      name: "Cotton Candy",
      recipe: {
        name: "Cotton Candy",
        base: { type: "plain", ingredients: [] },
        addIns: [{ name: "Cotton Candy Bits", quantity: "1 cup", taTrigger: "always" }],
        foldIns: [],
        allergens: [],
        eligible44qt: false,
        notes: null,
      },
    });
    const prev = makeRecipe({ name: "Vanilla" });
    const rules = minimalRules();

    const result = decideCleanAfter(prev, curr, rules);
    assert.equal(result.clean_after, "TAKE_APART");
    assert.ok(result.reason.includes("always-TA"));
  });

  it("same recipe back-to-back → NO_CLEAN", () => {
    const prev = makeRecipe({ name: "Vanilla" });
    const curr = makeRecipe({ name: "Vanilla" });
    const rules = minimalRules();

    const result = decideCleanAfter(prev, curr, rules);
    assert.equal(result.clean_after, "NO_CLEAN");
  });

  it("peanut → tree_nut transition → TAKE_APART (allergen_transitions)", () => {
    const prev = makeRecipe({ name: "PB Cup", family: "peanut" });
    const curr = makeRecipe({ name: "Butter Pecan", family: "nut" });
    const rules = minimalRules();

    const result = decideCleanAfter(prev, curr, rules);
    assert.equal(result.clean_after, "TAKE_APART");
    assert.ok(result.reason.toLowerCase().includes("peanut"));
  });

  it("same family different add-in → WATER_RINSE", () => {
    const prev = makeRecipe({
      name: "Chocolate",
      family: "chocolate",
      recipe: {
        name: "Chocolate",
        base: { type: "chocolate", ingredients: [] },
        addIns: [{ name: "Choco Flakes", quantity: "1 cup", taTrigger: "conditional" }],
        foldIns: [],
        allergens: [],
        eligible44qt: false,
        notes: null,
      },
    });
    const curr = makeRecipe({
      name: "Chocolate Chip",
      family: "chocolate",
      recipe: {
        name: "Chocolate Chip",
        base: { type: "chocolate", ingredients: [] },
        addIns: [{ name: "Chocolate Chips", quantity: "1 cup", taTrigger: "conditional" }],
        foldIns: [],
        allergens: [],
        eligible44qt: false,
        notes: null,
      },
    });
    const rules = minimalRules();

    const result = decideCleanAfter(prev, curr, rules);
    assert.equal(result.clean_after, "WATER_RINSE");
  });

  it("recipe override force_clean_after → overrides table", () => {
    const prev = makeRecipe({ name: "Vanilla" });
    const curr = makeRecipe({ name: "Fluffernutter" });
    const rules = minimalRules({
      recipe_notes: [
        {
          recipe: "Fluffernutter",
          note: "PB fold-in",
          overrides: { force_clean_after: "RINSE" },
        },
      ],
    });

    const result = decideCleanAfter(prev, curr, rules);
    assert.equal(result.clean_after, "RINSE");
    assert.ok(result.reason.includes("override"));
  });

  it("empty cleaning_decision_table → falls back to static defaults", () => {
    const prev = makeRecipe({ name: "Vanilla" });
    const curr = makeRecipe({
      name: "Strawberry",
      recipe: {
        name: "Strawberry",
        base: { type: "plain", ingredients: [] },
        addIns: [{ name: "Strawberries", quantity: "2 cups", taTrigger: "always" }],
        foldIns: [],
        allergens: [],
        eligible44qt: false,
        notes: null,
      },
    });
    const rules = minimalRules({ cleaning_decision_table: [] });

    const result = decideCleanAfter(prev, curr, rules);
    assert.equal(result.clean_after, "TAKE_APART");
  });

  it("prev = null (first run on machine) → NO_CLEAN", () => {
    const curr = makeRecipe({ name: "Vanilla" });
    const rules = minimalRules();

    const result = decideCleanAfter(null, curr, rules);
    assert.equal(result.clean_after, "NO_CLEAN");
    assert.ok(result.reason.toLowerCase().includes("first"));
  });
});
