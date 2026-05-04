"use client";

import { useEffect, useState, useCallback } from "react";

interface IngredientRow {
  ingredient_id: number;
  item_name: string;
  item_cost: number | null;
  volume: string | null;
}

interface Recipe {
  id: number;
  name: string;
  tagline: string | null;
  notes: string | null;
  active: boolean;
  bases: IngredientRow[];
  addins: IngredientRow[];
  foldins: IngredientRow[];
  derived_ingredients: string;
  derived_allergens: string[];
}

type ViewMode = "pricing" | "manufacturing" | "customer";

export default function Recipes2Page() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("pricing");
  const [loading, setLoading] = useState(true);

  const fetchRecipes = useCallback(async () => {
    try {
      const res = await fetch("/api/db/recipes");
      const data = await res.json();
      setRecipes((data.recipes || []).filter((r: Recipe) => r.active));
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  const filtered = search
    ? recipes.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          (r.tagline || "").toLowerCase().includes(search.toLowerCase())
      )
    : recipes;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading recipes...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left panel - recipe list */}
      <div className="w-72 shrink-0 flex flex-col border-r border-gray-200 bg-white">
        <div className="p-3 border-b border-gray-200">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes..."
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((recipe) => (
            <div
              key={recipe.id}
              onClick={() => setSelected(recipe)}
              className={`px-3 py-2 border-b border-gray-100 cursor-pointer hover:bg-indigo-50 transition-colors text-sm ${
                selected?.id === recipe.id
                  ? "bg-indigo-50 border-l-2 border-l-indigo-600 font-medium text-indigo-900"
                  : "text-gray-700"
              }`}
            >
              {recipe.name}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 p-4 text-center">No recipes found</p>
          )}
        </div>
      </div>

      {/* Right panel - recipe card */}
      <div className="flex-1 overflow-y-auto bg-gray-100">
        {!selected ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">Select a recipe to view</p>
          </div>
        ) : (
          <div className="p-6">
            {/* View mode radio buttons */}
            <div className="flex items-center gap-6 mb-4 bg-white rounded-lg px-4 py-2 border border-gray-200 print:hidden">
              {(["pricing", "manufacturing", "customer"] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="viewMode"
                    value={mode}
                    checked={viewMode === mode}
                    onChange={() => setViewMode(mode)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm font-medium text-gray-700 capitalize">{mode}</span>
                </label>
              ))}
              <button
                onClick={() => window.print()}
                className="ml-auto px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Print
              </button>
            </div>

            <RecipeCard recipe={selected} viewMode={viewMode} />
          </div>
        )}
      </div>
    </div>
  );
}

function formatCost(cost: number | string | null): string {
  if (cost == null) return "";
  const n = Number(cost);
  if (isNaN(n)) return "";
  return `$${n.toFixed(2)}`;
}

