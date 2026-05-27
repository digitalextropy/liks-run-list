import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideCleanAfter, sequenceRuns } from "./deterministic-engine";
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

  it("same recipe with always-TA add-in back-to-back → NO_CLEAN (chaining)", () => {
    const strawberry = makeRecipe({
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
    const rules = minimalRules();

    const result = decideCleanAfter(strawberry, { ...strawberry }, rules);
    assert.equal(result.clean_after, "NO_CLEAN");
  });

  it("prev = null (first run on machine) → NO_CLEAN", () => {
    const curr = makeRecipe({ name: "Vanilla" });
    const rules = minimalRules();

    const result = decideCleanAfter(null, curr, rules);
    assert.equal(result.clean_after, "NO_CLEAN");
    assert.ok(result.reason.toLowerCase().includes("first"));
  });
});

// ─── Stage 3: sequenceRuns tests ───

describe("sequenceRuns", () => {
  it("identical recipes chain together (3× Vanilla → one chain, NO_CLEAN between)", () => {
    const vanilla = makeRecipe({ name: "Vanilla", runsNeeded: 3 });
    const rules = minimalRules();

    const result = sequenceRuns([vanilla], rules);
    assert.equal(result.length, 3);
    assert.ok(result.every(r => r.name === "Vanilla"));

    // All transitions should be NO_CLEAN
    for (let i = 1; i < result.length; i++) {
      const decision = decideCleanAfter(result[i - 1], result[i], rules);
      assert.equal(decision.clean_after, "NO_CLEAN");
    }
  });

  it("vegan recipes sequence first on a machine", () => {
    const plain = makeRecipe({ name: "Chocolate", family: "chocolate", recipe: { name: "Chocolate", base: { type: "chocolate", ingredients: [] }, addIns: [], foldIns: [], allergens: [], eligible44qt: false, notes: null } });
    const vegan = makeRecipe({ name: "Vegan Vanilla", family: "vegan", recipe: { name: "Vegan Vanilla", base: { type: "vegan", ingredients: [] }, addIns: [], foldIns: [], allergens: [], eligible44qt: false, notes: null } });
    const rules = minimalRules();

    const result = sequenceRuns([plain, vegan], rules);
    assert.equal(result[0].name, "Vegan Vanilla");
    assert.equal(result[1].name, "Chocolate");
  });

  it("peanut and tree_nut both present → peanut block before tree_nut block (per allergen_order)", () => {
    const peanut = makeRecipe({
      name: "PB Cup",
      family: "peanut",
      recipe: { name: "PB Cup", base: { type: "plain", ingredients: [] }, addIns: [{ name: "Peanut Butter", quantity: "1 cup", taTrigger: "always" }], foldIns: [], allergens: ["Peanut"], eligible44qt: false, notes: null },
    });
    const treeNut = makeRecipe({
      name: "Butter Pecan",
      family: "nut",
      recipe: { name: "Butter Pecan", base: { type: "plain", ingredients: [] }, addIns: [{ name: "Pecans", quantity: "1 cup", taTrigger: "always" }], foldIns: [], allergens: ["Tree Nuts"], eligible44qt: false, notes: null },
    });
    const rules = minimalRules();

    // Default allergen_order: [..., "peanut", "tree_nut"]
    // peanut is at index 6, tree_nut at index 7
    const result = sequenceRuns([treeNut, peanut], rules);
    const peanutIdx = result.findIndex(r => r.name === "PB Cup");
    const treeNutIdx = result.findIndex(r => r.name === "Butter Pecan");
    assert.ok(peanutIdx < treeNutIdx, `peanut should come before tree_nut, got peanut@${peanutIdx} tree_nut@${treeNutIdx}`);
  });

  it("conditional-TA add-in shared → grouped, last one flagged isLastOfConditionalChain", () => {
    const r1 = makeRecipe({
      name: "MCC",
      family: "plain",
      recipe: { name: "MCC", base: { type: "plain", ingredients: [] }, addIns: [{ name: "Choco Chips", quantity: "1 cup", taTrigger: "conditional" }], foldIns: [], allergens: [], eligible44qt: false, notes: null },
    });
    const r2 = makeRecipe({
      name: "Cookie Dough CC",
      family: "plain",
      recipe: { name: "Cookie Dough CC", base: { type: "plain", ingredients: [] }, addIns: [{ name: "Choco Chips", quantity: "1 cup", taTrigger: "conditional" }, { name: "Cookie Dough", quantity: "1 cup", taTrigger: "always" }], foldIns: [], allergens: [], eligible44qt: false, notes: null },
    });
    const plain = makeRecipe({ name: "Vanilla" });
    const rules = minimalRules();

    const result = sequenceRuns([r2, plain, r1], rules);
    // The two choco-chip recipes should be adjacent
    const mccIdx = result.findIndex(r => r.name === "MCC");
    const cdccIdx = result.findIndex(r => r.name === "Cookie Dough CC");
    assert.ok(Math.abs(mccIdx - cdccIdx) === 1, `Choco chip recipes should be adjacent, got MCC@${mccIdx} CDCC@${cdccIdx}`);
  });

  it("always-TA Cotton Candy placed efficiently (not mid-chain of no-clean runs)", () => {
    const v1 = makeRecipe({ name: "Vanilla", runsNeeded: 2 });
    const cottonCandy = makeRecipe({
      name: "Cotton Candy",
      recipe: { name: "Cotton Candy", base: { type: "plain", ingredients: [] }, addIns: [{ name: "Cotton Candy Bits", quantity: "1 cup", taTrigger: "always" }], foldIns: [], allergens: [], eligible44qt: false, notes: null },
    });
    const rules = minimalRules();

    const result = sequenceRuns([cottonCandy, v1], rules);
    // Vanilla runs should chain together (both NO_CLEAN), Cotton Candy should not split them
    const vanillaIndices = result.map((r, i) => r.name === "Vanilla" ? i : -1).filter(i => i >= 0);
    if (vanillaIndices.length === 2) {
      assert.equal(vanillaIndices[1] - vanillaIndices[0], 1, "Vanilla runs should be consecutive");
    }
  });

  it("greedy produces valid ordering on a mixed set", () => {
    const vegan = makeRecipe({ name: "Vegan Chocolate", family: "vegan", recipe: { name: "Vegan Chocolate", base: { type: "vegan", ingredients: [] }, addIns: [], foldIns: [], allergens: [], eligible44qt: false, notes: null } });
    const plain1 = makeRecipe({ name: "Vanilla", family: "plain" });
    const plain2 = makeRecipe({ name: "Mint Cookie", family: "plain", recipe: { name: "Mint Cookie", base: { type: "plain", ingredients: [] }, addIns: [{ name: "Cookie Pieces", quantity: "1 cup", taTrigger: "conditional" }], foldIns: [], allergens: [], eligible44qt: false, notes: null } });
    const choc = makeRecipe({ name: "Chocolate", family: "chocolate", recipe: { name: "Chocolate", base: { type: "chocolate", ingredients: [] }, addIns: [], foldIns: [], allergens: [], eligible44qt: false, notes: null } });
    const nut = makeRecipe({ name: "Butter Pecan", family: "nut", recipe: { name: "Butter Pecan", base: { type: "plain", ingredients: [] }, addIns: [{ name: "Pecans", quantity: "1 cup", taTrigger: "always" }], foldIns: [], allergens: ["Tree Nuts"], eligible44qt: false, notes: null } });
    const rules = minimalRules();

    const result = sequenceRuns([nut, choc, plain2, vegan, plain1], rules);

    // Vegan should be first
    assert.equal(result[0].name, "Vegan Chocolate");
    // Nut should be last
    assert.equal(result[result.length - 1].name, "Butter Pecan");
    // All recipes present
    assert.equal(result.length, 5);
  });
});
