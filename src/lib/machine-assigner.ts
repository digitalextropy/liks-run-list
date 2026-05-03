import type { Recipe } from "./recipe-schema";
import type { ProductionRules } from "./rules-schema";

export interface RecipeRequest {
  name: string;
  tubs: number;
  recipe: Recipe;
}

export interface AssignedRecipe extends RecipeRequest {
  assignedMachine: string;
  runsNeeded: number;
  family: FamilyKey;
}

export type FamilyKey =
  | "vegan"
  | "sorbet"
  | "cheesecake"
  | "chocolate"
  | "coffee"
  | "fruit_ta"
  | "nut"
  | "peanut"
  | "plain";

function detectFamily(r: RecipeRequest): FamilyKey {
  const name = r.name.toLowerCase();
  const base = r.recipe.base.type;
  const addInNames = r.recipe.addIns.map((a) => a.name.toLowerCase());
  const allergens = r.recipe.allergens.map((a) => a.toLowerCase());

  if (base === "vegan") return "vegan";
  if (base === "sorbet" || base === "sherbet") return "sorbet";
  if (base === "cheesecake") return "cheesecake";

  const hasTreeNutAddIn = addInNames.some((n) =>
    ["pecan", "almond", "walnut", "pistachio", "coconut", "praline"].some((nut) => n.includes(nut))
  );
  const hasPeanutAddIn = addInNames.some((n) => n.includes("peanut") || n.includes("pb"));
  const hasPeanutAllergen = allergens.some((a) => a.includes("peanut"));
  const hasTreeNutAllergen = allergens.some((a) => a.includes("tree nut"));

  if (hasPeanutAddIn) return "peanut";
  if (hasTreeNutAddIn || (hasTreeNutAllergen && !hasPeanutAllergen)) return "nut";

  if (base === "chocolate") return "chocolate";

  const coffeeKeywords = ["coffee", "sleepless", "espresso", "mocha", "tasters choice"];
  if (
    coffeeKeywords.some((k) => name.includes(k)) ||
    addInNames.some((n) => coffeeKeywords.some((k) => n.includes(k)))
  ) {
    return "coffee";
  }

  const fruitTANames = ["strawberr", "cherr", "pineapple", "banana", "peach", "apple pie", "apple cobbler"];
  const hasFruitTA =
    r.recipe.addIns.some((a) => a.taTrigger === "always" && fruitTANames.some((f) => a.name.toLowerCase().includes(f))) ||
    fruitTANames.some((f) => name.includes(f));
  if (hasFruitTA) return "fruit_ta";

  return "plain";
}

export function assignMachines(requests: RecipeRequest[], rules: ProductionRules): AssignedRecipe[] {
  const machines = rules.machines;
  const machine44 = machines.find((m) => m.name.includes("44")) ?? machines[2];
  const batchMachines = machines.filter((m) => m !== machine44);

  if (!machine44 || batchMachines.length < 2) {
    const tubsPerRun = machines[0]?.tubs_per_run ?? 2;
    return requests.map((r) => ({
      ...r,
      assignedMachine: machines[0]?.name ?? "Batch A",
      runsNeeded: Math.ceil(r.tubs / tubsPerRun),
      family: detectFamily(r),
    }));
  }

  const batchA = batchMachines[0];
  const batchB = batchMachines[1];

  // Tag each recipe with its family
  const tagged = requests.map((r) => ({ ...r, family: detectFamily(r) }));

  // Group by family
  const familyMap = new Map<FamilyKey, (RecipeRequest & { family: FamilyKey })[]>();
  for (const r of tagged) {
    if (!familyMap.has(r.family)) familyMap.set(r.family, []);
    familyMap.get(r.family)!.push(r);
  }

  // Total volume
  const totalTubs = requests.reduce((s, r) => s + r.tubs, 0);
  const targetPerMachine = Math.round(totalTubs / 3);

  // Step 1: Assign 44 QT — per-recipe eligibility check.
  // Recipe must: (1) be eligible44qt, (2) not vegan/sorbet, (3) tubs divisible by tubs_per_run.
  const tpr44 = machine44.tubs_per_run;
  const eligible44Recipes: (RecipeRequest & { family: FamilyKey })[] = [];
  for (const r of tagged) {
    if (r.family === "vegan" || r.family === "sorbet") continue;
    if (!r.recipe.eligible44qt) continue;
    if (r.tubs % tpr44 !== 0) continue;
    eligible44Recipes.push(r);
  }
  // Sort by tubs descending for greedy packing
  eligible44Recipes.sort((a, b) => b.tubs - a.tubs);

  const assigned44 = new Set<RecipeRequest>();
  let tubs44 = 0;

  for (const r of eligible44Recipes) {
    if (tubs44 + r.tubs <= targetPerMachine * 1.5 || tubs44 < targetPerMachine * 0.5) {
      assigned44.add(r);
      tubs44 += r.tubs;
    }
    if (tubs44 >= targetPerMachine) break;
  }

  // Step 2: Balance remaining recipes between Batch A and Batch B.
  // Allergen constraints: vegan first (assign to A), nut/peanut last (assign to least-loaded).
  // Allow splitting families across machines for balance.
  const remaining = tagged.filter((r) => !assigned44.has(r));

  const veganRecipes = remaining.filter((r) => r.family === "vegan");
  const nutRecipes = remaining.filter((r) => r.family === "nut");
  const peanutRecipes = remaining.filter((r) => r.family === "peanut");
  const otherRecipes = remaining.filter(
    (r) => r.family !== "vegan" && r.family !== "nut" && r.family !== "peanut"
  );

  const assignedA = new Set<RecipeRequest>();
  const assignedB = new Set<RecipeRequest>();
  let tubsA = 0;
  let tubsB = 0;

  // Vegan goes to Batch A (runs first)
  for (const r of veganRecipes) {
    assignedA.add(r);
    tubsA += r.tubs;
  }

  // Sort other recipes largest first for better greedy packing
  otherRecipes.sort((a, b) => b.tubs - a.tubs);

  // Pure greedy: assign each recipe to the least-loaded batch machine
  for (const r of otherRecipes) {
    if (tubsA <= tubsB) {
      assignedA.add(r);
      tubsA += r.tubs;
    } else {
      assignedB.add(r);
      tubsB += r.tubs;
    }
  }

  // Nuts and peanuts: assign to least-loaded (they run last regardless)
  for (const r of nutRecipes) {
    if (tubsA <= tubsB) { assignedA.add(r); tubsA += r.tubs; }
    else { assignedB.add(r); tubsB += r.tubs; }
  }
  for (const r of peanutRecipes) {
    if (tubsA <= tubsB) { assignedA.add(r); tubsA += r.tubs; }
    else { assignedB.add(r); tubsB += r.tubs; }
  }

  // Step 3: Build result with exact run counts
  const result: AssignedRecipe[] = [];
  for (const r of tagged) {
    let machineName: string;
    if (assigned44.has(r)) {
      machineName = machine44.name;
    } else if (assignedA.has(r)) {
      machineName = batchA.name;
    } else {
      machineName = batchB.name;
    }
    const tubsPerRun = machines.find((m) => m.name === machineName)!.tubs_per_run;
    result.push({
      ...r,
      assignedMachine: machineName,
      runsNeeded: Math.ceil(r.tubs / tubsPerRun),
      family: r.family,
    });
  }

  return result;
}
