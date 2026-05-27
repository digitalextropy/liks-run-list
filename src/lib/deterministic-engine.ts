import type { ProductionRules, CleanLevel, CleanDecisionRow, AllergenTransition, CleaningTier } from "./rules-schema";
import type { RunListOutput } from "./claude";
import type { RecipeRequest, AssignedRecipe } from "./machine-assigner";
import { DEFAULT_ALLERGEN_ORDER, DEFAULT_BASE_BOLDNESS_ORDER } from "./rules-schema";

// ─── Static defaults (mirror of seed-structured/route.ts buildStaticDefaults) ───

function buildStaticCleaningDecisionTable(): CleanDecisionRow[] {
  return [
    { id: "cd-1-same-recipe", priority: 1, condition_kind: "same_recipe_back_to_back", clean_after: "NO_CLEAN", reason: "Identical recipes — no transfer concern." },
    { id: "cd-2-always-ta", priority: 2, condition_kind: "has_always_ta_addin", clean_after: "TAKE_APART", reason: "Recipe contains an always-TA add-in (sticky pieces in blades)." },
    { id: "cd-3-same-conditional", priority: 3, condition_kind: "same_conditional_ta_addin", clean_after: "NO_CLEAN", reason: "Same conditional-TA add-in carries over cleanly." },
    { id: "cd-4-same-base-foldin", priority: 4, condition_kind: "same_base_fold_in_only", clean_after: "NO_CLEAN", reason: "Same base, differences are fold-ins (outside machine)." },
    { id: "cd-5-last-conditional", priority: 5, condition_kind: "last_run_conditional_ta_chain", clean_after: "TAKE_APART", reason: "End of conditional-TA chain — clear residue." },
    { id: "cd-6-allergen-escalation", priority: 6, condition_kind: "allergen_escalation", clean_after: "from_allergen_table", reason: "See allergen transitions table." },
    { id: "cd-7-major-family", priority: 7, condition_kind: "major_family_change", clean_after: "RINSE", reason: "Major flavor family change." },
    { id: "cd-8-same-family-different-addin", priority: 8, condition_kind: "same_family_different_addin", clean_after: "WATER_RINSE", reason: "Same family, different add-in — minor transition." },
    { id: "cd-9-default", priority: 9, condition_kind: "default", clean_after: "NO_CLEAN", reason: "Default fallback: nothing requires a clean." },
  ];
}

function buildStaticAllergenTransitions(): AllergenTransition[] {
  return [
    { from: "peanut", to: "tree_nut", required_clean: "TAKE_APART", reason: "Peanut allergen must be fully cleared before any tree nut recipe." },
    { from: "tree_nut", to: "peanut", required_clean: "TAKE_APART", reason: "Tree nut allergen must be cleared before peanut (rare ordering)." },
    { from: "vegan", to: "plain", required_clean: "TAKE_APART", reason: "Vegan base + coconut (tree nut) must clear before dairy." },
  ];
}

// ─── Condition evaluators ───

function hasAlwaysTAAddIn(recipe: AssignedRecipe): boolean {
  return recipe.recipe.addIns.some(a => a.taTrigger === "always");
}

function sameRecipeBackToBack(prev: AssignedRecipe | null, curr: AssignedRecipe): boolean {
  if (!prev) return false;
  return prev.name.toLowerCase().trim() === curr.name.toLowerCase().trim();
}

function sameConditionalTAAddIn(prev: AssignedRecipe | null, curr: AssignedRecipe): boolean {
  if (!prev) return false;
  const prevConditional = prev.recipe.addIns
    .filter(a => a.taTrigger === "conditional")
    .map(a => a.name.toLowerCase().trim());
  const currConditional = curr.recipe.addIns
    .filter(a => a.taTrigger === "conditional")
    .map(a => a.name.toLowerCase().trim());
  return prevConditional.some(p => currConditional.includes(p));
}

