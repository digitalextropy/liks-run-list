"use client";

import { useEffect, useState, useCallback } from "react";

interface Ingredient {
  id: number;
  legacy_id: number | null;
  item_name: string;
  generic_name: string | null;
  item_cost: string | null;
  item_measurement: string | null;
  item_unit: string | null;
  item_unit_qty: number | null;
  active: boolean;
  ingredient_text: string | null;
  allergen_alcohol: boolean;
  allergen_corn_syrup: boolean;
  allergen_egg: boolean;
  allergen_milk: boolean;
  allergen_peanuts: boolean;
  allergen_soy: boolean;
  allergen_sulfites: boolean;
  allergen_tree_nuts: boolean;
  allergen_wheat: boolean;
  used_in_recipes: number;
}

const EMPTY_INGREDIENT: Omit<Ingredient, "id" | "legacy_id" | "used_in_recipes"> = {
  item_name: "",
  generic_name: "",
  item_cost: "",
  item_measurement: "",
  item_unit: "",
  item_unit_qty: null,
  active: true,
  ingredient_text: "",
  allergen_alcohol: false,
  allergen_corn_syrup: false,
  allergen_egg: false,
  allergen_milk: false,
  allergen_peanuts: false,
  allergen_soy: false,
  allergen_sulfites: false,
  allergen_tree_nuts: false,
  allergen_wheat: false,
};

