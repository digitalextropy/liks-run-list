"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ProductionRules,
  Machine,
  CleaningTier,
  TATrigger,
  AllergenRule,
  SequencingRule,
  OptimizationRule,
  RecipeNote,
  DayStructure,
} from "@/lib/rules-schema";

type EditingKey = string | null;

type SaveState = "idle" | "saving" | "saved" | "error";

export default function AdminRulesPage() {
  const [rules, setRules] = useState<ProductionRules | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [editing, setEditing] = useState<EditingKey>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setRules(data);
        setSavedSnapshot(JSON.stringify(data));
      })
      .catch(() => {});
  }, []);

  // Debounced autosave whenever rules change
  useEffect(() => {
    if (!rules) return;
    const current = JSON.stringify(rules);
    if (current === savedSnapshot) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(current);
    }, 600);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules]);

  async function persist(snapshot: string) {
    if (inFlight.current) {
      // queue another save after the current one finishes
      saveTimer.current = setTimeout(() => persist(JSON.stringify(rules)), 200);
      return;
    }
    inFlight.current = true;
    setSaveState("saving");
    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: snapshot,
      });
      if (res.ok) {
        setSavedSnapshot(snapshot);
        setSaveState("saved");
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    } finally {
      inFlight.current = false;
    }
  }

  async function handleSeed() {
    setSeeding(true);
    const res = await fetch("/api/rules/seed", { method: "POST" });
    if (res.ok) {
      const r = await fetch("/api/rules");
      const data = await r.json();
      setRules(data);
      setSavedSnapshot(JSON.stringify(data));
      setSeedMessage("Rules seeded.");
    } else {
      setSeedMessage("Seed failed.");
    }
    setSeeding(false);
  }

  function update<K extends keyof ProductionRules>(key: K, value: ProductionRules[K]) {
    if (!rules) return;
    setRules({ ...rules, [key]: value });
  }

  if (!rules) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900">Edit Production Rules</h1>
        <p className="text-gray-500">No rules found in storage.</p>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {seeding ? "Seeding..." : "Seed Initial Rules"}
        </button>
        {seedMessage && <p className="text-sm text-green-600">{seedMessage}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Edit Production Rules</h1>
        <SaveIndicator state={saveState} />
      </div>

      {/* MACHINES */}
      <Section
        title="Machines"
        accent="#6366f1"
        onAdd={() =>
          update("machines", [
            ...rules.machines,
            { name: "New Machine", capacity_gallons: 10, tubs_per_run: 8, notes: "" },
          ])
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {rules.machines.map((m, i) => {
            const key = `machine-${i}`;
            const isEditing = editing === key;
            return (
              <EditableCard
                key={key}
                editing={isEditing}
                onClick={() => setEditing(key)}
                onDelete={() =>
                  update("machines", rules.machines.filter((_, idx) => idx !== i))
                }
                onClose={() => setEditing(null)}
              >
                {!isEditing ? (
                  <>
                    <h4 className="font-semibold text-sm">{m.name}</h4>
                    <p className="text-xs text-gray-500">
                      {m.capacity_gallons} gal / {m.tubs_per_run} tubs per run
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{m.notes}</p>
                  </>
                ) : (
                  <MachineForm
                    value={m}
                    onChange={(next) =>
                      update("machines", rules.machines.map((x, idx) => (idx === i ? next : x)))
                    }
                  />
                )}
              </EditableCard>
            );
          })}
        </div>
      </Section>

      {/* CLEANING TIERS */}
      <Section
        title="Cleaning Tiers"
        accent="#3b82f6"
        onAdd={() =>
          update("cleaning_tiers", [
            ...rules.cleaning_tiers,
            { name: "New Tier", level: "RINSE", description: "", duration_minutes: 0 },
          ])
        }
      >
        <div className="space-y-2">
          {rules.cleaning_tiers.map((t, i) => {
            const key = `tier-${i}`;
            const isEditing = editing === key;
            return (
              <EditableRow
                key={key}
                editing={isEditing}
                onClick={() => setEditing(key)}
                onDelete={() =>
                  update("cleaning_tiers", rules.cleaning_tiers.filter((_, idx) => idx !== i))
                }
                onClose={() => setEditing(null)}
              >
                {!isEditing ? (
                  <div className="flex items-start gap-3 text-sm flex-1">
                    <span
                      className={`font-mono text-xs px-2 py-0.5 rounded ${
                        t.level === "NO_CLEAN"
                          ? "bg-green-100 text-green-700"
                          : t.level === "WATER_RINSE"
                          ? "bg-blue-100 text-blue-700"
                          : t.level === "RINSE"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {t.name}
                    </span>
                    <span className="text-gray-600 flex-1">{t.description}</span>
                    <span className="text-gray-400 text-xs shrink-0">{t.duration_minutes} min</span>
                  </div>
                ) : (
                  <CleaningTierForm
                    value={t}
                    onChange={(next) =>
                      update(
                        "cleaning_tiers",
                        rules.cleaning_tiers.map((x, idx) => (idx === i ? next : x))
                      )
                    }
                  />
                )}
              </EditableRow>
            );
          })}
        </div>
      </Section>

      {/* TA TRIGGERS */}
      <Section
        title="Take-Apart Triggers"
        accent="#ef4444"
        onAdd={() =>
          update("ta_triggers", [
            ...rules.ta_triggers,
            { ingredient: "New Ingredient", category: "always" },
          ])
        }
      >
        <div className="space-y-1">
          {(["always", "conditional", "never"] as const).map((cat, ci) => (
            <div key={cat}>
              {ci > 0 && <div className="border-t my-2"></div>}
              {rules.ta_triggers
                .map((t, i) => ({ t, i }))
                .filter(({ t }) => t.category === cat)
                .map(({ t, i }) => {
                  const key = `ta-${i}`;
                  const isEditing = editing === key;
                  return (
                    <EditableRow
                      key={key}
                      editing={isEditing}
                      onClick={() => setEditing(key)}
                      onDelete={() =>
                        update("ta_triggers", rules.ta_triggers.filter((_, idx) => idx !== i))
                      }
                      onClose={() => setEditing(null)}
                      compact
                    >
                      {!isEditing ? (
                        <div className="flex items-center gap-2 text-sm flex-1">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              cat === "always"
                                ? "bg-red-500"
                                : cat === "conditional"
                                ? "bg-amber-500"
                                : "bg-green-500"
                            }`}
                          ></span>
                          <span
                            className={`font-medium ${
                              cat === "always"
                                ? "text-red-700"
                                : cat === "conditional"
                                ? "text-amber-700"
                                : "text-green-700"
                            }`}
                          >
                            {t.ingredient}
                          </span>
                          <span className="text-xs text-gray-500">
                            {cat === "always"
                              ? "Always TA"
                              : cat === "conditional"
                              ? t.condition
                              : "No TA needed"}
                          </span>
                        </div>
                      ) : (
                        <TATriggerForm
                          value={t}
                          onChange={(next) =>
                            update(
                              "ta_triggers",
                              rules.ta_triggers.map((x, idx) => (idx === i ? next : x))
                            )
                          }
                        />
                      )}
                    </EditableRow>
                  );
                })}
            </div>
          ))}
        </div>
      </Section>

      {/* ALLERGEN RULES */}
      <Section
        title="Allergen Sequencing"
        accent="#ef4444"
        onAdd={() =>
          update("allergen_rules", [
            ...rules.allergen_rules,
            { allergen: "New Allergen", rule: "", sequencing: "" },
          ])
        }
      >
        <div className="space-y-2">
          {rules.allergen_rules.map((r, i) => {
            const key = `allergen-${i}`;
            const isEditing = editing === key;
            return (
              <EditableCard
                key={key}
                editing={isEditing}
                onClick={() => setEditing(key)}
                onDelete={() =>
                  update("allergen_rules", rules.allergen_rules.filter((_, idx) => idx !== i))
                }
                onClose={() => setEditing(null)}
                cardClass="bg-red-50 border-red-200"
              >
                {!isEditing ? (
                  <>
                    <h4 className="font-semibold text-red-800 text-sm">{r.allergen}</h4>
                    <p className="text-xs text-red-700">{r.rule}</p>
                  </>
                ) : (
                  <AllergenForm
                    value={r}
                    onChange={(next) =>
                      update(
                        "allergen_rules",
                        rules.allergen_rules.map((x, idx) => (idx === i ? next : x))
                      )
                    }
                  />
                )}
              </EditableCard>
            );
          })}
        </div>
      </Section>

      {/* SEQUENCING */}
      <Section
        title="Flavor & Base Sequencing"
        accent="#a855f7"
        onAdd={() =>
          update("sequencing_rules", [
            ...rules.sequencing_rules,
            {
              category: "New",
              rule: "",
              priority: rules.sequencing_rules.length + 1,
            },
          ])
        }
      >
        {rules.sequencing_rules.map((r, i) => {
          const key = `seq-${i}`;
          const isEditing = editing === key;
          return (
            <EditableRow
              key={key}
              editing={isEditing}
              onClick={() => setEditing(key)}
              onDelete={() =>
                update("sequencing_rules", rules.sequencing_rules.filter((_, idx) => idx !== i))
              }
              onClose={() => setEditing(null)}
              compact
            >
              {!isEditing ? (
                <div className="flex items-start gap-2 text-sm flex-1">
                  <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded shrink-0">
                    {r.category}
                  </span>
                  <span className="text-gray-600">{r.rule}</span>
                </div>
              ) : (
                <SequencingForm
                  value={r}
                  onChange={(next) =>
                    update(
                      "sequencing_rules",
                      rules.sequencing_rules.map((x, idx) => (idx === i ? next : x))
                    )
                  }
                />
              )}
            </EditableRow>
          );
        })}
      </Section>

      {/* OPTIMIZATION */}
      <Section
        title="Optimization Rules"
        accent="#22c55e"
        onAdd={() =>
          update("optimization_rules", [
            ...rules.optimization_rules,
            { name: "New Rule", description: "", example: "" },
          ])
        }
      >
        {rules.optimization_rules.map((r, i) => {
          const key = `opt-${i}`;
          const isEditing = editing === key;
          return (
            <EditableRow
              key={key}
              editing={isEditing}
              onClick={() => setEditing(key)}
              onDelete={() =>
                update(
                  "optimization_rules",
                  rules.optimization_rules.filter((_, idx) => idx !== i)
                )
              }
              onClose={() => setEditing(null)}
            >
              {!isEditing ? (
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-green-800">{r.name}</h4>
                  <p className="text-xs text-gray-600">{r.description}</p>
                  {r.example && (
                    <p className="text-xs text-gray-400 italic mt-0.5">{r.example}</p>
                  )}
                </div>
              ) : (
                <OptimizationForm
                  value={r}
                  onChange={(next) =>
                    update(
                      "optimization_rules",
                      rules.optimization_rules.map((x, idx) => (idx === i ? next : x))
                    )
                  }
                />
              )}
            </EditableRow>
          );
        })}
      </Section>

      {/* 44 QT */}
      <Section
        title="44 QT Machine Rules"
        accent="#f59e0b"
        onAdd={() =>
          update("forty_four_qt_rules", {
            ...rules.forty_four_qt_rules,
            exceptions: [...rules.forty_four_qt_rules.exceptions, "New exception"],
          })
        }
        addLabel="exception"
      >
        <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-2">
          <EditableRow
            editing={editing === "44qt-rule"}
            onClick={() => setEditing("44qt-rule")}
            onClose={() => setEditing(null)}
            hideDelete
          >
            {editing !== "44qt-rule" ? (
              <p className="text-sm text-amber-800 font-medium flex-1">
                {rules.forty_four_qt_rules.rule}
              </p>
            ) : (
              <textarea
                value={rules.forty_four_qt_rules.rule}
                onChange={(e) =>
                  update("forty_four_qt_rules", {
                    ...rules.forty_four_qt_rules,
                    rule: e.target.value,
                  })
                }
                rows={3}
                className="w-full px-2 py-1 border rounded text-sm"
              />
            )}
          </EditableRow>
          <ul className="text-xs text-amber-700 space-y-1">
            {rules.forty_four_qt_rules.exceptions.map((e, i) => {
              const key = `44qt-ex-${i}`;
              const isEditing = editing === key;
              return (
                <EditableRow
                  key={key}
                  editing={isEditing}
                  onClick={() => setEditing(key)}
                  onDelete={() =>
                    update("forty_four_qt_rules", {
                      ...rules.forty_four_qt_rules,
                      exceptions: rules.forty_four_qt_rules.exceptions.filter(
                        (_, idx) => idx !== i
                      ),
                    })
                  }
                  onClose={() => setEditing(null)}
                  compact
                >
                  {!isEditing ? (
                    <span className="flex-1">• {e}</span>
                  ) : (
                    <input
                      value={e}
                      onChange={(ev) =>
                        update("forty_four_qt_rules", {
                          ...rules.forty_four_qt_rules,
                          exceptions: rules.forty_four_qt_rules.exceptions.map((x, idx) =>
                            idx === i ? ev.target.value : x
                          ),
                        })
                      }
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                  )}
                </EditableRow>
              );
            })}
          </ul>
        </div>
      </Section>

      {/* RECIPE NOTES */}
      <Section
        title="Recipe-Specific Notes"
        accent="#0ea5e9"
        onAdd={() =>
          update("recipe_notes", [
            ...rules.recipe_notes,
            { recipe: "New Recipe", note: "", override: "" },
          ])
        }
      >
        <div className="space-y-2">
          {rules.recipe_notes.map((n, i) => {
            const key = `note-${i}`;
            const isEditing = editing === key;
            return (
              <EditableCard
                key={key}
                editing={isEditing}
                onClick={() => setEditing(key)}
                onDelete={() =>
                  update("recipe_notes", rules.recipe_notes.filter((_, idx) => idx !== i))
                }
                onClose={() => setEditing(null)}
                cardClass="bg-sky-50 border-sky-200"
              >
                {!isEditing ? (
                  <>
                    <h4 className="font-semibold text-sky-800 text-sm">{n.recipe}</h4>
                    <p className="text-xs text-sky-700">{n.note}</p>
                    {n.override && (
                      <p className="text-xs text-sky-600 mt-0.5 italic">
                        Override: {n.override}
                      </p>
                    )}
                  </>
                ) : (
                  <RecipeNoteForm
                    value={n}
                    onChange={(next) =>
                      update(
                        "recipe_notes",
                        rules.recipe_notes.map((x, idx) => (idx === i ? next : x))
                      )
                    }
                  />
                )}
              </EditableCard>
            );
          })}
        </div>
      </Section>

      {/* DAY STRUCTURE */}
      <Section
        title="Day Structure"
        accent="#9ca3af"
        onAdd={() =>
          update("day_structure", [
            ...rules.day_structure,
            {
              phase: "New Phase",
              description: "",
              order: rules.day_structure.length + 1,
            },
          ])
        }
      >
        <div className="space-y-1">
          {rules.day_structure.map((d, i) => {
            const key = `day-${i}`;
            const isEditing = editing === key;
            return (
              <EditableRow
                key={key}
                editing={isEditing}
                onClick={() => setEditing(key)}
                onDelete={() =>
                  update("day_structure", rules.day_structure.filter((_, idx) => idx !== i))
                }
                onClose={() => setEditing(null)}
                compact
              >
                {!isEditing ? (
                  <div className="flex items-center gap-3 text-sm flex-1">
                    <span className="bg-gray-200 text-gray-700 text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold shrink-0">
                      {d.order}
                    </span>
                    <span className="font-medium text-gray-800">{d.phase}</span>
                    <span className="text-gray-500 text-xs">{d.description}</span>
                  </div>
                ) : (
                  <DayStructureForm
                    value={d}
                    onChange={(next) =>
                      update(
                        "day_structure",
                        rules.day_structure.map((x, idx) => (idx === i ? next : x))
                      )
                    }
                  />
                )}
              </EditableRow>
            );
          })}
        </div>
      </Section>

    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const styles = {
    saving: "text-gray-500",
    saved: "text-green-600",
    error: "text-red-600",
  } as const;
  const label = {
    saving: "Saving…",
    saved: "Saved",
    error: "Save failed",
  } as const;
  return (
    <span className={`text-xs font-medium ${styles[state]}`}>
      {state === "saving" && (
        <span className="inline-block w-2 h-2 mr-1.5 rounded-full bg-gray-400 animate-pulse"></span>
      )}
      {state === "saved" && <span className="mr-1">✓</span>}
      {label[state]}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper with + button on heading

function Section({
  title,
  accent,
  onAdd,
  addLabel,
  children,
}: {
  title: string;
  accent: string;
  onAdd?: () => void;
  addLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-white rounded-lg shadow p-5 border-l-4"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        {onAdd && (
          <button
            onClick={onAdd}
            title={`Add ${addLabel || "rule"}`}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 text-gray-500 flex items-center justify-center text-lg leading-none transition-colors"
          >
            +
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Editable row (single-line / horizontal)

function EditableRow({
  editing,
  onClick,
  onDelete,
  onClose,
  children,
  compact,
  hideDelete,
}: {
  editing: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onClose: () => void;
  children: React.ReactNode;
  compact?: boolean;
  hideDelete?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, editing, onClose);

  if (editing) {
    return (
      <div
        ref={ref}
        className={`group flex items-start gap-2 ${compact ? "py-1" : "py-2"} bg-indigo-50 -mx-2 px-2 rounded border border-indigo-200`}
      >
        <div className="flex-1">{children}</div>
      </div>
    );
  }
  return (
    <div
      className={`group flex items-start gap-2 ${compact ? "py-0.5" : "py-1"} -mx-2 px-2 rounded cursor-pointer hover:bg-gray-50`}
      onClick={onClick}
    >
      <div className="flex-1">{children}</div>
      {!hideDelete && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-lg leading-none px-1 shrink-0 transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  );
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onOutside: () => void
) {
  useEffect(() => {
    if (!active) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutside();
      }
    }
    // delay one tick so the click that opened the editor doesn't immediately close it
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [ref, active, onOutside]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Editable card (block / grid)

function EditableCard({
  editing,
  onClick,
  onDelete,
  onClose,
  children,
  cardClass,
}: {
  editing: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onClose: () => void;
  children: React.ReactNode;
  cardClass?: string;
}) {
  const base = cardClass || "bg-white border";
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, editing, onClose);

  if (editing) {
    return (
      <div ref={ref} className={`relative ${base} rounded-lg p-3 ring-2 ring-indigo-400`}>
        {children}
      </div>
    );
  }
  return (
    <div
      className={`group relative ${base} rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow`}
      onClick={onClick}
    >
      {children}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-lg leading-none w-5 h-5 flex items-center justify-center transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Field forms

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="text-gray-600 font-medium">{label}</span>
      {children}
    </label>
  );
}

function MachineForm({
  value,
  onChange,
}: {
  value: Machine;
  onChange: (v: Machine) => void;
}) {
  return (
    <div className="space-y-2">
      <Field label="Name">
        <input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="w-full px-2 py-1 border rounded text-sm mt-0.5"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Capacity (gal)">
          <input
            type="number"
            value={value.capacity_gallons}
            onChange={(e) =>
              onChange({ ...value, capacity_gallons: parseFloat(e.target.value) || 0 })
            }
            className="w-full px-2 py-1 border rounded text-sm mt-0.5"
          />
        </Field>
        <Field label="Tubs/run">
          <input
            type="number"
            value={value.tubs_per_run}
            onChange={(e) =>
              onChange({ ...value, tubs_per_run: parseInt(e.target.value) || 0 })
            }
            className="w-full px-2 py-1 border rounded text-sm mt-0.5"
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          rows={2}
          className="w-full px-2 py-1 border rounded text-xs mt-0.5"
        />
      </Field>
    </div>
  );
}

function CleaningTierForm({
  value,
  onChange,
}: {
  value: CleaningTier;
  onChange: (v: CleaningTier) => void;
}) {
  return (
    <div className="grid grid-cols-12 gap-2 flex-1">
      <input
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder="Name"
        className="col-span-3 px-2 py-1 border rounded text-sm"
      />
      <select
        value={value.level}
        onChange={(e) =>
          onChange({ ...value, level: e.target.value as CleaningTier["level"] })
        }
        className="col-span-3 px-2 py-1 border rounded text-sm"
      >
        <option value="NO_CLEAN">NO_CLEAN</option>
        <option value="WATER_RINSE">WATER_RINSE</option>
        <option value="RINSE">RINSE</option>
        <option value="TAKE_APART">TAKE_APART</option>
      </select>
      <input
        value={value.description}
        onChange={(e) => onChange({ ...value, description: e.target.value })}
        placeholder="Description"
        className="col-span-5 px-2 py-1 border rounded text-sm"
      />
      <input
        type="number"
        value={value.duration_minutes}
        onChange={(e) =>
          onChange({ ...value, duration_minutes: parseInt(e.target.value) || 0 })
        }
        placeholder="min"
        className="col-span-1 px-2 py-1 border rounded text-sm text-center"
      />
    </div>
  );
}

function TATriggerForm({
  value,
  onChange,
}: {
  value: TATrigger;
  onChange: (v: TATrigger) => void;
}) {
  return (
    <div className="flex gap-2 flex-1">
      <input
        value={value.ingredient}
        onChange={(e) => onChange({ ...value, ingredient: e.target.value })}
        placeholder="Ingredient"
        className="flex-1 px-2 py-1 border rounded text-sm"
      />
      <select
        value={value.category}
        onChange={(e) =>
          onChange({ ...value, category: e.target.value as TATrigger["category"] })
        }
        className="px-2 py-1 border rounded text-sm"
      >
        <option value="always">Always</option>
        <option value="conditional">Conditional</option>
        <option value="never">Never</option>
      </select>
      {value.category === "conditional" && (
        <input
          value={value.condition || ""}
          onChange={(e) => onChange({ ...value, condition: e.target.value })}
          placeholder="Condition"
          className="flex-1 px-2 py-1 border rounded text-sm"
        />
      )}
    </div>
  );
}

function AllergenForm({
  value,
  onChange,
}: {
  value: AllergenRule;
  onChange: (v: AllergenRule) => void;
}) {
  return (
    <div className="space-y-2">
      <Field label="Allergen">
        <input
          value={value.allergen}
          onChange={(e) => onChange({ ...value, allergen: e.target.value })}
          className="w-full px-2 py-1 border rounded text-sm mt-0.5"
        />
      </Field>
      <Field label="Rule">
        <textarea
          value={value.rule}
          onChange={(e) => onChange({ ...value, rule: e.target.value })}
          rows={2}
          className="w-full px-2 py-1 border rounded text-sm mt-0.5"
        />
      </Field>
      <Field label="Sequencing tag">
        <input
          value={value.sequencing}
          onChange={(e) => onChange({ ...value, sequencing: e.target.value })}
          className="w-full px-2 py-1 border rounded text-sm mt-0.5"
        />
      </Field>
    </div>
  );
}

function SequencingForm({
  value,
  onChange,
}: {
  value: SequencingRule;
  onChange: (v: SequencingRule) => void;
}) {
  return (
    <div className="grid grid-cols-12 gap-2 flex-1">
      <input
        value={value.category}
        onChange={(e) => onChange({ ...value, category: e.target.value })}
        placeholder="Category"
        className="col-span-3 px-2 py-1 border rounded text-sm"
      />
      <input
        value={value.rule}
        onChange={(e) => onChange({ ...value, rule: e.target.value })}
        placeholder="Rule"
        className="col-span-8 px-2 py-1 border rounded text-sm"
      />
      <input
        type="number"
        value={value.priority}
        onChange={(e) =>
          onChange({ ...value, priority: parseInt(e.target.value) || 0 })
        }
        placeholder="P"
        className="col-span-1 px-2 py-1 border rounded text-sm text-center"
      />
    </div>
  );
}

function OptimizationForm({
  value,
  onChange,
}: {
  value: OptimizationRule;
  onChange: (v: OptimizationRule) => void;
}) {
  return (
    <div className="space-y-2 flex-1">
      <Field label="Name">
        <input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="w-full px-2 py-1 border rounded text-sm mt-0.5"
        />
      </Field>
      <Field label="Description">
        <textarea
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          rows={2}
          className="w-full px-2 py-1 border rounded text-sm mt-0.5"
        />
      </Field>
      <Field label="Example (optional)">
        <input
          value={value.example || ""}
          onChange={(e) => onChange({ ...value, example: e.target.value })}
          className="w-full px-2 py-1 border rounded text-sm mt-0.5"
        />
      </Field>
    </div>
  );
}

function RecipeNoteForm({
  value,
  onChange,
}: {
  value: RecipeNote;
  onChange: (v: RecipeNote) => void;
}) {
  return (
    <div className="space-y-2">
      <Field label="Recipe">
        <input
          value={value.recipe}
          onChange={(e) => onChange({ ...value, recipe: e.target.value })}
          className="w-full px-2 py-1 border rounded text-sm mt-0.5"
        />
      </Field>
      <Field label="Note">
        <textarea
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          rows={2}
          className="w-full px-2 py-1 border rounded text-sm mt-0.5"
        />
      </Field>
      <Field label="Override (optional)">
        <input
          value={value.override || ""}
          onChange={(e) => onChange({ ...value, override: e.target.value })}
          className="w-full px-2 py-1 border rounded text-sm mt-0.5"
        />
      </Field>
    </div>
  );
}

function DayStructureForm({
  value,
  onChange,
}: {
  value: DayStructure;
  onChange: (v: DayStructure) => void;
}) {
  return (
    <div className="grid grid-cols-12 gap-2 flex-1">
      <input
        type="number"
        value={value.order}
        onChange={(e) => onChange({ ...value, order: parseInt(e.target.value) || 0 })}
        className="col-span-1 px-2 py-1 border rounded text-sm text-center"
      />
      <input
        value={value.phase}
        onChange={(e) => onChange({ ...value, phase: e.target.value })}
        placeholder="Phase"
        className="col-span-3 px-2 py-1 border rounded text-sm"
      />
      <input
        value={value.description}
        onChange={(e) => onChange({ ...value, description: e.target.value })}
        placeholder="Description"
        className="col-span-8 px-2 py-1 border rounded text-sm"
      />
    </div>
  );
}
