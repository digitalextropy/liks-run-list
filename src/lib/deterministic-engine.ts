import type { ProductionRules } from "./rules-schema";
import type { RunListOutput } from "./claude";
import type { RecipeRequest } from "./machine-assigner";

// Deterministic run-list engine.
//
// Replaces Claude's role in sequencing + clean_after decisions with rule-driven code.
// Claude is reduced to (1) recipe name matching, already in /api/validate, and
// (2) generating human-readable `reason` and `footer_note` text after the engine
// has produced the run list.
//
// Activation: set USE_DETERMINISTIC_ENGINE=true in Vercel env vars. Defaults to off
// so the existing Claude-based flow runs unchanged.
//
// This is a scaffolding stub. Stages of implementation:
//   1. (NEXT) Add structured rule fields to ProductionRules + Rules page UI.
//   2. Implement decideCleanAfter(prev, curr, rules) — replaces Claude's clean_after.
//   3. Implement sequenceRuns(recipes, rules) — replaces Claude's sequencing.
//   4. Wire AI prose layer for reason + footer_note.
//   5. Run alongside Claude, log mismatches, then cut over.

export async function generateRunListDeterministic(
  _recipes: RecipeRequest[],
  _rules: ProductionRules
): Promise<RunListOutput> {
  throw new Error(
    "Deterministic engine is not yet implemented. " +
      "Set USE_DETERMINISTIC_ENGINE=false (or unset) to use the Claude-based flow."
  );
}

export function isDeterministicEngineEnabled(): boolean {
  return process.env.USE_DETERMINISTIC_ENGINE === "true";
}