function sameBaseFoldInOnly(prev: AssignedRecipe | null, curr: AssignedRecipe): boolean {
  if (!prev) return false;
  if (prev.family !== curr.family) return false;
  if (prev.recipe.base.type !== curr.recipe.base.type) return false;
  const prevHasAddIns = prev.recipe.addIns.some(a => a.taTrigger !== "none");
  const currHasAddIns = curr.recipe.addIns.some(a => a.taTrigger !== "none");
  return !prevHasAddIns && !currHasAddIns;
}

function areFamiliesAdjacent(prevFamily: string, currFamily: string, allergenOrder: string[]): boolean {
  const prevIdx = allergenOrder.indexOf(prevFamily);
  const currIdx = allergenOrder.indexOf(currFamily);
  if (prevIdx === -1 || currIdx === -1) return false;
  return Math.abs(prevIdx - currIdx) === 1;
}

function isMajorFamilyChange(prev: AssignedRecipe | null, curr: AssignedRecipe, allergenOrder: string[]): boolean {
  if (!prev) return false;
  if (prev.family === curr.family) return false;
  if (areFamiliesAdjacent(prev.family, curr.family, allergenOrder)) return false;
  return true;
}

function sameFamilyDifferentAddIn(prev: AssignedRecipe | null, curr: AssignedRecipe): boolean {
  if (!prev) return false;
  if (prev.family !== curr.family) return false;
  const prevAddIns = prev.recipe.addIns.map(a => a.name.toLowerCase().trim()).sort().join("|");
  const currAddIns = curr.recipe.addIns.map(a => a.name.toLowerCase().trim()).sort().join("|");
  return prevAddIns !== currAddIns;
}

function lookupAllergenTransition(
  prev: AssignedRecipe,
  curr: AssignedRecipe,
  transitions: AllergenTransition[]
): AllergenTransition | null {
  // Map family keys to allergen group names for lookup.
  // The "nut" family key maps to "tree_nut" in the allergen transitions table.
  const mapFamily = (f: string) => f === "nut" ? "tree_nut" : f;
  const prevGroup = mapFamily(prev.family);
  const currGroup = mapFamily(curr.family);
  return transitions.find(t => t.from === prevGroup && t.to === currGroup) ?? null;
}

function hasAllergenEscalation(prev: AssignedRecipe | null, curr: AssignedRecipe, transitions: AllergenTransition[]): boolean {
  if (!prev) return false;
  return lookupAllergenTransition(prev, curr, transitions) !== null;
}

// ─── Condition dispatcher ───

interface ConditionContext {
  prev: AssignedRecipe | null;
  curr: AssignedRecipe;
  rules: ProductionRules;
  allergenOrder: string[];
  allergenTransitions: AllergenTransition[];
}

function evaluateCondition(kind: CleanDecisionRow["condition_kind"], ctx: ConditionContext): boolean {
  switch (kind) {
    case "has_always_ta_addin":
      return hasAlwaysTAAddIn(ctx.curr);
    case "same_recipe_back_to_back":
      return sameRecipeBackToBack(ctx.prev, ctx.curr);
    case "same_conditional_ta_addin":
      return sameConditionalTAAddIn(ctx.prev, ctx.curr);
    case "same_base_fold_in_only":
      return sameBaseFoldInOnly(ctx.prev, ctx.curr);
    case "last_run_conditional_ta_chain":
      return !!(ctx.curr as AssignedRecipe & { isLastOfConditionalChain?: boolean }).isLastOfConditionalChain;
    case "allergen_escalation":
      return hasAllergenEscalation(ctx.prev, ctx.curr, ctx.allergenTransitions);
    case "major_family_change":
      return isMajorFamilyChange(ctx.prev, ctx.curr, ctx.allergenOrder);
    case "same_family_different_addin":
      return sameFamilyDifferentAddIn(ctx.prev, ctx.curr);
    case "default":
      return true;
    default:
      return false;
  }
}

// ─── Main function ───

export interface CleanDecision {
  clean_after: CleanLevel;
  reason: string;
}

