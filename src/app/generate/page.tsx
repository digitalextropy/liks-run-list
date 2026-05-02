"use client";

import { useState } from "react";
import ValidationReport from "@/components/ValidationReport";
import RunListTable from "@/components/RunListTable";
import type { ValidationResult } from "@/lib/recipe-schema";
import type { RunListOutput } from "@/lib/claude";

interface ParsedRecipe {
  name: string;
  tubs: number;
}

const MACHINE_OPTIONS = ["Batch A", "Batch B", "44 QT"] as const;

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

export default function GeneratePage() {
  const [input, setInput] = useState("");
  const [machines, setMachines] = useState<Record<(typeof MACHINE_OPTIONS)[number], boolean>>({
    "Batch A": true,
    "Batch B": true,
    "44 QT": true,
  });
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [validationResults, setValidationResults] = useState<ValidationResult[] | null>(null);
  const [runList, setRunList] = useState<RunListOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const parsed = parseInput(input);
  const totalTubs = parsed.recipes.reduce((sum, r) => sum + r.tubs, 0);
  const selectedMachines = MACHINE_OPTIONS.filter((m) => machines[m]);

  async function handleValidate() {
    if (parsed.recipes.length === 0) {
      setError("Paste at least one recipe row");
      return;
    }
    if (selectedMachines.length === 0) {
      setError("Select at least one machine");
      return;
    }

    setLoading(true);
    setError("");
    setParseErrors(parsed.errors);
    setValidationResults(null);
    setRunList(null);

    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipes: parsed.recipes }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          (data && data.error) ||
            `Validation failed (${res.status}). ${data?.details ? data.details : "No PDF uploaded yet? Go to Admin → Recipes to upload."}`
        );
        return;
      }
      setValidationResults(data.results);
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!validationResults) return;
    const validRecipes = validationResults
      .filter((r) => (r.status === "matched" || r.status === "ambiguous") && r.matchedRecipe);

    if (validRecipes.length === 0) {
      setError("No valid recipes to generate from");
      return;
    }

    setGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipes: validRecipes.map((r) => ({
            name: r.matchedRecipe!.name,
            tubs: r.tubs,
            recipe: r.matchedRecipe,
          })),
          machines: selectedMachines,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          (data && data.error) ||
            `Generation failed (${res.status})${data?.details ? `: ${data.details}` : ""}`
        );
        return;
      }
      setRunList(data);
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  const allValid =
    validationResults &&
    validationResults.every((r) => r.status === "matched" || r.status === "ambiguous");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Generate Run List</h1>
        <span className="text-sm text-gray-500">
          {parsed.recipes.length} recipes, {totalTubs} tubs
        </span>
      </div>

      {!runList && (
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
              onClick={handleValidate}
              disabled={loading || parsed.recipes.length === 0}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium"
            >
              {loading ? "Validating..." : "Validate Recipes"}
            </button>
          </div>
        </div>
      )}

      {validationResults && !runList && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Validation Results</h2>
          <ValidationReport results={validationResults} />
          {allValid && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
            >
              {generating ? "Generating run list..." : "Generate Run List"}
            </button>
          )}
        </div>
      )}

      {generating && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Optimizing production sequence...</p>
          <p className="text-sm text-gray-400 mt-1">
            Chaining flavors, minimizing take-aparts...
          </p>
        </div>
      )}

      {runList && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Run List</h2>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200 transition-colors"
              >
                Print
              </button>
              <button
                onClick={() => {
                  setRunList(null);
                  setValidationResults(null);
                }}
                className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded hover:bg-indigo-100 transition-colors"
              >
                New Run List
              </button>
            </div>
          </div>
          <RunListTable data={runList} />
        </div>
      )}
    </div>
  );
}
