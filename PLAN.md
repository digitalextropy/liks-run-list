# Deterministic Engine Refactor — Plan

**Branch:** `deterministic-engine`
**Status:** Stage 0 complete (scaffolding + safety layers). Stage 1 next.
**Last updated:** 2026-05-27

This plan is self-contained. Any Claude Code session should be able to pick it up cold by reading this file plus the linked source files.

---

## Context

**The app:** [liks-run-list](https://github.com/digitalextropy/liks-run-list) is a Next.js 16 production scheduler for Liks Ice Cream. Users paste a list of recipes + tub counts; the app generates a per-machine run list with sequencing, chaining, allergen ordering, and clean-step decisions between runs.

**Stack:** Next.js 16 (App Router), React 19, TailwindCSS 4, Anthropic SDK, Vercel Blob (rules + parsed-recipe storage), Supabase (Postgres, accessed via `@vercel/postgres` client), Vercel hosting (Hobby plan — 60s function cap).

**Production URL:** https://liks-run-list.vercel.app — gated by a single password (`src/middleware.ts`).

**What happens today:** `/api/generate` calls Claude Sonnet 4.6 once per machine in parallel. Claude does sequencing + clean_after decisions + prose. Deterministic post-processing (`enforceRunCounts`) corrects quantities. `applyFooterCorrections` parses inline self-corrections Claude writes in footer text.

**Why this refactor:** Claude is unreliable at deterministic rules-based decisions (allergen ordering, clean_after choices, take-apart triggers). It self-contradicts (says one thing in `clean_after`, the opposite in `reason`). It's also slow (~60s on Hobby cap) and expensive. The deterministic core handles correctness; Claude stays for what it's actually good at: human-readable prose.

---

## Target architecture

```
Deterministic Core (code)            AI Layer (Claude — cheap/cacheable)
─────────────────────────────        ─────────────────────────────────────
1. assignMachines           ✓        1. Generate `reason` per run (post-hoc)
2. decideCleanAfter        NEW       2. Generate `footer_note` (post-hoc)
3. sequenceRuns            NEW       3. Recipe name matching (already exists
4. detectChains             ✓           in /api/validate — unchanged)
5. enforceRunCounts         ✓
6. applyFooterCorrections   ✓ (will retire when Claude no longer decides
                              clean_after)
```

Claude is no longer load-bearing for correctness. If the AI prose layer fails, the engine still returns a valid run list with stub reasons.

---

## Safety state (already in place — Stage 0)

| Layer | Pointer | Restore command |
|---|---|---|
| Git tag | `v1-pre-deterministic` on commit `9ff86f3` | `git checkout v1-pre-deterministic` |
| Rules backup | `backups/rules-2026-05-27.json` | `PUT /api/rules` with body |
| Recipes backup | `backups/recipes-2026-05-27.json` (111 recipes) | Re-upload PDF or call `saveParsedRecipes` |
| Feature flag | env var `USE_DETERMINISTIC_ENGINE` (default off) | Flip in Vercel dashboard |
| Branch | `deterministic-engine` (preview deploys only) | `master` keeps running prod |

**Critical:** every stage below must keep the flag-off path identical to current `master`. The deterministic path may be incomplete; the Claude path stays the source of truth until cutover.

---

## File map

| File | Role | Touch in… |
|---|---|---|
| [src/lib/rules-schema.ts](src/lib/rules-schema.ts) | `ProductionRules` type | Stage 1 (add fields) |
| [src/lib/recipe-schema.ts](src/lib/recipe-schema.ts) | `Recipe` type (read-only) | — |
| [src/lib/machine-assigner.ts](src/lib/machine-assigner.ts) | `assignMachines` — already deterministic | — |
| [src/lib/claude.ts](src/lib/claude.ts) | `generateRunList`, `enforceRunCounts`, `applyFooterCorrections` | Stage 4 (reduce scope) |
| [src/lib/deterministic-engine.ts](src/lib/deterministic-engine.ts) | New engine entry point — currently stub | Stages 2–3 |
| [src/lib/blob.ts](src/lib/blob.ts) | `getRules`, `saveRules`, etc. | — |
| [src/app/api/generate/route.ts](src/app/api/generate/route.ts) | API route — dispatches via flag | — |
| [src/app/rules/page.tsx](src/app/rules/page.tsx) | Rules editor UI | Stage 1 (new sections) |
| [src/app/api/rules/route.ts](src/app/api/rules/route.ts) | Rules CRUD | Stage 1 (if schema extends) |

---

## Stages

### Stage 0 — Scaffolding ✓ DONE

- Feature flag dispatch in [src/app/api/generate/route.ts](src/app/api/generate/route.ts)
- [src/lib/deterministic-engine.ts](src/lib/deterministic-engine.ts) stub
- Backups in `backups/`
- Git tag `v1-pre-deterministic`

### Stage 1 — Structured rule schema + Rules page UI (NEXT)

**Goal:** add structured rule fields the engine can read, with a UI to edit them. Keep existing prose fields untouched.

**Schema additions** (all OPTIONAL on `ProductionRules` — backward compatible):

```ts
// Add to src/lib/rules-schema.ts
interface ProductionRules {
  // ─── existing fields, unchanged ─────────────────────────
  // machines, cleaning_tiers, ta_triggers, allergen_rules,
  // sequencing_rules, optimization_rules, forty_four_qt_rule,
  // critical_rules, recipe_notes, day_structure, *_callouts

  // ─── NEW optional fields ─────────────────────────────────
  allergen_order?: string[];                       // ["vegan","plain","chocolate","coffee","fruit","peanut","tree_nut"]
  allergen_transitions?: AllergenTransition[];
  base_boldness_order?: string[];                  // ["vegan","plain","chocolate","cheesecake","graham","sherbet","sorbet"]
  family_transition_defaults?: FamilyDefault[];
  cleaning_decision_table?: CleanDecisionRow[];    // ordered priority list
  optimization_flags?: Record<string, boolean>;
  forty_four_qt_eligibility?: FortyFourQtRules;
}

interface AllergenTransition {
  from: string;
  to: string;
  required_clean: "NO_CLEAN" | "WATER_RINSE" | "RINSE" | "TAKE_APART";
  reason: string;
}

interface FamilyDefault {
  scenario: "same_family" | "adjacent_family" | "major_family_change" | "boldness_reversed";
  min_clean: "NO_CLEAN" | "WATER_RINSE" | "RINSE" | "TAKE_APART";
}

interface CleanDecisionRow {
  id: string;
  priority: number;
  condition_kind:
    | "has_always_ta_addin"
    | "same_recipe_back_to_back"
    | "same_conditional_ta_addin"
    | "same_base_fold_in_only"
    | "last_run_conditional_ta_chain"
    | "allergen_escalation"
    | "major_family_change"
    | "same_family_different_addin"
    | "default";
  clean_after: "NO_CLEAN" | "WATER_RINSE" | "RINSE" | "TAKE_APART" | "from_allergen_table";
  reason: string;
}

interface FortyFourQtRules {
  allow_vegan: boolean;
  allow_sorbet: boolean;
  allow_fold_ins: boolean;
  target_pct: number;   // 0-100
  max_pct: number;      // 0-100
}
```

**UI additions** to [src/app/rules/page.tsx](src/app/rules/page.tsx). Match existing visual style (accordion sections, click-to-edit cards/rows, `EditableInline`, `RuleList` patterns). Add **new structured sub-sections at the TOP of existing sections**, and retitle the existing prose rules underneath to *"Notes & nuance"*:

1. **Allergen Sequencing section** — add:
   - "Allergen Order" — drag-to-reorder list of allergen group names. New component `OrderedList` (or reuse existing patterns).
   - "Transition Overrides" — table of `AllergenTransition` rows. From dropdown, To dropdown, Clean level dropdown, Reason text. Click-to-edit row.
2. **Flavor & Base Sequencing section** — add:
   - "Base Boldness Order" — drag-to-reorder list.
   - "Family Transition Defaults" — table of 4 hardcoded scenarios with clean-level dropdowns.
3. **NEW section: "Cleaning Decision Table"** — between Allergen Sequencing and Optimization. Priority-ordered table of `CleanDecisionRow` rows. Drag to reorder priority. Click to edit.
4. **Optimization Rules section** — add:
   - "Active Strategies" — checkbox list of `optimization_flags` keyed by named strategy ID.
5. **44 QT Machine Assignment section** — add:
   - "Eligibility" — three checkboxes (`allow_vegan`, `allow_sorbet`, `allow_fold_ins`).
   - "Volume Targeting" — two numeric inputs (`target_pct`, `max_pct`).
6. **Recipe-Specific Notes section** — extend each card with an optional "Overrides" subsection (collapsed by default):
   - Force allergen group (dropdown of allergen_order values)
   - Force clean_after this recipe (dropdown)
   - Force machine (dropdown of machine names)
   - Note: this requires adding optional fields to `RecipeNote` type as well.

**Migration helper:** add a button on the Rules page labeled *"Seed structured defaults from prose"*. When clicked, POST to a new endpoint `/api/rules/seed-structured` that:
- Reads the current `ProductionRules`
- Sends the prose fields to Claude Haiku 4.5 with a system prompt asking to derive structured rows
- Returns parsed structured fields
- Client merges them into the rules object and the existing autosave persists them

Provide sensible hardcoded defaults too — if Claude is unavailable, the button can fall back to a static defaults function (we can derive them from the prose I've already seen in `backups/rules-2026-05-27.json`).

**Acceptance criteria for Stage 1:**
- [ ] `ProductionRules` interface extended with the 7 new optional fields
- [ ] Rules page renders new sub-sections in 5 existing sections + 1 new section
- [ ] Existing rules load and display normally (no crash if new fields are undefined)
- [ ] User can edit any new structured row and the autosave persists it (verified by reloading and seeing the value still there)
- [ ] `/api/rules/seed-structured` endpoint exists and works (with both Claude path and static fallback)
- [ ] Feature flag still routes to existing Claude generator (deterministic engine stub still throws — that's expected at this stage)
- [ ] No regression: running a generation with flag off behaves exactly as before
- [ ] Vercel build succeeds (TypeScript strict mode, no lint errors)

**Deliverable:** PR-ready commit(s) on `deterministic-engine` branch. Do not merge to master.

### Stage 2 — `decideCleanAfter(prev, curr, rules)` in code

Pure function over two consecutive runs + rules. Reads `cleaning_decision_table`, `allergen_transitions`, recipe `addIns[i].taTrigger`. Returns `{ clean_after, reason }`. Falls back to deterministic defaults when structured rules are absent.

Not yet implemented. Acceptance criteria TBD after Stage 1 lands and we can see real structured data.

### Stage 3 — `sequenceRuns(recipes, rules)` deterministic sequencer

After Stage 2. Solves the within-machine ordering problem: given a set of recipes assigned to a machine, produce the run order that minimizes take-aparts while respecting allergen partial order + base boldness order. With N ≤ ~15 per machine, exact branch-and-bound is tractable. Falls back to greedy heuristic if it ever isn't.

### Stage 4 — AI prose layer

Reduce `generateRunList` in `src/lib/claude.ts` to: take the finished run list from the deterministic engine and call Claude Haiku 4.5 *per machine* to write the `reason` for each run and the `footer_note`. Output is cosmetic — if it fails, fall back to stub strings ("base type X, addins Y").

### Stage 5 — Cutover

- Run both engines in parallel on production traffic for N requests
- Log mismatches in `clean_after`, sequence, totals
- When mismatches are explicable (and the deterministic answer is correct), flip default of `USE_DETERMINISTIC_ENGINE` to `true`
- Eventually remove the Claude generation path entirely; `applyFooterCorrections` retires with it

---

## How to pick this up

### From any new session

1. `git checkout deterministic-engine`
2. Read this file
3. Read `backups/rules-2026-05-27.json` to see the current rule state
4. Read [src/lib/rules-schema.ts](src/lib/rules-schema.ts) and [src/app/rules/page.tsx](src/app/rules/page.tsx) for the patterns to extend
5. Work on the next unchecked stage

### Working agreement

- **Commit and push after each meaningful change** (memory: post-push wait ~30s before live-test)
- **Don't merge to master without explicit user approval** — `master` is prod
- **Don't change behavior when `USE_DETERMINISTIC_ENGINE` is unset/false** — period
- **Don't touch the recipes parser**, the auth middleware, or the Supabase RLS without asking
- If a stage gets long, commit intermediate checkpoints with WIP-prefixed messages

### If you get stuck

- Confused about a rule's intent? Read the prose in `backups/rules-2026-05-27.json` first — the user spent real time writing it.
- Type error you can't resolve? Worktrees are fine to spin up: `git worktree add ../liks-stage-N deterministic-engine`
- Behavior unclear? Default to "match current Claude-based output" since that's what's deployed and accepted.

---

## Open questions for the user

1. **Allergen group names** — `assignMachines` uses lowercase keys like `"peanut"`, `"nut"`, `"plain"`. Should the new `allergen_order` use these exact keys, or richer display names? (Recommend: lowercase keys + a separate `allergen_display_names` map.)
2. **"Allergen escalation" condition** — when `cleaning_decision_table` rule matches `condition_kind: "allergen_escalation"`, the engine looks up the `allergen_transitions` table. Confirm this hybrid is OK vs flattening everything into one table.
3. **Migration of existing rules** — should the "Seed structured defaults" button auto-run on first load if structured fields are absent? Or require user click? (Recommend: user click — safer, no surprises.)

These can be deferred until Stage 1 implementation surfaces a concrete decision point.
