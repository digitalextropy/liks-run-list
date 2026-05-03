"use client";

import { useEffect, useRef, useState } from "react";
import RunListTable from "@/components/RunListTable";
import type { Recipe, ValidationResult } from "@/lib/recipe-schema";
import type { RunListOutput } from "@/lib/claude";

const STORAGE_KEY = "liks-generate-state-v1";

interface PersistedState {
  input: string;
  machines: Record<string, boolean>;
  validated: ValidationResult[] | null;
  picks: Record<string, string>;
  runList: RunListOutput | null;
  pdfVerified: string[];
  warnings: string[];
}

function loadPersisted(): Partial<PersistedState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch {
    return {};
  }
}

function savePersisted(state: PersistedState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota or serialization error — ignore */
  }
}

function clearPersisted() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

interface ParsedRecipe {
  name: string;
  tubs: number;
}

const MACHINE_OPTIONS = ["Batch A", "Batch B", "44 QT"] as const;

const USE_AS_TYPED = "__USE_AS_TYPED__";

function parseInput(raw: string): { recipes: ParsedRecipe[]; errors: string[] } {
  const recipes: ParsedRecipe[] = [];
  const errors: string[] = [];

  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (i === 0 && /^recipe\b/i.test(line) && /tub/i.test(line)) continue;

    const parts = line.split(/\t|\s{2,}/).map((s) => s.trim()).filter(Boolean);
    let name: string;
    let tubsRaw: string;
    if (parts.length >= 2) {
      tubsRaw = parts[parts.length - 1];
      name = parts.slice(0, -1).join(" ");
    } else {
      const m = line.match(/^(.+?)\s+(\d+)$/);
      if (m) {
        name = m[1].trim();
        tubsRaw = m[2];
      } else {
        errors.push(`Line ${i + 1}: could not parse "${line}"`);
        continue;
      }
    }

    const tubs = parseInt(tubsRaw, 10);
    if (!name || isNaN(tubs) || tubs <= 0) {
      errors.push(`Line ${i + 1}: invalid recipe or tub count "${line}"`);
      continue;
    }
    recipes.push({ name, tubs });
  }
  return { recipes, errors };
}

function stubRecipe(name: string): Recipe {
  return {
    name,
    base: { type: "plain", ingredients: [] },
    addIns: [],
    foldIns: [],
    allergens: [],
    eligible44qt: true,
    notes: null,
  };
}