export function decideCleanAfter(
  prev: AssignedRecipe | null,
  curr: AssignedRecipe,
  rules: ProductionRules
): CleanDecision {
  // First run on machine — no cleaning needed
  if (!prev) {
    return { clean_after: "NO_CLEAN", reason: "First run on machine — no previous residue." };
  }

  // Recipe override: short-circuit if force_clean_after is set
  const recipeNote = rules.recipe_notes?.find(
    n => n.recipe.toLowerCase().trim() === curr.name.toLowerCase().trim()
  );
  if (recipeNote?.overrides?.force_clean_after) {
    return {
      clean_after: recipeNote.overrides.force_clean_after,
      reason: `Force-set via recipe override for ${curr.name}.`,
    };
  }

  const table = rules.cleaning_decision_table?.length
    ? [...rules.cleaning_decision_table].sort((a, b) => a.priority - b.priority)
    : buildStaticCleaningDecisionTable();

  const allergenOrder = rules.allergen_order ?? [...DEFAULT_ALLERGEN_ORDER];
  const allergenTransitions = rules.allergen_transitions ?? buildStaticAllergenTransitions();

  const ctx: ConditionContext = { prev, curr, rules, allergenOrder, allergenTransitions };

  for (const row of table) {
    if (!evaluateCondition(row.condition_kind, ctx)) continue;

    // Resolve clean level
    let cleanAfter: CleanLevel;
    let reason: string;

    if (row.clean_after === "from_allergen_table") {
      const transition = lookupAllergenTransition(prev, curr, allergenTransitions);
      if (transition) {
        cleanAfter = transition.required_clean;
        reason = transition.reason;
      } else {
        // No specific transition found — fall through to next row
        continue;
      }
    } else {
      cleanAfter = row.clean_after;
      reason = row.reason;
    }

    return { clean_after: cleanAfter, reason };
  }

  // Should never reach here if table has a "default" row, but safety fallback
  return { clean_after: "NO_CLEAN", reason: "No matching rule — default." };
}

// ─── Stage 3: sequenceRuns ───

const CLEAN_LEVEL_COST: Record<CleanLevel, number> = {
  NO_CLEAN: 0,
  WATER_RINSE: 3,
  RINSE: 8,
  TAKE_APART: 25,
};

function cleanCostMinutes(level: CleanLevel, tiers: CleaningTier[] | undefined): number {
  if (tiers?.length) {
    const tier = tiers.find(t => t.level === level);
    if (tier) return tier.duration_minutes;
  }
  return CLEAN_LEVEL_COST[level];
}

function familyPosition(family: string, allergenOrder: string[]): number {
  const idx = allergenOrder.indexOf(family);
  return idx === -1 ? allergenOrder.length : idx;
}

function boldnessPosition(baseType: string, boldnessOrder: string[]): number {
  const idx = boldnessOrder.indexOf(baseType);
  return idx === -1 ? boldnessOrder.length : idx;
}

function expandRuns(recipes: AssignedRecipe[]): AssignedRecipe[] {
  const expanded: AssignedRecipe[] = [];
  for (const r of recipes) {
    for (let i = 0; i < r.runsNeeded; i++) {
      expanded.push({ ...r });
    }
  }
  return expanded;
}

function markConditionalChainEnds(sequence: AssignedRecipe[]): void {
  for (let i = 0; i < sequence.length; i++) {
    const curr = sequence[i];
    const conditionalAddIns = curr.recipe.addIns
      .filter(a => a.taTrigger === "conditional")
      .map(a => a.name.toLowerCase().trim());

    if (conditionalAddIns.length === 0) continue;

    const hasLaterShared = sequence.slice(i + 1).some(later =>
      later.recipe.addIns.some(
        a => a.taTrigger === "conditional" && conditionalAddIns.includes(a.name.toLowerCase().trim())
      )
    );

    (curr as AssignedRecipe & { isLastOfConditionalChain?: boolean }).isLastOfConditionalChain = !hasLaterShared;
  }
}

