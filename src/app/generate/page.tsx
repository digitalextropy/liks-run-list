"use client";

import { useState } from "react";
import RecipeInput from "@/components/RecipeInput";
import ValidationReport from "@/components/ValidationReport";
import RunListTable from "@/components/RunListTable";
import type { ValidationResult } from "@/lib/recipe-schema";
import type { RunListOutput } from "@/lib/claude";

interface RecipeEntry {
  id: string;
  name: string;
  tubs: number;
}

export default function GeneratePage() {
  const [recipes, setRecipes] = useState<RecipeEntry[]>([
    { id: crypto.randomUUID(), name: "", tubs: 8 },
  ]);
  const [validationResults, setValidationResults] = useState<ValidationResult[] | null>(null);
  const [runList, setRunList] = useState<RunListOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  function addRecipe() {
    setRecipes([...recipes, { id: crypto.randomUUID(), name: "", tubs: 8 }]);
  }

  function updateRecipe(id: string, field: "name" | "tubs", value: string | number) {
    setRecipes(recipes.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function removeRecipe(id: string) {
    if (recipes.length > 1) {
      setRecipes(recipes.filter((r) => r.id !== id));
    }
  }

  async function handleValidate() {
    const filledRecipes = recipes.filter((r) => r.name.trim());
    if (filledRecipes.length === 0) {
      setError("Add at least one recipe");
      return;
    }

    setLoading(true);
    setError("");
    setValidationResults(null);
    setRunList(null);

    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipes: filledRecipes.map((r) => ({ name: r.name, tubs: r.tubs })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Validation failed");
        return;
      }

      const data = await res.json();
      setValidationResults(data.results);
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!validationResults) return;

    const validRecipes = validationResults
      .filter((r) => r.status === "matched" || r.status === "ambiguous")
      .filter((r) => r.matchedRecipe);

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
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Generation failed");
        return;
      }

      const data = await res.json();
      setRunList(data);
    } catch {
      setError("Failed to generate run list");
    } finally {
      setGenerating(false);
    }
  }

  const allValid = validationResults?.every((r) => r.status === "matched" || r.status === "ambiguous");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Generate Run List</h1>
        <span className="text-sm text-gray-500">
          {recipes.filter((r) => r.name.trim()).length} recipes,{" "}
          {recipes.reduce((sum, r) => sum + (r.name.trim() ? r.tubs : 0), 0)} tubs
        </span>
      </div>

      {!runList && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-800">Recipes</h2>
            <button
              onClick={addRecipe}
              className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1 rounded hover:bg-indigo-100 transition-colors"
            >
              + Add Recipe
            </button>
          </div>

          {recipes.map((recipe, idx) => (
            <RecipeInput
              key={recipe.id}
              index={idx}
              name={recipe.name}
              tubs={recipe.tubs}
              onNameChange={(v) => updateRecipe(recipe.id, "name", v)}
              onTubsChange={(v) => updateRecipe(recipe.id, "tubs", v)}
              onRemove={() => removeRecipe(recipe.id)}
              canRemove={recipes.length > 1}
            />
          ))}

          {error && (
            <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleValidate}
              disabled={loading}
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
          <p className="text-sm text-gray-400 mt-1">Chaining flavors, minimizing take-aparts...</p>
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
                onClick={() => { setRunList(null); setValidationResults(null); }}
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
