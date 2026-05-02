"use client";

import { useEffect, useState } from "react";
import type { ProductionRules } from "@/lib/rules-schema";

export default function AdminRulesPage() {
  const [rules, setRules] = useState<ProductionRules | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => (r.ok ? r.json() : null))
      .then(setRules)
      .catch(() => {});
  }, []);

  async function handleSeed() {
    setSeeding(true);
    const res = await fetch("/api/rules/seed", { method: "POST" });
    if (res.ok) {
      setMessage("Rules seeded successfully!");
      const r = await fetch("/api/rules");
      setRules(await r.json());
    } else {
      setMessage("Seed failed");
    }
    setSeeding(false);
  }

  async function handleSave() {
    if (!rules) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      });
      setMessage(res.ok ? "Rules saved!" : "Save failed");
    } catch {
      setMessage("Save failed");
    }
    setSaving(false);
  }

  function updateTaTrigger(index: number, field: string, value: string) {
    if (!rules) return;
    const updated = { ...rules };
    updated.ta_triggers = [...updated.ta_triggers];
    updated.ta_triggers[index] = { ...updated.ta_triggers[index], [field]: value };
    setRules(updated);
  }

  function addTaTrigger() {
    if (!rules) return;
    setRules({
      ...rules,
      ta_triggers: [...rules.ta_triggers, { ingredient: "", category: "always" }],
    });
  }

  function removeTaTrigger(index: number) {
    if (!rules) return;
    setRules({
      ...rules,
      ta_triggers: rules.ta_triggers.filter((_, i) => i !== index),
    });
  }

  if (!rules) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900">Rules Management</h1>
        <p className="text-gray-500">No rules found in storage.</p>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {seeding ? "Seeding..." : "Seed Initial Rules"}
        </button>
        {message && <p className="text-sm text-green-600">{message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Edit Production Rules</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
        >
          {saving ? "Saving..." : "Save Rules"}
        </button>
      </div>
      {message && <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded">{message}</p>}

      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Take-Apart Triggers</h2>
        <div className="space-y-2">
          {rules.ta_triggers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={t.ingredient}
                onChange={(e) => updateTaTrigger(i, "ingredient", e.target.value)}
                className="flex-1 px-2 py-1.5 border rounded text-sm"
                placeholder="Ingredient name"
              />
              <select
                value={t.category}
                onChange={(e) => updateTaTrigger(i, "category", e.target.value)}
                className="px-2 py-1.5 border rounded text-sm"
              >
                <option value="always">Always</option>
                <option value="conditional">Conditional</option>
                <option value="never">Never</option>
              </select>
              <button onClick={() => removeTaTrigger(i)} className="text-red-400 hover:text-red-600">&times;</button>
            </div>
          ))}
          <button onClick={addTaTrigger} className="text-sm text-indigo-600 hover:text-indigo-800">
            + Add trigger
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Recipe-Specific Notes</h2>
        <div className="space-y-2">
          {rules.recipe_notes.map((n, i) => (
            <div key={i} className="border rounded p-3 space-y-1">
              <input
                value={n.recipe}
                onChange={(e) => {
                  const updated = { ...rules };
                  updated.recipe_notes = [...updated.recipe_notes];
                  updated.recipe_notes[i] = { ...n, recipe: e.target.value };
                  setRules(updated);
                }}
                className="w-full px-2 py-1 border rounded text-sm font-medium"
                placeholder="Recipe name"
              />
              <textarea
                value={n.note}
                onChange={(e) => {
                  const updated = { ...rules };
                  updated.recipe_notes = [...updated.recipe_notes];
                  updated.recipe_notes[i] = { ...n, note: e.target.value };
                  setRules(updated);
                }}
                className="w-full px-2 py-1 border rounded text-sm"
                rows={2}
                placeholder="Note"
              />
            </div>
          ))}
          <button
            onClick={() => setRules({ ...rules, recipe_notes: [...rules.recipe_notes, { recipe: "", note: "" }] })}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            + Add note
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Full Rules JSON</h2>
        <p className="text-xs text-gray-500 mb-2">Advanced: edit the raw JSON directly</p>
        <textarea
          value={JSON.stringify(rules, null, 2)}
          onChange={(e) => {
            try {
              setRules(JSON.parse(e.target.value));
            } catch { /* invalid json */ }
          }}
          className="w-full h-96 font-mono text-xs p-3 border rounded"
        />
      </div>
    </div>
  );
}