export function sequenceRuns(
  recipes: AssignedRecipe[],
  rules: ProductionRules
): AssignedRecipe[] {
  if (recipes.length === 0) return [];

  const allergenOrder = rules.allergen_order ?? [...DEFAULT_ALLERGEN_ORDER];
  const boldnessOrder = rules.base_boldness_order ?? [...DEFAULT_BASE_BOLDNESS_ORDER];

  // Expand multi-run recipes into individual run entries
  const runs = expandRuns(recipes);
  if (runs.length <= 1) return runs;

  // Greedy nearest-neighbor: pick the next run that minimizes cleaning cost.
  // Tiebreak by: allergen order position, then boldness order, then name (stable).
  const remaining = new Set(runs.map((_, i) => i));
  const sequence: AssignedRecipe[] = [];

  // Seed: pick the run with the lowest allergen order position, then lowest boldness
  let bestStart = 0;
  let bestStartScore = Infinity;
  for (const idx of remaining) {
    const r = runs[idx];
    const score = familyPosition(r.family, allergenOrder) * 1000 + boldnessPosition(r.recipe.base.type, boldnessOrder);
    if (score < bestStartScore) {
      bestStartScore = score;
      bestStart = idx;
    }
  }
  sequence.push(runs[bestStart]);
  remaining.delete(bestStart);

  while (remaining.size > 0) {
    const prev = sequence[sequence.length - 1];
    let bestIdx = -1;
    let bestCost = Infinity;
    let bestTiebreak = Infinity;

    for (const idx of remaining) {
      const candidate = runs[idx];
      const decision = decideCleanAfter(prev, candidate, rules);
      const cost = cleanCostMinutes(decision.clean_after, rules.cleaning_tiers);

      // Tiebreak: prefer same recipe (chains), then allergen order, then boldness, then name
      const sameRecipe = prev.name === candidate.name ? 0 : 1;
      const tiebreak =
        sameRecipe * 1_000_000 +
        familyPosition(candidate.family, allergenOrder) * 1000 +
        boldnessPosition(candidate.recipe.base.type, boldnessOrder);

      if (cost < bestCost || (cost === bestCost && tiebreak < bestTiebreak)) {
        bestCost = cost;
        bestTiebreak = tiebreak;
        bestIdx = idx;
      }
    }

    sequence.push(runs[bestIdx]);
    remaining.delete(bestIdx);
  }

  // Mark conditional-TA chain endpoints for decideCleanAfter lookahead
  markConditionalChainEnds(sequence);

  return sequence;
}

export interface SequenceResult {
  sequence: AssignedRecipe[];
  totalCleanMinutes: number;
  cleanBreakdown: { from: string; to: string; clean_after: CleanLevel; minutes: number }[];
}

export function sequenceRunsWithCost(
  recipes: AssignedRecipe[],
  rules: ProductionRules
): SequenceResult {
  const sequence = sequenceRuns(recipes, rules);
  const cleanBreakdown: SequenceResult["cleanBreakdown"] = [];
  let totalCleanMinutes = 0;

  for (let i = 1; i < sequence.length; i++) {
    const decision = decideCleanAfter(sequence[i - 1], sequence[i], rules);
    const minutes = cleanCostMinutes(decision.clean_after, rules.cleaning_tiers);
    cleanBreakdown.push({
      from: sequence[i - 1].name,
      to: sequence[i].name,
      clean_after: decision.clean_after,
      minutes,
    });
    totalCleanMinutes += minutes;
  }

  return { sequence, totalCleanMinutes, cleanBreakdown };
}

// ─── Stage 4: generateRunListDeterministic ───

