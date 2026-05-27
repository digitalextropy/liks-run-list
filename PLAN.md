# Deterministic Engine Refactor — Plan

**Branch:** `deterministic-engine`
**Status:** Stages 0 + 1 + 2 + 3 complete. Stage 4 next.
**Last updated:** 2026-05-27 (post-Stage-3)

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

### Stage 1 — Structured rule schema + Rules page UI ✓ DONE (commit `4c835b8`)

Shipped on `deterministic-engine` branch. Verified end-to-end on the preview deploy at `https://liks-run-list-git-deterministi-10e206-justins-projects-3e4f6a3c.vercel.app`:

- All 7 new optional `ProductionRules` fields are declared in [src/lib/rules-schema.ts](src/lib/rules-schema.ts)
- New types: `CleanLevel`, `AllergenTransition`, `FamilyTransitionDefault`, `FamilyTransitionScenario`, `CleanDecisionRow`, `CleanDecisionConditionKind`, `FortyFourQtRules`, `RecipeOverrides` + named-constant exports (`OPTIMIZATION_FLAG_KEYS`, `DEFAULT_*`)
- Rules page UI extended with structured sub-sections inside Allergen Sequencing, Flavor & Base Sequencing, Optimization Rules, 44 QT Machine Assignment + a NEW "Cleaning Decision Table" section + per-recipe Overrides in Recipe Notes
- `RecipeNote.overrides` optional field with force_allergen_group / force_clean_after / force_machine
- `POST /api/rules/seed-structured` returns sensible static defaults; client merges into rules state, existing autosave persists to Vercel Blob
- "Seed structured defaults" / "Reseed structured defaults" button at top of Rules page
- `/api/rules` GET `migrate()` updated to pass through the new fields (otherwise GET strips them and autosave wipes them)
- Local `next build` verified: 28/28 routes compile

**Side-quests landed during Stage 1:**
- Vercel preview deploys unblocked (commit `19909ca`): lazy-init `@vercel/postgres` pool to avoid module-load-time throw when `POSTGRES_URL` is unset
- Vercel env vars: `AUTH_PASSWORD`, `ANTHROPIC_API_KEY`, and Supabase integration env vars now scope to Preview environment too (done in Vercel dashboard, not in code)
- **master got a defensive cherry-pick** (commit `d729e27` on master): the same `migrate()` pass-through + lazy pool init, so prod's autosave doesn't wipe structured fields that the deterministic-engine branch seeds into the shared Vercel Blob

### Stage 2 — `decideCleanAfter(prev, curr, rules)` in code ✓ DONE (commit `c62e078`)

Pure function over two consecutive runs + rules. Replaces Claude's per-pair `clean_after` decision with a deterministic table-driven lookup.

**Signature:**
```ts
export function decideCleanAfter(
  prev: AssignedRecipe | null,   // null = first run on machine
  curr: AssignedRecipe,
  rules: ProductionRules
): { clean_after: CleanLevel; reason: string };
```

Lives in [src/lib/deterministic-engine.ts](src/lib/deterministic-engine.ts) alongside the existing stub. **Don't wire it into `/api/generate` yet** — keep the feature flag default off, the Claude flow unchanged. This stage delivers the function + unit tests + a debug endpoint to compare engine vs Claude output on a request-by-request basis.

**Algorithm** (evaluates `cleaning_decision_table` rows top-to-bottom; first match wins):

For each row in `rules.cleaning_decision_table` (or `buildStaticDefaults()` fallback):
- `has_always_ta_addin`: true if `curr.recipe.addIns.some(a => a.taTrigger === "always")`
- `same_recipe_back_to_back`: true if `prev?.name === curr.name`
- `same_conditional_ta_addin`: true if `prev` and `curr` share at least one conditional-TA add-in name (case-insensitive)
- `same_base_fold_in_only`: true if `prev?.recipe.base.type === curr.recipe.base.type` AND neither has any add-ins (only fold-ins, which don't enter the machine)
- `last_run_conditional_ta_chain`: true if `curr` has a conditional-TA add-in AND no upcoming run shares that add-in (this needs lookahead — sequence-aware; pass it in or have the caller mark `curr.isLastOfConditionalChain`)
- `allergen_escalation`: look up `(prev.family, curr.family)` in `allergen_transitions`. If found → return `{ clean_after: transition.required_clean, reason: transition.reason }`
- `major_family_change`: prev family and curr family are not adjacent in `allergen_order` AND not the same
- `same_family_different_addin`: same family but different add-in set
- `default`: matches everything (fallback)

When the matching row's `clean_after === "from_allergen_table"`: look up `(prev.family, curr.family)` in `rules.allergen_transitions`; if present use it, else fall back to `family_transition_defaults` and finally NO_CLEAN.

**Recipe overrides:** before evaluating the decision table, check `rules.recipe_notes` for a `RecipeNote` matching `curr.name` with `overrides.force_clean_after`. If set, short-circuit and return `{ clean_after: override, reason: "Force-set via recipe override" }`.

**Tests** (add `src/lib/deterministic-engine.test.ts` using Node's built-in `node:test` — no Jest dep needed, runs via `node --test`):

- always-TA add-in → TAKE_APART regardless of prev
- same recipe back-to-back → NO_CLEAN
- peanut → tree_nut transition → TAKE_APART per allergen_transitions
- same family different add-in → WATER_RINSE
- recipe override (force_clean_after = RINSE on Fluffernutter) → RINSE
- empty cleaning_decision_table → falls back to static defaults
- prev = null (first run on machine) → NO_CLEAN

**Debug endpoint** (no UI; useful for cutover verification): `POST /api/debug/decide-clean-after`. Body: `{ rules, prev, curr }`. Returns the function's result. Lets you sanity-check edge cases without spinning up a generation.

**Acceptance criteria for Stage 2:**
- [x] `decideCleanAfter` exported from `src/lib/deterministic-engine.ts`
- [x] All 7 test cases pass via `npx tsx --test src/lib/deterministic-engine.test.ts`
- [x] `/api/debug/decide-clean-after` POST endpoint works (29/29 routes in build)
- [x] Feature flag still defaults off — `/api/generate` still routes through Claude
- [x] `next build` succeeds locally (29 routes)
- [ ] No regression: live preview generation still produces correct run lists (verify after Vercel preview builds)

**Deliverable:** commit(s) on `deterministic-engine` branch. Do not merge to master, do not enable the flag.

### Stage 3 — `sequenceRuns(recipes, rules)` deterministic sequencer ✓ DONE (commit `d364813`)

Greedy nearest-neighbor algorithm that minimizes cleaning cost between consecutive runs. Respects allergen order (vegan first, nuts last), base boldness, and same-recipe chaining. Expands multi-run recipes, marks conditional-TA chain ends. `sequenceRunsWithCost()` returns sequence + total clean time breakdown.

**Acceptance criteria for Stage 3:**
- [x] `sequenceRuns` exported from `src/lib/deterministic-engine.ts`
- [x] All 13 unit tests pass (7 decideCleanAfter + 6 sequenceRuns)
- [x] `/api/debug/sequence-runs` POST endpoint works (30 routes in build)
- [x] `decideCleanAfter` + `sequenceRuns` composed: chained calls produce valid ordering
- [x] Feature flag still off; `/api/generate` unchanged
- [x] `next build` green (30/30 routes)

### Stage 4 — AI prose layer (NEXT)

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
