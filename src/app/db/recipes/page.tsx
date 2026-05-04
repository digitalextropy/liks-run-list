"use client";

import { useEffect, useState, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Types

interface IngredientOption {
  id: number;
  item_name: string;
  item_unit: string | null;
}

interface CompositionRow {
  ingredient_id: number;
  item_name: string;
  qty: string;
  unit: string;
}

interface ApiCompositionRow {
  ingredient_id: number;
  item_name: string;
  volume: string | null;
}

interface Recipe {
  id: number;
  name: string;
  sold_id: string | null;
  tagline: string | null;
  notes: string | null;
  label_text: string | null;
  label_type: string | null;
  active: boolean;
  bases: ApiCompositionRow[];
  addins: ApiCompositionRow[];
  foldins: ApiCompositionRow[];
  derived_ingredients: string;
  derived_allergens: string[];
}

const LABEL_TYPES = ["One Line", "Two Lines", "One Smaller Line"];


// ─────────────────────────────────────────────────────────────────────────
// Page

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Form state
  const [formName, setFormName] = useState("");
  const [formSoldId, setFormSoldId] = useState("");
  const [formTagline, setFormTagline] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLabelText, setFormLabelText] = useState("");
  const [formLabelType, setFormLabelType] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formBases, setFormBases] = useState<CompositionRow[]>([]);
  const [formAddins, setFormAddins] = useState<CompositionRow[]>([]);
  const [formFoldins, setFormFoldins] = useState<CompositionRow[]>([]);

  const [isNew, setIsNew] = useState(false);

  const fetchRecipes = useCallback(async (): Promise<Recipe[]> => {
    try {
      const res = await fetch("/api/db/recipes");
      const data = await res.json();
      const list = data.recipes || [];
      setRecipes(list);
      setLoading(false);
      return list;
    } catch {
      setMessage("Failed to load recipes");
      setLoading(false);
      return [];
    }
  }, []);

  const fetchIngredients = useCallback(async () => {
    try {
      const res = await fetch("/api/db/ingredients");
      const data = await res.json();
      setIngredients(
        (data.ingredients || [])
          .filter((i: { active: boolean }) => i.active)
          .map((i: { id: number; item_name: string; item_unit: string | null }) => ({
            id: i.id,
            item_name: i.item_name,
            item_unit: i.item_unit,
          }))
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchRecipes();
    fetchIngredients();
  }, [fetchRecipes, fetchIngredients]);

  function parseVolume(v: string | null | undefined, ingredientId: number): { qty: string; unit: string } {
    let qty = "";
    let unit = "";
    if (v) {
      const match = v.match(/^([\d./\s]+)\s*(.*)$/);
      if (match) {
        qty = match[1].trim();
        unit = match[2].trim();
      } else {
        qty = v;
      }
    }
    if (!unit && ingredientId) {
      const ing = ingredients.find((i) => i.id === ingredientId);
      if (ing?.item_unit) unit = ing.item_unit;
    }
    return { qty, unit };
  }

  function loadRecipeIntoForm(recipe: Recipe) {
    setSelected(recipe);
    setIsNew(false);
    setFormName(recipe.name);
    setFormSoldId(recipe.sold_id || "");
    setFormTagline(recipe.tagline || "");
    setFormNotes(recipe.notes || "");
    setFormLabelText(recipe.label_text || "");
    setFormLabelType(recipe.label_type || "");
    setFormActive(recipe.active);
    setFormBases(recipe.bases.map((b) => ({ ingredient_id: b.ingredient_id, item_name: b.item_name, ...parseVolume(b.volume, b.ingredient_id) })));
    setFormAddins(recipe.addins.map((a) => ({ ingredient_id: a.ingredient_id, item_name: a.item_name, ...parseVolume(a.volume, a.ingredient_id) })));
    setFormFoldins(recipe.foldins.map((f) => ({ ingredient_id: f.ingredient_id, item_name: f.item_name, ...parseVolume(f.volume, f.ingredient_id) })));
    setMessage("");
  }

  function startNew() {
    setSelected(null);
    setIsNew(true);
    setFormName("");
    setFormSoldId("");
    setFormTagline("");
    setFormNotes("");
    setFormLabelText("");
    setFormLabelType("");
    setFormActive(true);
    setFormBases([]);
    setFormAddins([]);
    setFormFoldins([]);
    setMessage("");
  }

  async function handleSave() {
    if (!formName.trim()) {
      setMessage("Name is required");
      return;
    }
    const allRows = [...formBases, ...formAddins, ...formFoldins].filter((r) => r.ingredient_id);
    const incomplete = allRows.find((r) => !r.qty.trim() || !r.unit);
    if (incomplete) {
      setMessage("Error: All ingredients must have both a qty and a unit selected");
      return;
    }
    setSaving(true);
    setMessage("");

    const payload = {
      name: formName,
      sold_id: formSoldId || null,
      tagline: formTagline || null,
      notes: formNotes || null,
      label_text: formLabelText || null,
      label_type: formLabelType || null,
      active: formActive,
      bases: formBases.filter((b) => b.ingredient_id).map((b) => ({ ingredient_id: b.ingredient_id, volume: [b.qty, b.unit].filter(Boolean).join(" ") || null })),
      addins: formAddins.filter((a) => a.ingredient_id).map((a) => ({ ingredient_id: a.ingredient_id, volume: [a.qty, a.unit].filter(Boolean).join(" ") || null })),
      foldins: formFoldins.filter((f) => f.ingredient_id).map((f) => ({ ingredient_id: f.ingredient_id, volume: [f.qty, f.unit].filter(Boolean).join(" ") || null })),
    };

    try {
      let res: Response;
      if (isNew) {
        res = await fetch("/api/db/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/db/recipes/${selected!.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        setMessage(isNew ? "Recipe created" : "Recipe saved");
        setFormBases(formBases.filter((b) => b.ingredient_id));
        setFormAddins(formAddins.filter((a) => a.ingredient_id));
        setFormFoldins(formFoldins.filter((f) => f.ingredient_id));
        if (isNew) {
          const data = await res.json();
          const updatedRecipes = await fetchRecipes();
          if (data.recipe) {
            const fullRecipe = updatedRecipes.find((r) => r.id === data.recipe.id);
            if (fullRecipe) {
              loadRecipeIntoForm(fullRecipe);
            }
          }
        } else {
          await fetchRecipes();
        }
      } else {
        const data = await res.json();
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setMessage(`Network error: ${String(err)}`);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm(`Deactivate "${selected.name}"?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/db/recipes/${selected.id}`, { method: "DELETE" });
      if (res.ok) {
        setMessage("Recipe deactivated");
        setSelected(null);
        setIsNew(false);
        await fetchRecipes();
      } else {
        const data = await res.json();
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setMessage(`Network error: ${String(err)}`);
    }
    setSaving(false);
  }


  // Derived fields from current form state
  const allFormIngredients = [...formBases, ...formAddins, ...formFoldins].filter((r) => r.ingredient_id);
  const derivedIngredientText = allFormIngredients
    .map((r) => {
      const ing = ingredients.find((i) => i.id === r.ingredient_id);
      return ing?.item_name || "";
    })
    .filter(Boolean)
    .join(", ");

  // Filter recipes for list
  const filtered = recipes.filter((r) => {
    if (!showInactive && !r.active) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || (r.tagline || "").toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading recipes...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* Left panel - recipe list */}
      <div className="w-80 shrink-0 flex flex-col border border-gray-200 rounded-xl bg-white overflow-hidden">
        <div className="p-3 border-b border-gray-200 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes..."
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={startNew}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 shrink-0"
            >
              + New
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((recipe) => (
            <div
              key={recipe.id}
              onClick={() => loadRecipeIntoForm(recipe)}
              className={`px-3 py-2.5 border-b border-gray-100 cursor-pointer hover:bg-indigo-50 transition-colors ${
                selected?.id === recipe.id && !isNew ? "bg-indigo-50 border-l-2 border-l-indigo-600" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-gray-900 truncate flex-1">
                  {recipe.name}
                </span>
                {recipe.active ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                    Inactive
                  </span>
                )}
              </div>
              {recipe.tagline && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{recipe.tagline}</p>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 p-4 text-center">No recipes found</p>
          )}
        </div>
      </div>

      {/* Right panel - edit form */}
      <div className="flex-1 border border-gray-200 rounded-xl bg-white overflow-y-auto">
        {!selected && !isNew ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">Select a recipe or create a new one</p>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {isNew ? "New Recipe" : `Edit: ${formName}`}
              </h2>
              <div className="flex items-center gap-2">
                {message && (
                  <span
                    className={`text-xs font-medium ${
                      message.startsWith("Error") || message.startsWith("Network")
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {message}
                  </span>
                )}
                {!isNew && selected && (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  >
                    Deactivate
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            {/* Basic fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Sold ID</label>
                <input
                  type="text"
                  value={formSoldId}
                  onChange={(e) => setFormSoldId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Tagline</label>
                <input
                  type="text"
                  value={formTagline}
                  onChange={(e) => setFormTagline(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Label Text</label>
                <textarea
                  value={formLabelText}
                  onChange={(e) => setFormLabelText(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Label Type</label>
                <select
                  value={formLabelType}
                  onChange={(e) => setFormLabelType(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">None</option>
                  {LABEL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Composition editor */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-800 border-b border-gray-200 pb-1">
                Ingredient Composition
              </h3>

              <CompositionSection
                title="Base Flavors"
                rows={formBases}
                onChange={setFormBases}
                ingredients={ingredients}

                color="indigo"
              />
              <CompositionSection
                title="Add-Ins"
                rows={formAddins}
                onChange={setFormAddins}
                ingredients={ingredients}

                color="violet"
              />
              <CompositionSection
                title="Fold-Ins"
                rows={formFoldins}
                onChange={setFormFoldins}
                ingredients={ingredients}

                color="fuchsia"
              />
            </div>

            {/* Derived fields */}
            <div className="space-y-3 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">Derived (Read-Only)</h3>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ingredients List</label>
                <p className="text-sm text-gray-700 min-h-[1.5rem]">
                  {derivedIngredientText || <span className="text-gray-400 italic">No ingredients linked</span>}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Allergens</label>
                <div className="flex flex-wrap gap-1.5">
                  {selected && !isNew && selected.derived_allergens.length > 0 ? (
                    selected.derived_allergens.map((a) => (
                      <span
                        key={a}
                        className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium"
                      >
                        {a}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400 italic">None</span>
                  )}
                </div>
              </div>
            </div>

            {/* Active checkbox at bottom */}
            <div className="pt-2 border-t border-gray-200">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
                Active
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Composition section component

function CompositionSection({
  title,
  rows,
  onChange,
  ingredients,
  unitOptions,
  color,
}: {
  title: string;
  rows: CompositionRow[];
  onChange: (rows: CompositionRow[]) => void;
  ingredients: IngredientOption[];
  color: "indigo" | "violet" | "fuchsia";
}) {
  const colorClasses = {
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-800",
    violet: "bg-violet-50 border-violet-200 text-violet-800",
    fuchsia: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800",
  };

  function addRow() {
    onChange([...rows, { ingredient_id: 0, item_name: "", qty: "", unit: "" }]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function updateRow(index: number, updates: Partial<CompositionRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...updates } : r)));
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${colorClasses[color]}`}>
          {title}
        </span>
        <button
          onClick={addRow}
          className="w-5 h-5 rounded bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 text-gray-500 flex items-center justify-center text-sm leading-none"
        >
          +
        </button>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-gray-400 italic ml-1">None</p>
      )}
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-5 text-right shrink-0">{i + 1}.</span>
            <IngredientPicker
              ingredients={ingredients}
              value={row.ingredient_id}
              displayName={row.item_name}
              onChange={(id, name) => {
                const ing = ingredients.find((ing) => ing.id === id);
                updateRow(i, { ingredient_id: id, item_name: name, unit: ing?.item_unit || "" });
              }}
            />
            <input
              type="text"
              value={row.qty}
              onChange={(e) => updateRow(i, { qty: e.target.value })}
              maxLength={6}
              placeholder="Qty"
              className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="w-24 px-2 py-1 border border-gray-200 rounded text-sm bg-gray-50 text-gray-700 truncate">
              {row.unit || <span className="text-gray-400">unit</span>}
            </span>
            <button
              onClick={() => removeRow(i)}
              className="text-gray-400 hover:text-red-600 text-lg leading-none px-1"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Searchable ingredient picker

function IngredientPicker({
  ingredients,
  value,
  displayName,
  onChange,
}: {
  ingredients: IngredientOption[];
  value: number;
  displayName: string;
  onChange: (id: number, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = ingredients.find((i) => i.id === value);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = query
    ? ingredients.filter((i) => i.item_name.toLowerCase().includes(query.toLowerCase())).slice(0, 20)
    : ingredients.slice(0, 20);

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setQuery("");
        }}
        className="w-full text-left px-2 py-1 border border-gray-300 rounded text-sm bg-white hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 truncate"
      >
        {selected ? selected.item_name : (value && displayName ? <span className="text-amber-700">{displayName} (inactive)</span> : <span className="text-gray-400">Select ingredient...</span>)}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden flex flex-col">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            autoFocus
            className="px-3 py-2 border-b border-gray-200 text-sm focus:outline-none"
          />
          <div className="overflow-y-auto flex-1">
            {filtered.map((ing) => (
              <button
                key={ing.id}
                type="button"
                onClick={() => {
                  onChange(ing.id, ing.item_name);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 ${
                  ing.id === value ? "bg-indigo-50 font-medium text-indigo-700" : "text-gray-700"
                }`}
              >
                {ing.item_name}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-gray-400 p-3">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