function buildStubReason(run: AssignedRecipe, cleanAfter: CleanLevel): string {
  const base = run.recipe.base.type;
  const addIns = run.recipe.addIns;
  const addInSummary = addIns.length > 0
    ? addIns.map(a => a.name).join(", ")
    : "no add-ins";
  const cleanLabel = cleanAfter === "NO_CLEAN" ? "no clean needed"
    : cleanAfter === "WATER_RINSE" ? "water rinse"
    : cleanAfter === "RINSE" ? "rinse"
    : "take-apart";
  return `${base} base; ${addInSummary} — ${cleanLabel}`;
}

function detectChainBadge(sequence: AssignedRecipe[], index: number): { badge: boolean; label?: string } {
  const curr = sequence[index];
  const prev = index > 0 ? sequence[index - 1] : null;
  const next = index < sequence.length - 1 ? sequence[index + 1] : null;

  if (!prev || prev.name !== curr.name) {
    // Start of a potential chain — count consecutive identical
    let count = 1;
    for (let j = index + 1; j < sequence.length && sequence[j].name === curr.name; j++) count++;
    if (count > 1) return { badge: true, label: `×${count}` };
  } else if (prev.name === curr.name) {
    // Continuation of chain
    return { badge: true };
  }

  return { badge: false };
}

function detectSectionLabel(sequence: AssignedRecipe[], index: number): string | undefined {
  if (index === 0) return familyLabel(sequence[0].family);
  const prev = sequence[index - 1];
  const curr = sequence[index];
  if (prev.family !== curr.family) return familyLabel(curr.family);
  return undefined;
}

function familyLabel(family: string): string {
  const labels: Record<string, string> = {
    vegan: "Vegan block",
    sorbet: "Sorbet / Sherbet block",
    plain: "Plain base — ascending boldness",
    chocolate: "Chocolate base block",
    coffee: "Coffee family chain",
    cheesecake: "Cheesecake family",
    fruit_ta: "Fruit block (TA required)",
    peanut: "Peanut — end of day",
    nut: "Tree nut — end of day",
  };
  return labels[family] ?? `${family} block`;
}