export default function GeneratePage() {
  const [input, setInput] = useState("");
  const [machines, setMachines] = useState<Record<(typeof MACHINE_OPTIONS)[number], boolean>>({
    "Batch A": true,
    "Batch B": true,
    "44 QT": true,
  });
  const [validated, setValidated] = useState<ValidationResult[] | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [runList, setRunList] = useState<RunListOutput | null>(null);
  const [tubAccounting, setTubAccounting] = useState<RunListOutput["_tubAccounting"] | null>(null);
  const [totalsCheck, setTotalsCheck] = useState<RunListOutput["_totalsCheck"] | null>(null);
  const [pdfVerified, setPdfVerified] = useState<Set<string>>(new Set());
  const [validating, setValidating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const hydrated = useRef(false);

  // Restore from sessionStorage on first mount.
  useEffect(() => {
    const persisted = loadPersisted();
    if (persisted.input !== undefined) setInput(persisted.input);
    if (persisted.machines) {
      setMachines({
        "Batch A": persisted.machines["Batch A"] ?? true,
        "Batch B": persisted.machines["Batch B"] ?? true,
        "44 QT": persisted.machines["44 QT"] ?? true,
      });
    }
    if (persisted.validated) setValidated(persisted.validated);
    if (persisted.picks) setPicks(persisted.picks);
    if (persisted.runList) setRunList(persisted.runList);
    if (persisted.pdfVerified) setPdfVerified(new Set(persisted.pdfVerified));
    if (persisted.warnings) setWarnings(persisted.warnings);
    hydrated.current = true;
  }, []);

  // Persist on any meaningful state change.
  useEffect(() => {
    if (!hydrated.current) return;
    savePersisted({
      input,
      machines,
      validated,
      picks,
      runList,
      pdfVerified: Array.from(pdfVerified),
      warnings,
    });
  }, [input, machines, validated, picks, runList, pdfVerified, warnings]);

  const parsed = parseInput(input);
  const totalTubs = parsed.recipes.reduce((sum, r) => sum + r.tubs, 0);
  const selectedMachines = MACHINE_OPTIONS.filter((m) => machines[m]);

  function reset() {
    setRunList(null);
    setValidated(null);
    setPicks({});
    setWarnings([]);
    setPdfVerified(new Set());
    setTubAccounting(null);
    setTotalsCheck(null);
    setError("");
    clearPersisted();
  }

  async function handleStart() {
    if (parsed.recipes.length === 0) {
      setError("Paste at least one recipe row");
      return;
    }
    if (selectedMachines.length === 0) {
      setError("Select at least one machine");
      return;
    }

    reset();
    setValidating(true);

    let results: ValidationResult[] | null = null;
    let lookupWarning: string | null = null;
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipes: parsed.recipes }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        results = data.results;
      } else {
        const detail = data?.error || data?.details || `status ${res.status}`;
        lookupWarning = `Recipe lookup unavailable (${detail}). Generating without PDF cross-check.`;
      }
    } catch (e) {
      lookupWarning = `Recipe lookup failed (${e instanceof Error ? e.message : String(e)}). Generating without PDF cross-check.`;
    }

    setValidating(false);

    if (lookupWarning) {
      setWarnings([lookupWarning]);
      await runGeneration(null, {});
      return;
    }

    if (!results) {
      setError("Validation returned no results");
      return;
    }

    setValidated(results);

    // Default picks: ambiguous → top suggestion if available; not_found w/ suggestions → first suggestion
    const defaultPicks: Record<string, string> = {};
    for (const r of results) {
      if (r.status === "ambiguous" && r.matchedRecipe) {
        defaultPicks[r.recipe] = r.matchedRecipe.name;
      } else if (r.status === "not_found") {
        defaultPicks[r.recipe] = r.suggestions?.[0] || USE_AS_TYPED;
      }
    }
    setPicks(defaultPicks);

    const needsReview = results.some(
      (r) => r.status === "ambiguous" || r.status === "not_found"
    );
    if (!needsReview) {
      await runGeneration(results, {});
    }
  }

  async function runGeneration(
    validationResults: ValidationResult[] | null,
    pickOverrides: Record<string, string>
  ) {
    setGenerating(true);
    setError("");

    // Build payload using validation + picks.
    const payload = parsed.recipes.map((r) => {
      const v = validationResults?.find(
        (x) => x.recipe.toLowerCase() === r.name.toLowerCase()
      );

      let recipe: Recipe;
      if (v?.status === "matched" && v.matchedRecipe) {
        recipe = v.matchedRecipe;
      } else {
        const pick = pickOverrides[r.name];
        if (pick && pick !== USE_AS_TYPED) {
          // Find the picked recipe in suggestions
          const fromSuggestions =
            v?.matchedRecipe?.name === pick ? v.matchedRecipe : null;
          recipe = fromSuggestions || stubRecipe(pick);
          // If we don't have full data for the pick, fetch once via /api/validate (single-name)
          // Skip this for simplicity — we'll lazy-fetch below.
        } else {
          recipe = stubRecipe(r.name);
        }
      }

      return { name: recipe.name, tubs: r.tubs, recipe, originalInput: r.name };
    });

    // For picks where we only have the name (not the Recipe data), look up in cache
    // by re-validating just those names.
    const namesToLookup = payload
      .filter((p) => p.recipe.base.ingredients.length === 0 && p.name !== p.originalInput)
      .map((p) => p.name);

    if (namesToLookup.length > 0) {
      try {
        const res = await fetch("/api/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipes: namesToLookup.map((n) => ({ name: n, tubs: 0 })),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const lookups = data.results as ValidationResult[];
          for (const p of payload) {
            const found = lookups.find(
              (l) => l.recipe.toLowerCase() === p.name.toLowerCase()
            );
            if (found?.matchedRecipe) {
              p.recipe = found.matchedRecipe;
            }
          }
        }
      } catch {
        /* fall through with stubs */
      }
    }

    const verified = new Set<string>();
    for (const p of payload) {
      if (p.recipe.base.ingredients.length > 0) {
        verified.add(p.recipe.name.toLowerCase());
      }
    }
    setPdfVerified(verified);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipes: payload.map((p) => ({
            name: p.name,
            tubs: p.tubs,
            recipe: p.recipe,
          })),
          machines: selectedMachines,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const parts = [data?.error, data?.details].filter(Boolean);
        setError(
          `Generation failed (${res.status}): ${parts.join(" — ") || "no detail"}`
        );
        return;
      }
      const tubWarnings: string[] = data?._tubWarnings ?? [];
      if (tubWarnings.length > 0) {
        setWarnings((prev) => [
          ...prev,
          ...tubWarnings.map((w: string) => `Tub count mismatch — ${w}`),
        ]);
      }
      setTubAccounting(data?._tubAccounting ?? null);
      setTotalsCheck(data?._totalsCheck ? { ...data._totalsCheck, retried: data._retried ?? false } : null);
      setRunList(data);
      setValidated(null); // hide picker once runlist is shown
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleConfirmPicks() {
    if (!validated) return;
    await runGeneration(validated, picks);
  }

  const loading = validating || generating;

  const ambiguousResults = validated?.filter(
    (r) => r.status === "ambiguous" || r.status === "not_found"
  ) ?? [];
  const exactMatches = validated?.filter((r) => r.status === "matched") ?? [];
  const showPicker = validated !== null && ambiguousResults.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Generate Run List</h1>
        <span className="text-sm text-gray-500">
          {parsed.recipes.length} recipes, {totalTubs} tubs
        </span>
      </div>

      {!runList && !showPicker && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-800">
                Paste recipes from Excel
              </label>
              <span className="text-xs text-gray-400">
                Format: <code className="bg-gray-100 px-1 rounded">Recipe⇥Tubs</code>
              </span>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={"Recipe\tTubs\nMoose Tracks\t8\nCookies & Cream\t16\nVanilla\t8"}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {parsed.errors.length > 0 && (
              <div className="mt-2 text-xs text-red-600 space-y-0.5">
                {parsed.errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-800 block mb-2">
              Use machines
            </label>
            <div className="flex gap-6">
              {MACHINE_OPTIONS.map((m) => (
                <label key={m} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={machines[m]}
                    onChange={(e) => setMachines({ ...machines, [m]: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">{m}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleStart}
              disabled={loading || parsed.recipes.length === 0}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium"
            >
              {validating
                ? "Validating..."
                : generating
                ? "Generating..."
                : "Generate Runlist"}
            </button>
          </div>
        </div>
      )}

      {showPicker && !runList && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Confirm recipe matches
            </h2>
            <p className="text-sm text-gray-500">
              Some names didn't exactly match the recipe PDF. Pick the right one for each so
              your run list uses accurate base, add-in, and allergen data.
            </p>
          </div>

          {exactMatches.length > 0 && (
            <details className="bg-green-50 border border-green-200 rounded p-2">
              <summary className="text-sm text-green-800 cursor-pointer font-medium">
                ✓ {exactMatches.length} exact match{exactMatches.length === 1 ? "" : "es"}
              </summary>
              <ul className="mt-2 text-xs text-green-700 space-y-0.5 pl-2">
                {exactMatches.map((m) => (
                  <li key={m.recipe}>{m.recipe}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="space-y-3">
            {ambiguousResults.map((r) => (
              <MatchPicker
                key={r.recipe}
                result={r}
                value={picks[r.recipe] || USE_AS_TYPED}
                onChange={(v) => setPicks({ ...picks, [r.recipe]: v })}
              />
            ))}
          </div>

          {error && (
            <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleConfirmPicks}
              disabled={loading}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium"
            >
              {generating ? "Generating..." : "Confirm & Generate"}
            </button>
            <button
              onClick={reset}
              className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {(validating || generating) && !runList && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">
            {validating ? "Looking up recipes..." : "Optimizing production sequence..."}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {validating
              ? "Matching your recipe names against the PDF."
              : "Chaining flavors, minimizing take-aparts..."}
          </p>
        </div>
      )}

      {runList && (
        <div className="space-y-4">
          {warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              {warnings.map((w, i) => (
                <p key={i} className="text-sm text-amber-800">⚠ {w}</p>
              ))}
            </div>
          )}
          <div className="flex justify-end print:hidden">
            <button
              onClick={reset}
              className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded hover:bg-indigo-100 transition-colors"
            >
              ← New Run List
            </button>
          </div>
          <RunListTable data={runList} pdfVerified={pdfVerified} />
          <TubAccountingPanel accounting={tubAccounting} totalsCheck={totalsCheck} />
        </div>
      )}
    </div>
  );
}

function TubAccountingPanel({
  accounting,
  totalsCheck,
}: {
  accounting: RunListOutput["_tubAccounting"] | null;
  totalsCheck: RunListOutput["_totalsCheck"] | null;
}) {
  const [open, setOpen] = useState(false);

  if (!accounting || !totalsCheck) return null;

  const hasMismatch = totalsCheck.requested !== totalsCheck.scheduled || accounting.some((a) => !a.ok);
  const defaultOpen = hasMismatch;

  // Use defaultOpen on mount
  const wasOpened = useRef(false);
  if (!wasOpened.current && defaultOpen) {
    wasOpened.current = true;
  }
  const isOpen = open || (defaultOpen && !wasOpened.current === false);

  return (
    <div className={`print:hidden rounded-lg border ${hasMismatch ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Tub Accounting</span>
          {hasMismatch ? (
            <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">
              ⚠ Mismatch detected
            </span>
          ) : (
            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
              ✓ All tubs accounted
            </span>
          )}
          <span className="text-xs text-gray-500">
            {totalsCheck.scheduled} / {totalsCheck.requested} tubs scheduled
            {totalsCheck.claudeReported !== totalsCheck.scheduled && (
              <span className="text-orange-600 ml-1">
                (Claude reported {totalsCheck.claudeReported})
              </span>
            )}
          </span>
          {totalsCheck.retried && (
            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              auto-corrected
            </span>
          )}
        </div>
        <span className={`text-gray-400 text-sm transition-transform ${open || defaultOpen ? "rotate-180" : ""}`}>▾</span>
      </button>

      {(open || defaultOpen) && (
        <div className="px-4 pb-3 space-y-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200">
                <th className="text-left py-1 font-medium">Recipe</th>
                <th className="text-right py-1 font-medium w-20">Requested</th>
                <th className="text-right py-1 font-medium w-20">Scheduled</th>
                <th className="text-right py-1 font-medium w-24">Status</th>
              </tr>
            </thead>
            <tbody>
              {accounting.map((a, i) => (
                <tr key={i} className={`border-b border-gray-100 last:border-0 ${!a.ok ? "bg-red-50" : ""}`}>
                  <td className="py-1 text-gray-800">
                    {a.name}
                    {a.matchedAs && (
                      <span className="text-gray-400 ml-1">(matched as "{a.matchedAs}")</span>
                    )}
                  </td>
                  <td className="py-1 text-right text-gray-600">{a.requested}</td>
                  <td className={`py-1 text-right font-semibold ${a.ok ? "text-green-700" : "text-red-600"}`}>
                    {a.scheduled}
                  </td>
                  <td className="py-1 text-right">
                    {a.ok ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-red-600 font-semibold">
                        {a.scheduled === 0 ? "NOT SCHEDULED" : `missing ${a.requested - a.scheduled}`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-semibold">
                <td className="py-1.5 text-gray-700">Total</td>
                <td className="py-1.5 text-right text-gray-700">{totalsCheck.requested}</td>
                <td className={`py-1.5 text-right ${totalsCheck.requested === totalsCheck.scheduled ? "text-green-700" : "text-red-600"}`}>
                  {totalsCheck.scheduled}
                </td>
                <td className="py-1.5 text-right">
                  {totalsCheck.requested === totalsCheck.scheduled ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-red-600 font-semibold">
                      {totalsCheck.requested - totalsCheck.scheduled} missing
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>

          {totalsCheck.allFlavorsSeen.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                Flavor names seen in run list ({totalsCheck.allFlavorsSeen.length})
              </summary>
              <div className="mt-1 flex flex-wrap gap-1">
                {totalsCheck.allFlavorsSeen.map((f, i) => (
                  <span key={i} className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">
                    {f}
                  </span>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function MatchPicker({
  result,
  value,
  onChange,
}: {
  result: ValidationResult;
  value: string;
  onChange: (v: string) => void;
}) {
  const suggestions = result.suggestions || [];

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
          You typed
        </span>
        <span className="font-semibold text-gray-900">{result.recipe}</span>
        <span className="text-xs text-gray-400 ml-auto">
          {result.tubs} tub{result.tubs === 1 ? "" : "s"}
        </span>
      </div>

      {suggestions.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 mb-1">Pick the correct match:</p>
          {suggestions.map((s) => (
            <label
              key={s}
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                value === s
                  ? "bg-indigo-50 border border-indigo-300"
                  : "border border-transparent hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                checked={value === s}
                onChange={() => onChange(s)}
                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-800">{s}</span>
            </label>
          ))}
          <label
            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
              value === USE_AS_TYPED
                ? "bg-amber-50 border border-amber-300"
                : "border border-transparent hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              checked={value === USE_AS_TYPED}
              onChange={() => onChange(USE_AS_TYPED)}
              className="w-4 h-4 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-gray-600 italic">
              Use "{result.recipe}" as-is (no PDF data)
            </span>
          </label>
        </div>
      ) : (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">
          No matches found in the PDF. The run list will use this name as-is without
          base/add-in/allergen data.
        </div>
      )}
    </div>
  );
}
