"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

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

function Recipes2Inner() {
  const searchParams = useSearchParams();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("pricing");
  const [loading, setLoading] = useState(true);
  const [printAll, setPrintAll] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const deepLinked = useRef(false);

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

  useEffect(() => {
    if (deepLinked.current || recipes.length === 0) return;
    const idParam = searchParams.get("id");
    if (idParam) {
      const recipe = recipes.find((r) => r.id === Number(idParam));
      if (recipe) setSelected(recipe);
      deepLinked.current = true;
    }
  }, [recipes, searchParams]);

  const filtered = search
    ? recipes.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          (r.tagline || "").toLowerCase().includes(search.toLowerCase())
      )
    : recipes;

  function handlePrint() {
    setPrintAll(false);
    setTimeout(() => window.print(), 100);
  }

  function handlePrintAll() {
    setPrintAll(true);
    setTimeout(() => window.print(), 100);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading recipes...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] print:h-auto print:block">
      {/* Left panel - recipe list (hidden when printing) */}
      <div className="w-72 shrink-0 flex flex-col border-r border-gray-200 bg-white print:hidden">
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

      {/* Right panel - recipe card(s) */}
      <div className="flex-1 overflow-y-auto bg-gray-100 print:bg-white print:overflow-visible" ref={printRef}>
        {!selected ? (
          <div className="flex items-center justify-center h-full print:hidden">
            <p className="text-gray-400">Select a recipe to view</p>
          </div>
        ) : (
          <div className="p-6 print:p-0">
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
              <div className="ml-auto flex gap-2">
                <button
                  onClick={handlePrint}
                  className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Print
                </button>
                <button
                  onClick={handlePrintAll}
                  className="px-3 py-1 text-sm border border-indigo-600 text-indigo-600 rounded hover:bg-indigo-50"
                >
                  Print All
                </button>
              </div>
            </div>

            {/* Single selected recipe (visible on screen, and when printing single) */}
            <div className={printAll ? "print:hidden" : ""}>
              <RecipeCard recipe={selected} viewMode={viewMode} />
            </div>

            {/* All recipes (only visible when printing all) */}
            {printAll && (
              <div className="hidden print:block">
                {recipes.map((r, i) => (
                  <div key={r.id} className={i < recipes.length - 1 ? "break-after-page" : ""}>
                    <RecipeCard recipe={r} viewMode={viewMode} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Recipes2Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><p className="text-gray-500">Loading...</p></div>}>
      <Recipes2Inner />
    </Suspense>
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
      className="bg-white border-2 border-[#1B2A4A] max-w-[800px] mx-auto print:border-[1.5pt] print:max-w-none"
      style={{ fontFamily: "'Source Sans 3', sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b-2 border-[#1B2A4A] print:border-b-[1.5pt] print:px-5 print:py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/liks-logo-72.png" alt="Liks" className="w-[72px] h-[72px] shrink-0 print:w-[68px] print:h-[68px]" />
        <div className="flex-1 min-w-0">
          <div
            className="text-[1.8rem] font-bold text-[#1B2A4A] leading-tight print:text-[20pt]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {recipe.name}
          </div>
          {recipe.tagline && (
            <div
              className="text-[0.95rem] text-gray-500 mt-0.5 italic leading-snug print:text-[9pt]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {recipe.tagline}
            </div>
          )}
        </div>
        {showCosts && totalCost > 0 && (
          <div
            className="shrink-0 text-[1.4rem] font-bold text-[#1B2A4A] border-2 border-[#1B2A4A] px-3.5 py-1 rounded print:text-[14pt] print:border-[1.5pt]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {formatCost(totalCost)}
          </div>
        )}
      </div>

      {/* Body */}
      {showRecipe && (
        <div className="px-6 py-4 print:px-5 print:py-3">
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
            <div className="border-[1.5px] border-[#C9A96E] rounded mt-3.5 px-3.5 py-2.5 print:border-[1pt] print:mt-2.5">
              <div className="text-[0.75rem] uppercase tracking-widest font-bold text-[#C9A96E] mb-1 print:text-[7pt]">
                Notes
              </div>
              <p className="text-[0.92rem] text-gray-800 leading-snug whitespace-pre-line print:text-[9.5pt]">
                {recipe.notes}
              </p>
            </div>
          )}
        </div>
      )}


      {/* Footer */}
      <div className="border-t-[1.5px] border-gray-300 px-6 py-2.5 print:px-5 print:py-2">
        {recipe.derived_ingredients && (
          <>
            <div className="text-[0.7rem] uppercase tracking-wider font-bold text-[#1B2A4A] mb-0.5 print:text-[6.5pt]">
              Ingredients
            </div>
            <p className="text-[0.72rem] text-gray-500 leading-snug mb-1 print:text-[6.5pt]">
              {recipe.derived_ingredients}
            </p>
          </>
        )}
        <div className="text-[0.7rem] uppercase tracking-wider font-bold text-[#1B2A4A] mb-0.5 mt-1.5 print:text-[6.5pt]">
          Allergens
        </div>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {recipe.derived_allergens.length > 0 ? (
            recipe.derived_allergens.map((a) => (
              <span
                key={a}
                className="text-[0.68rem] text-[#1B2A4A] border-[1.5px] border-[#1B2A4A] px-2 py-0.5 rounded font-semibold print:text-[6.5pt] print:border-[1pt]"
              >
                {a}
              </span>
            ))
          ) : (
            <span className="text-[0.72rem] text-gray-400 italic">None</span>
          )}
        </div>
        <p className="text-[0.56rem] text-gray-400 leading-snug border-t border-gray-200 pt-1.5 mt-1 print:text-[5pt]">
          Ingredient and allergen information is compiled from supplier data and presented as a guide
          only. Liks reserves the right to change recipes without notification. Manufactured on
          equipment that processes alcohol, eggs, milk, peanuts, soybean, tree nuts, and wheat.
        </p>
        <p className="text-center text-[0.65rem] text-gray-400 mt-1 print:text-[5.5pt]">
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
      <div className="text-[0.85rem] uppercase tracking-[0.14em] font-bold text-[#1B2A4A] border-b-[1.5px] border-[#1B2A4A] pb-0.5 mt-3 mb-0.5 first:mt-0 print:text-[8.5pt] print:border-b-[1pt] print:mt-2.5">
        {title}
      </div>
      <div className="text-[0.78rem] text-gray-400 italic mb-1 leading-snug print:text-[7pt]">{instruction}</div>
      {items.length === 0 ? (
        <div className="text-[0.9rem] text-gray-400 italic py-0.5 print:text-[9pt]">&mdash; None &mdash;</div>
      ) : (
        items.map((item, i) => (
          <div
            key={i}
            className="flex items-baseline py-0.5 border-b border-dotted border-gray-300 last:border-b-0 gap-1.5"
          >
            <span className="w-20 font-semibold text-[1rem] text-[#1B2A4A] shrink-0 print:text-[10.5pt]">
              {item.volume || ""}
            </span>
            <span className="flex-1 text-[1rem] print:text-[10.5pt]">{item.item_name}</span>
            {showCosts && item.item_cost != null && (
              <span className="w-14 text-right text-[0.88rem] text-gray-500 font-medium shrink-0 print:text-[9pt]">
                {formatCost(item.item_cost)}
              </span>
            )}
          </div>
        ))
      )}
    </>
  );
}