function RecipeCard({ recipe, viewMode }: { recipe: Recipe; viewMode: ViewMode }) {
  const showCosts = viewMode === "pricing";
  const showRecipe = viewMode !== "customer";

  const allIngredients = [...(recipe.bases || []), ...(recipe.addins || []), ...(recipe.foldins || [])];
  const totalCost = allIngredients.reduce((sum, ing) => sum + (Number(ing.item_cost) || 0), 0);

  return (
    <article
      className="bg-white border-2 border-[#1B2A4A] max-w-[800px] mx-auto"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b-2 border-[#1B2A4A]">
        <div className="w-[72px] h-[72px] shrink-0 bg-center bg-contain bg-no-repeat" style={{ backgroundImage: LOGO_DATA_URI }} />
        <div className="flex-1 min-w-0">
          <div
            className="text-[1.8rem] font-bold text-[#1B2A4A] leading-tight"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {recipe.name}
          </div>
          {recipe.tagline && (
            <div
              className="text-[0.95rem] text-gray-500 mt-0.5 italic leading-snug"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {recipe.tagline}
            </div>
          )}
        </div>
        {showCosts && totalCost > 0 && (
          <div
            className="shrink-0 text-[1.4rem] font-bold text-[#1B2A4A] border-2 border-[#1B2A4A] px-3.5 py-1 rounded"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {formatCost(totalCost)}
          </div>
        )}
      </div>

      {/* Body */}
      {showRecipe && (
        <div className="px-6 py-4">
          <IngredientSection
            title="Base Flavors"
            instruction="Pour into batch freezer before turning compressor on."
            items={recipe.bases}
            showCosts={showCosts}
          />
          <IngredientSection
            title="Add Ins"
            instruction="Pour into batch freezer halfway through the freezing stage."
            items={recipe.addins}
            showCosts={showCosts}
          />
          <IngredientSection
            title="Fold Ins"
            instruction="Fold in by hand after freezing using the 1/3 method."
            items={recipe.foldins}
            showCosts={showCosts}
          />

          {recipe.notes && (
            <div className="border-[1.5px] border-[#C9A96E] rounded mt-3.5 px-3.5 py-2.5">
              <div className="text-[0.75rem] uppercase tracking-widest font-bold text-[#C9A96E] mb-1">
                Notes
              </div>
              <p className="text-[0.92rem] text-gray-800 leading-snug whitespace-pre-line">
                {recipe.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Customer mode: just descriptions */}
      {!showRecipe && recipe.notes && (
        <div className="px-6 py-4">
          <div className="border-[1.5px] border-[#C9A96E] rounded px-3.5 py-2.5">
            <div className="text-[0.75rem] uppercase tracking-widest font-bold text-[#C9A96E] mb-1">
              Notes
            </div>
            <p className="text-[0.92rem] text-gray-800 leading-snug whitespace-pre-line">
              {recipe.notes}
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t-[1.5px] border-gray-300 px-6 py-2.5">
        {recipe.derived_ingredients && (
          <>
            <div className="text-[0.7rem] uppercase tracking-wider font-bold text-[#1B2A4A] mb-0.5">
              Ingredients
            </div>
            <p className="text-[0.72rem] text-gray-500 leading-snug mb-1">
              {recipe.derived_ingredients}
            </p>
          </>
        )}
        <div className="text-[0.7rem] uppercase tracking-wider font-bold text-[#1B2A4A] mb-0.5 mt-1.5">
          Allergens
        </div>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {recipe.derived_allergens.length > 0 ? (
            recipe.derived_allergens.map((a) => (
              <span
                key={a}
                className="text-[0.68rem] text-[#1B2A4A] border-[1.5px] border-[#1B2A4A] px-2 py-0.5 rounded font-semibold"
              >
                {a}
              </span>
            ))
          ) : (
            <span className="text-[0.72rem] text-gray-400 italic">None</span>
          )}
        </div>
        <p className="text-[0.56rem] text-gray-400 leading-snug border-t border-gray-200 pt-1.5 mt-1">
          Ingredient and allergen information is compiled from supplier data and presented as a guide
          only. Liks reserves the right to change recipes without notification. Manufactured on
          equipment that processes alcohol, eggs, milk, peanuts, soybean, tree nuts, and wheat.
        </p>
        <p className="text-center text-[0.65rem] text-gray-400 mt-1">
          Liks Ice Cream &#183; 2039 E 13th Ave., Denver, CO 80206 &#183; (303) 321-2370 &#183; www.liksicecream.com
        </p>
      </div>
    </article>
  );
}

function IngredientSection({
  title,
  instruction,
  items,
  showCosts,
}: {
  title: string;
  instruction: string;
  items: IngredientRow[];
  showCosts: boolean;
}) {
  return (
    <>
      <div className="text-[0.85rem] uppercase tracking-[0.14em] font-bold text-[#1B2A4A] border-b-[1.5px] border-[#1B2A4A] pb-0.5 mt-3 mb-0.5 first:mt-0">
        {title}
      </div>
      <div className="text-[0.78rem] text-gray-400 italic mb-1 leading-snug">{instruction}</div>
      {items.length === 0 ? (
        <div className="text-[0.9rem] text-gray-400 italic py-0.5">&mdash; None &mdash;</div>
      ) : (
        items.map((item, i) => (
          <div
            key={i}
            className="flex items-baseline py-0.5 border-b border-dotted border-gray-300 last:border-b-0 gap-1.5"
          >
            <span className="w-20 font-semibold text-[1rem] text-[#1B2A4A] shrink-0">
              {item.volume || ""}
            </span>
            <span className="flex-1 text-[1rem]">{item.item_name}</span>
            {showCosts && item.item_cost != null && (
              <span className="w-14 text-right text-[0.88rem] text-gray-500 font-medium shrink-0">
                {formatCost(item.item_cost)}
              </span>
            )}
          </div>
        ))
      )}
    </>
  );
}

const LOGO_DATA_URI = "url('data:image/png;base64,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')";
