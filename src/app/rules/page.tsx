"use client";

import { useEffect, useState } from "react";
import type { ProductionRules } from "@/lib/rules-schema";

export default function RulesPage() {
  const [rules, setRules] = useState<ProductionRules | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => r.ok ? r.json() : Promise.reject("Not found"))
      .then(setRules)
      .catch(() => setError("Rules not loaded. Seed rules first via Admin."));
  }, []);

  if (error) return <p className="text-red-500">{error}</p>;
  if (!rules) return <p className="text-gray-500">Loading rules...</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">Production Rules</h1>

      <Section title="Machines" color="indigo">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {rules.machines.map((m) => (
            <div key={m.name} className="bg-white border rounded-lg p-3">
              <h4 className="font-semibold text-sm">{m.name}</h4>
              <p className="text-xs text-gray-500">{m.capacity_gallons} gal / {m.tubs_per_run} tubs per run</p>
              <p className="text-xs text-gray-400 mt-1">{m.notes}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Cleaning Tiers" color="blue">
        <div className="space-y-2">
          {rules.cleaning_tiers.map((t) => (
            <div key={t.level} className="flex items-start gap-3 text-sm">
              <span className={`font-mono text-xs px-2 py-0.5 rounded ${
                t.level === "NO_CLEAN" ? "bg-green-100 text-green-700" :
                t.level === "WATER_RINSE" ? "bg-blue-100 text-blue-700" :
                t.level === "RINSE" ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700"
              }`}>
                {t.name}
              </span>
              <span className="text-gray-600">{t.description}</span>
              <span className="text-gray-400 text-xs shrink-0">{t.duration_minutes} min</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Take-Apart Triggers" color="red">
        <div className="space-y-1">
          {rules.ta_triggers.filter(t => t.category === "always").map((t) => (
            <div key={t.ingredient} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 bg-red-500 rounded-full shrink-0"></span>
              <span className="font-medium text-red-700">{t.ingredient}</span>
              <span className="text-xs text-red-500">Always TA</span>
            </div>
          ))}
          <div className="border-t my-2"></div>
          {rules.ta_triggers.filter(t => t.category === "conditional").map((t) => (
            <div key={t.ingredient} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 bg-amber-500 rounded-full shrink-0"></span>
              <span className="font-medium text-amber-700">{t.ingredient}</span>
              <span className="text-xs text-gray-500">{t.condition}</span>
            </div>
          ))}
          <div className="border-t my-2"></div>
          {rules.ta_triggers.filter(t => t.category === "never").map((t) => (
            <div key={t.ingredient} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 bg-green-500 rounded-full shrink-0"></span>
              <span className="text-green-700">{t.ingredient}</span>
              <span className="text-xs text-green-500">No TA needed</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Allergen Sequencing" color="red">
        {rules.allergen_rules.map((r) => (
          <div key={r.allergen} className="bg-red-50 border border-red-200 rounded p-3 mb-2">
            <h4 className="font-semibold text-red-800 text-sm">{r.allergen}</h4>
            <p className="text-xs text-red-700">{r.rule}</p>
          </div>
        ))}
      </Section>

      <Section title="Flavor & Base Sequencing" color="purple">
        {rules.sequencing_rules.map((r) => (
          <div key={r.category} className="flex items-start gap-2 text-sm mb-1">
            <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded shrink-0">{r.category}</span>
            <span className="text-gray-600">{r.rule}</span>
          </div>
        ))}
      </Section>

      <Section title="Optimization Rules" color="green">
        {rules.optimization_rules.map((r) => (
          <div key={r.name} className="mb-3">
            <h4 className="font-semibold text-sm text-green-800">{r.name}</h4>
            <p className="text-xs text-gray-600">{r.description}</p>
            {r.example && <p className="text-xs text-gray-400 italic mt-0.5">{r.example}</p>}
          </div>
        ))}
      </Section>

      <Section title="44 QT Machine Rules" color="amber">
        <div className="bg-amber-50 border border-amber-200 rounded p-3">
          <p className="text-sm text-amber-800 font-medium">{rules.forty_four_qt_rules.rule}</p>
          <ul className="mt-2 text-xs text-amber-700 list-disc list-inside">
            {rules.forty_four_qt_rules.exceptions.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Day Structure" color="gray">
        <div className="space-y-1">
          {rules.day_structure.map((d) => (
            <div key={d.phase} className="flex items-center gap-3 text-sm">
              <span className="bg-gray-200 text-gray-700 text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold">
                {d.order}
              </span>
              <span className="font-medium text-gray-800">{d.phase}</span>
              <span className="text-gray-500 text-xs">{d.description}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const borderColor = `border-l-${color}-500`;
  return (
    <div className={`bg-white rounded-lg shadow p-5 border-l-4 ${borderColor}`} style={{ borderLeftColor: `var(--color-${color}-500, #6366f1)` }}>
      <h2 className="text-lg font-semibold text-gray-800 mb-3">{title}</h2>
      {children}
    </div>
  );
}
