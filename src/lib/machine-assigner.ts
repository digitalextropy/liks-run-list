import type { Recipe } from "./recipe-schema";
import type { ProductionRules } from "./rules-schema";

export interface RecipeRequest {
  name: string;
  tubs: number;
  recipe: Recipe;
}

export interface AssignedRecipe extends RecipeRequest {
  assignedMachine: string;
  family: FamilyKey;
}

type FamilyKey =
  | "vegan"
  | "sorbet"
  | "cheesecake"
  | "chocolate"
  | "coffee"
  | "fruit_ta"
  | "nut"
  | "peanut"
  | "plain";

// Detect a recipe's production family for grouping purposes.
function detectFamily(r: RecipeRequest): FamilyKey {
  const name = r.name.toLowerCase();
  const base = r.recipe.base.type;
  const addInNames = r.recipe.addIns.map((a) => a.name.toLowerCase());
  const allergens = r.recipe.allergens.map((a) => a.toLowerCase());

  if (base === "vegan") return "vegan";
  if (base === "sorbet" || base === "sherbet") return "sorbet";
  if (base === "cheesecake") return "cheesecake";

  // Nut allergens (tree nut / peanut) — must run last
  const hasTreeNutAddIn = addInNames.some((n) =>
    ["pecan", "almond", "walnut", "pistachio", "coconut", "praline"].some((nut) => n.includes(nut))
  );
  const hasPeanutAddIn = addInNames.some((n) => n.includes("peanut") || n.includes("pb"));
  const hasPeanutAllergen = allergens.some((a) => a.includes("peanut"));
  const hasTreeNutAllergen = allergens.some((a) => a.includes("tree nut"));

  // Peanut is highest allergen priority — classify as peanut if peanut add-in or allergen
  if (hasPeanutAddIn || (hasPeanutAllergen && !hasTreeNutAddIn)) {
    // Only classify as peanut if peanut is actually an add-in trigger
    if (hasPeanutAddIn) return "peanut";
  }
  if (hasTreeNutAddIn || hasTreeNutAllergen) return "nut";

  if (base === "chocolate") return "chocolate";

  // Coffee family: recipe name or add-in contains coffee keywords
  const coffeeKeywords = ["coffee", "sleepless", "espresso", "mocha", "tasters choice"];
  if (
    coffeeKeywords.some((k) => name.includes(k)) ||
    addInNames.some((n) => coffeeKeywords.some((k) => n.includes(k)))
  ) {
    return "coffee";
  }

  // Fruit that triggers TA — group together to chain them
  const fruitTANames = ["strawberr", "cherr", "pineapple", "banana", "peach", "apple pie", "apple cobbler"];
  const hasFruitTA =
    r.recipe.addIns.some((a) => a.taTrigger === "always" && fruitTANames.some((f) => a.name.toLowerCase().includes(f))) ||
    fruitTANames.some((f) => name.includes(f));

  if (hasFruitTA) return "fruit_ta";

  return "plain";
}

// Determine if a family is eligible for the 44 QT machine.
// 44 QT: no fold-ins, no sorbet/sherbet, not vegan (risk of carryover).
function isFamilyEligible44qt(family: FamilyKey, recipes: RecipeRequest[]): boolean {
  if (family === "vegan" || family === "sorbet") return false;
  // All recipes in this family must be 44qt eligible
  return recipes.every((r) => r.recipe.eligible44qt);
}

interface FamilyGroup {
  family: FamilyKey;
  recipes: RecipeRequest[];
  totalTubs: number;
  eligible44qt: boolean;
}