async function generateProseWithHaiku(
  machineName: string,
  runs: { flavor: string; clean_after: CleanLevel; base: string; addIns: string }[],
): Promise<{ reasons: string[]; footerNote: string }> {
  // Dynamic import to avoid module-load-time crash when ANTHROPIC_API_KEY is unset
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const runSummary = runs.map((r, i) =>
    `${i + 1}. ${r.flavor} (${r.base} base, ${r.addIns || "no add-ins"}) → ${r.clean_after}`
  ).join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    system: `You write concise production-floor explanations for an ice cream run list. For each run, write 1 short sentence explaining why this cleaning step was chosen (focusing on what's in the machine and what's coming next). Also write a 1-2 sentence footer note summarizing the machine's sequence strategy. Return ONLY JSON: { "reasons": ["..."], "footer_note": "..." }`,
    messages: [{
      role: "user",
      content: `Machine: ${machineName}\nRun order:\n${runSummary}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Haiku response");
  const parsed = JSON.parse(jsonMatch[0]) as { reasons: string[]; footer_note: string };
  return { reasons: parsed.reasons ?? [], footerNote: parsed.footer_note ?? "" };
}

export async function generateRunListDeterministic(
  recipes: RecipeRequest[],
  rules: ProductionRules
): Promise<RunListOutput> {
  const { assignMachines } = await import("./machine-assigner");

  // Phase 1: deterministic machine assignment
  const assigned = assignMachines(recipes, rules);

  // Group by machine
  const byMachine = new Map<string, AssignedRecipe[]>();
  for (const r of assigned) {
    if (!byMachine.has(r.assignedMachine)) byMachine.set(r.assignedMachine, []);
    byMachine.get(r.assignedMachine)!.push(r);
  }

  // Phase 2+3: per-machine sequencing + clean decisions
  const machineResults = rules.machines.map(machine => {
    const machineRecipes = byMachine.get(machine.name) ?? [];
    if (machineRecipes.length === 0) {
      return {
        name: machine.name,
        capacity_gallons: machine.capacity_gallons,
        tubs_per_run: machine.tubs_per_run,
        runs: [] as RunListOutput["machines"][number]["runs"],
        summary: { total_runs: 0, total_tubs: 0, take_aparts: 0, rinses: 0, water_rinses: 0, no_cleans: 0 },
        footer_note: "",
        _sequenced: [] as AssignedRecipe[],
      };
    }

    const sequenced = sequenceRuns(machineRecipes, rules);
    const runs: RunListOutput["machines"][number]["runs"] = [];

    for (let i = 0; i < sequenced.length; i++) {
      const recipe = sequenced[i];
      const next = i < sequenced.length - 1 ? sequenced[i + 1] : null;
      const decision = next
        ? decideCleanAfter(recipe, next, rules)
        : { clean_after: "NO_CLEAN" as CleanLevel, reason: "Last run on machine." };
      const chain = detectChainBadge(sequenced, i);
      const sectionLabel = detectSectionLabel(sequenced, i);

      const addInSummary = recipe.recipe.addIns.length > 0
        ? recipe.recipe.addIns.map(a => a.name).join(", ")
        : undefined;

      runs.push({
        order: i + 1,
        flavor: recipe.name,
        tubs: machine.tubs_per_run,
        clean_after: decision.clean_after,
        reason: buildStubReason(recipe, decision.clean_after),
        chain_badge: chain.badge,
        chain_label: chain.label,
        flags: [],
        mix_ins: addInSummary,
        section_label: sectionLabel,
      });
    }

    const summary = {
      total_runs: runs.length,
      total_tubs: runs.length * machine.tubs_per_run,
      take_aparts: runs.filter(r => r.clean_after === "TAKE_APART").length,
      rinses: runs.filter(r => r.clean_after === "RINSE").length,
      water_rinses: runs.filter(r => r.clean_after === "WATER_RINSE").length,
      no_cleans: runs.filter(r => r.clean_after === "NO_CLEAN").length,
    };

    return {
      name: machine.name,
      capacity_gallons: machine.capacity_gallons,
      tubs_per_run: machine.tubs_per_run,
      runs,
      summary,
      footer_note: "",
      _sequenced: sequenced,
    };
  });

  // Phase 4: AI prose layer (cosmetic — failures produce stub text)
  await Promise.all(
    machineResults.map(async (mr) => {
      if (mr.runs.length === 0) return;
      try {
        const proseInput = mr.runs.map(r => ({
          flavor: r.flavor,
          clean_after: r.clean_after,
          base: mr._sequenced.find(s => s.name === r.flavor)?.recipe.base.type ?? "plain",
          addIns: r.mix_ins ?? "no add-ins",
        }));
        const prose = await generateProseWithHaiku(mr.name, proseInput);
        for (let i = 0; i < mr.runs.length && i < prose.reasons.length; i++) {
          mr.runs[i].reason = prose.reasons[i];
        }
        mr.footer_note = prose.footerNote;
      } catch (e) {
        console.log(`[deterministic-engine] Haiku prose failed for ${mr.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    })
  );

  // Build final output (strip internal _sequenced field)
  const machines = machineResults.map(({ _sequenced: _, ...rest }) => rest);

  const totals = {
    runs: machines.reduce((s, m) => s + m.summary.total_runs, 0),
    tubs: machines.reduce((s, m) => s + m.summary.total_tubs, 0),
    gallons: machines.reduce((s, m) => s + m.summary.total_tubs * (m.capacity_gallons / m.tubs_per_run), 0),
    take_aparts: machines.reduce((s, m) => s + m.summary.take_aparts, 0),
    rinses: machines.reduce((s, m) => s + m.summary.rinses, 0),
    water_rinses: machines.reduce((s, m) => s + m.summary.water_rinses, 0),
    no_cleans: machines.reduce((s, m) => s + m.summary.no_cleans, 0),
  };

  return { machines, totals };
}

export function isDeterministicEngineEnabled(): boolean {
  return process.env.USE_DETERMINISTIC_ENGINE === "true";
}
