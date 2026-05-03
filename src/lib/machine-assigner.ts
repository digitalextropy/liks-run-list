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

  // Tag each recipe with its family
  const tagged = requests.map((r) => ({ ...r, family: detectFamily(r) }));

  // Special-case: single machine — everything goes there
  if (machines.length <= 1) {
    const m = machines[0];
    return tagged.map((r) => ({
      ...r,
      assignedMachine: m?.name ?? "Batch A",
      runsNeeded: Math.ceil(r.tubs / (m?.tubs_per_run ?? 2)),
    }));
  }

  const totalTubs = requests.reduce((s, r) => s + r.tubs, 0);

  // Identify 44 QT machine (if present among selected machines)
  const machine44 = machines.find((m) => m.name.includes("44"));

  // Step 1: If 44 QT is available, assign eligible recipes to it (target ~1/3 of volume)
  const assigned44 = new Set<RecipeRequest>();
  if (machine44) {
    const tpr44 = machine44.tubs_per_run;
    const targetPerMachine = Math.round(totalTubs / machines.length);

    const eligible44Recipes = tagged.filter((r) => {
      if (r.family === "vegan" || r.family === "sorbet") return false;
      if (!r.recipe.eligible44qt) return false;
      if (r.tubs % tpr44 !== 0) return false;
      return true;
    });
    eligible44Recipes.sort((a, b) => b.tubs - a.tubs);

    let tubs44 = 0;
    for (const r of eligible44Recipes) {
      if (tubs44 + r.tubs <= targetPerMachine * 1.5 || tubs44 < targetPerMachine * 0.5) {
        assigned44.add(r);
        tubs44 += r.tubs;
      }
      if (tubs44 >= targetPerMachine) break;
    }
  }

  // Step 2: Distribute remaining recipes across non-44 QT machines (or all machines if no 44 QT).
  const batchMachines = machines.filter((m) => m !== machine44);
  const remaining = tagged.filter((r) => !assigned44.has(r));

  // Separate allergen-sensitive groups for ordering
  const veganRecipes = remaining.filter((r) => r.family === "vegan");
  const nutRecipes = remaining.filter((r) => r.family === "nut");
  const peanutRecipes = remaining.filter((r) => r.family === "peanut");
  const otherRecipes = remaining.filter(
    (r) => r.family !== "vegan" && r.family !== "nut" && r.family !== "peanut"
  );

  // Track tubs per batch machine
  const machineTubs = new Map<string, number>(batchMachines.map((m) => [m.name, 0]));
  const machineAssignments = new Map<RecipeRequest, string>();

  function assignToLeastLoaded(recipe: RecipeRequest) {
    let minMachine = batchMachines[0].name;
    let minTubs = machineTubs.get(minMachine) ?? 0;
    for (const m of batchMachines) {
      const t = machineTubs.get(m.name) ?? 0;
      if (t < minTubs) { minTubs = t; minMachine = m.name; }
    }
    machineAssignments.set(recipe, minMachine);
    machineTubs.set(minMachine, (machineTubs.get(minMachine) ?? 0) + recipe.tubs);
  }

  // Vegan goes to first batch machine (runs first of day)
  for (const r of veganRecipes) {
    machineAssignments.set(r, batchMachines[0].name);
    machineTubs.set(batchMachines[0].name, (machineTubs.get(batchMachines[0].name) ?? 0) + r.tubs);
  }

  // Other recipes: largest first, greedy to least-loaded
  otherRecipes.sort((a, b) => b.tubs - a.tubs);
  for (const r of otherRecipes) assignToLeastLoaded(r);

  // Nuts and peanuts last (still balance across machines)
  for (const r of nutRecipes) assignToLeastLoaded(r);
  for (const r of peanutRecipes) assignToLeastLoaded(r);

  // Step 3: Build result with exact run counts
  const result: AssignedRecipe[] = [];
  for (const r of tagged) {
    let machineName: string;
    if (assigned44.has(r)) {
      machineName = machine44!.name;
    } else {
      machineName = machineAssignments.get(r) ?? batchMachines[0].name;
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