export function assignMachines(requests: RecipeRequest[], rules: ProductionRules): AssignedRecipe[] {
  // Need at least 3 machines (Batch A, Batch B, 44 QT) — use index-based fallback if names differ
  const machines = rules.machines;
  const machine44 = machines.find((m) => m.name.includes("44")) ?? machines[2];
  const batchMachines = machines.filter((m) => m !== machine44);

  if (!machine44 || batchMachines.length < 2) {
    // Can't do family assignment — fall back to assigning all to first machine
    return requests.map((r) => ({ ...r, assignedMachine: machines[0]?.name ?? "Batch A", family: detectFamily(r) }));
  }

  const batchA = batchMachines[0];
  const batchB = batchMachines[1];

  // Step 1: Group recipes into families
  const familyMap = new Map<FamilyKey, RecipeRequest[]>();
  for (const r of requests) {
    const f = detectFamily(r);
    if (!familyMap.has(f)) familyMap.set(f, []);
    familyMap.get(f)!.push(r);
  }

  // Build family groups
  const groups: FamilyGroup[] = [];
  for (const [family, recipes] of familyMap.entries()) {
    groups.push({
      family,
      recipes,
      totalTubs: recipes.reduce((s, r) => s + r.tubs, 0),
      eligible44qt: isFamilyEligible44qt(family, recipes),
    });
  }

  const totalTubs = requests.reduce((s, r) => s + r.tubs, 0);
  const target44qt = Math.round(totalTubs / 3); // target ~1/3 of volume on 44 QT

  // Step 2: Assign 44 QT — pick eligible families up to ~1/3 of total tubs.
  // Prioritize high-volume plain families that fit cleanly.
  const eligible44 = groups
    .filter((g) => g.eligible44qt)
    .sort((a, b) => b.totalTubs - a.totalTubs); // largest first

  const assigned44Families = new Set<FamilyKey>();
  let tubs44 = 0;

  for (const g of eligible44) {
    if (tubs44 >= target44qt) break;
    // Only assign if adding this family doesn't blow past 2× target
    if (tubs44 + g.totalTubs <= target44qt * 2) {
      assigned44Families.add(g.family);
      tubs44 += g.totalTubs;
    }
  }

  // Step 3: Balance remaining families between Batch A and Batch B using greedy bin-packing.
  // Allergen ordering constraints:
  //   - vegan → must go on a batch machine first
  //   - nut/peanut → must go on machines that run them last
  // We keep these on separate machines from each other to avoid cross-contamination.
  const remainingGroups = groups.filter((g) => !assigned44Families.has(g.family));

  // Separate high-allergen families that should stay isolated
  const veganGroup = remainingGroups.find((g) => g.family === "vegan");
  const nutGroup = remainingGroups.find((g) => g.family === "nut");
  const peanutGroup = remainingGroups.find((g) => g.family === "peanut");
  const otherGroups = remainingGroups.filter(
    (g) => g.family !== "vegan" && g.family !== "nut" && g.family !== "peanut"
  );

  // Assign vegan to Batch A (it runs first on that machine)
  const batchAFamilies = new Set<FamilyKey>();
  const batchBFamilies = new Set<FamilyKey>();

  if (veganGroup) batchAFamilies.add("vegan");

  // Greedy: assign other families to whichever batch has fewer tubs so far
  const batchATubs = { current: veganGroup?.totalTubs ?? 0 };
  const batchBTubs = { current: 0 };

  for (const g of otherGroups.sort((a, b) => b.totalTubs - a.totalTubs)) {
    if (batchATubs.current <= batchBTubs.current) {
      batchAFamilies.add(g.family);
      batchATubs.current += g.totalTubs;
    } else {
      batchBFamilies.add(g.family);
      batchBTubs.current += g.totalTubs;
    }
  }

  // Assign nut and peanut: put them on whichever batch has fewer total tubs (they go last anyway)
  if (nutGroup) {
    if (batchATubs.current <= batchBTubs.current) {
      batchAFamilies.add("nut");
      batchATubs.current += nutGroup.totalTubs;
    } else {
      batchBFamilies.add("nut");
      batchBTubs.current += nutGroup.totalTubs;
    }
  }
  if (peanutGroup) {
    // Peanut ideally goes on same machine as nut (both end-of-day), but different batch if space is tight
    if (batchAFamilies.has("nut") || batchATubs.current <= batchBTubs.current) {
      batchAFamilies.add("peanut");
    } else {
      batchBFamilies.add("peanut");
    }
  }

  // Step 4: Build final assignments
  const result: AssignedRecipe[] = [];
  for (const g of groups) {
    let machineName: string;
    if (assigned44Families.has(g.family)) {
      machineName = machine44.name;
    } else if (batchAFamilies.has(g.family)) {
      machineName = batchA.name;
    } else {
      machineName = batchB.name;
    }
    for (const r of g.recipes) {
      result.push({ ...r, assignedMachine: machineName, family: g.family });
    }
  }

  return result;
}