const ALLERGEN_LABELS: Record<string, string> = {
  allergen_alcohol: "Alcohol",
  allergen_corn_syrup: "Corn Syrup",
  allergen_egg: "Egg",
  allergen_milk: "Milk",
  allergen_peanuts: "Peanuts",
  allergen_soy: "Soy",
  allergen_sulfites: "Sulfites",
  allergen_tree_nuts: "Tree Nuts",
  allergen_wheat: "Wheat",
};

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<Ingredient, "id" | "legacy_id" | "used_in_recipes">>(EMPTY_INGREDIENT);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchIngredients = useCallback(async () => {
    try {
      const res = await fetch("/api/db/ingredients");
      const data = await res.json();
      setIngredients(data.ingredients || []);
    } catch {
      setError("Failed to load ingredients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIngredients();
  }, [fetchIngredients]);

  const filteredIngredients = ingredients.filter((ing) => {
    const matchesSearch =
      ing.item_name.toLowerCase().includes(search.toLowerCase()) ||
      (ing.generic_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesFilter = showAll || ing.active;
    return matchesSearch && matchesFilter;
  });

  function selectIngredient(ing: Ingredient) {
    setSelectedId(ing.id);
    setIsNew(false);
    setConfirmDelete(false);
    setError(null);
    setSuccessMsg(null);
    setForm({
      item_name: ing.item_name,
      generic_name: ing.generic_name || "",
      item_cost: ing.item_cost || "",
      item_measurement: ing.item_measurement || "",
      item_unit: ing.item_unit || "",
      item_unit_qty: ing.item_unit_qty,
      active: ing.active,
      ingredient_text: ing.ingredient_text || "",
      allergen_alcohol: ing.allergen_alcohol,
      allergen_corn_syrup: ing.allergen_corn_syrup,
      allergen_egg: ing.allergen_egg,
      allergen_milk: ing.allergen_milk,
      allergen_peanuts: ing.allergen_peanuts,
      allergen_soy: ing.allergen_soy,
      allergen_sulfites: ing.allergen_sulfites,
      allergen_tree_nuts: ing.allergen_tree_nuts,
      allergen_wheat: ing.allergen_wheat,
    });
  }

  function startNew() {
    setSelectedId(null);
    setIsNew(true);
    setConfirmDelete(false);
    setError(null);
    setSuccessMsg(null);
    setForm({ ...EMPTY_INGREDIENT });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    const payload = {
      ...form,
      item_cost: form.item_cost ? parseFloat(form.item_cost as string) : null,
      item_unit_qty: form.item_unit_qty || null,
    };

    try {
      const url = isNew
        ? "/api/db/ingredients"
        : `/api/db/ingredients/${selectedId}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Save failed");
      } else {
        setSuccessMsg(isNew ? "Ingredient created" : "Ingredient updated");
        if (isNew) {
          setSelectedId(data.ingredient.id);
          setIsNew(false);
        }
        await fetchIngredients();
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/db/ingredients/${selectedId}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Delete failed");
        setConfirmDelete(false);
      } else {
        setSuccessMsg("Ingredient deactivated");
        setConfirmDelete(false);
        setSelectedId(null);
        setIsNew(false);
        setForm({ ...EMPTY_INGREDIENT });
        await fetchIngredients();
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function updateForm(field: string, value: string | boolean | number | null) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Left panel — ingredient list */}
      <div className="w-full lg:w-1/3 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-gray-800">Ingredients</h1>
          <button
            onClick={startNew}
            className="ml-auto px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
          >
            + New
          </button>
        </div>

        <input
          type="text"
          placeholder="Search ingredients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="rounded text-indigo-600 focus:ring-indigo-500"
          />
          Show inactive
        </label>

        {loading ? (
          <p className="text-sm text-gray-500 py-4">Loading...</p>
        ) : (
          <div className="border rounded-md overflow-y-auto max-h-[calc(100vh-280px)]">
            {filteredIngredients.length === 0 ? (
              <p className="text-sm text-gray-500 p-3">No ingredients found</p>
            ) : (
              filteredIngredients.map((ing) => (
                <button
                  key={ing.id}
                  onClick={() => selectIngredient(ing)}
                  className={`w-full text-left px-3 py-2 border-b last:border-b-0 text-sm transition-colors ${
                    selectedId === ing.id
                      ? "bg-indigo-50 border-l-4 border-l-indigo-500"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span className={!ing.active ? "text-gray-400 line-through" : "text-gray-800"}>
                    {ing.item_name}
                  </span>
                  {ing.used_in_recipes > 0 && (
                    <span className="ml-2 text-xs text-gray-400">
                      ({ing.used_in_recipes} recipe{ing.used_in_recipes !== 1 ? "s" : ""})
                    </span>
                  )}
                  {!ing.active && (
                    <span className="ml-2 text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
                      inactive
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right panel — edit form */}
      <div className="w-full lg:w-2/3">
        {!selectedId && !isNew ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Select an ingredient or click &quot;+ New&quot; to get started
          </div>
        ) : (
          <div className="border rounded-lg p-5 space-y-4 bg-white shadow-sm">
            <h2 className="text-lg font-medium text-gray-800">
              {isNew ? "New Ingredient" : "Edit Ingredient"}
            </h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded">
                {successMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  value={form.item_name}
                  onChange={(e) => updateForm("item_name", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Generic Name
                </label>
                <input
                  type="text"
                  value={form.generic_name || ""}
                  onChange={(e) => updateForm("generic_name", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cost
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.item_cost || ""}
                  onChange={(e) => updateForm("item_cost", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Measurement
                </label>
                <input
                  type="text"
                  value={form.item_measurement || ""}
                  onChange={(e) => updateForm("item_measurement", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit
                </label>
                <input
                  type="text"
                  value={form.item_unit || ""}
                  onChange={(e) => updateForm("item_unit", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit Qty
                </label>
                <input
                  type="number"
                  value={form.item_unit_qty ?? ""}
                  onChange={(e) =>
                    updateForm(
                      "item_unit_qty",
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active-check"
                  checked={form.active}
                  onChange={(e) => updateForm("active", e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="active-check" className="text-sm font-medium text-gray-700">
                  Active
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ingredient Text
                </label>
                <textarea
                  value={form.ingredient_text || ""}
                  onChange={(e) => updateForm("ingredient_text", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Allergens */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Allergens</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(ALLERGEN_LABELS).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={(form as Record<string, unknown>)[key] as boolean}
                      onChange={(e) => updateForm(key, e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 border-t">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : isNew ? "Create" : "Save"}
              </button>

              {!isNew && selectedId && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className={`px-4 py-2 text-sm rounded-md transition-colors ${
                    confirmDelete
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-white border border-red-300 text-red-600 hover:bg-red-50"
                  } disabled:opacity-50`}
                >
                  {confirmDelete ? "Confirm Delete" : "Delete"}
                </button>
              )}

              {confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
