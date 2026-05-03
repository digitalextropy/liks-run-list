"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ProductionRules,
  Machine,
  CleaningTier,
  TATrigger,
  Callout,
  CalloutType,
  RecipeNote,
  DayPhase,
} from "@/lib/rules-schema";

type EditingKey = string | null;
type SaveState = "idle" | "saving" | "saved" | "error";

export default function RulesPage() {
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
        <h1 className="text-2xl font-bold text-gray-900">Production Rules</h1>
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

  const editorCtx = { editing, setEditing, rules, update };

  return (
    <div className="max-w-4xl mx-auto px-2 space-y-7 pb-24">
      <div className="flex items-center justify-end -mb-3">
        <SaveIndicator state={saveState} />
      </div>

      {/* MACHINES */}
      <Section
        icon="⚙"
        iconColor="#1e40af"
        iconBg="#dbeafe"
        title="Machines"
        onAdd={() =>
          update("machines", [
            ...rules.machines,
            { name: "New Machine", capacity_gallons: 0, tubs_per_run: 0, rules: "", warnings: [] },
          ])
        }
        onAddCallout={() =>
          update("machines_callouts", [...rules.machines_callouts, { type: "info", text: "New callout" }])
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {rules.machines.map((m, i) => (
            <MachineCardEdit
              key={`m-${i}`}
              keyId={`m-${i}`}
              value={m}
              ctx={editorCtx}
              onChange={(next) =>
                update("machines", rules.machines.map((x, idx) => (idx === i ? next : x)))
              }
              onDelete={() =>
                update("machines", rules.machines.filter((_, idx) => idx !== i))
              }
            />
          ))}
        </div>
        <CalloutsList
          callouts={rules.machines_callouts}
          onChange={(next) => update("machines_callouts", next)}
          ctx={editorCtx}
          keyPrefix="m-callout"
        />
      </Section>

      {/* CLEANING TIERS */}
      <Section
        icon="🧼"
        iconColor="#16a34a"
        iconBg="#f0fdf4"
        title="Cleaning Tiers"
        onAdd={() =>
          update("cleaning_tiers", [
            ...rules.cleaning_tiers,
            { name: "New Tier", level: "RINSE", definition: "", description: "", duration_minutes: 0 },
          ])
        }
        onAddCallout={() =>
          update("cleaning_tiers_callouts", [...rules.cleaning_tiers_callouts, { type: "warning", text: "New callout" }])
        }
      >
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            <span className="col-span-2">Level</span>
            <span className="col-span-3">Definition</span>
            <span className="col-span-6">When to Use</span>
            <span className="col-span-1 text-right">Time</span>
          </div>
          {rules.cleaning_tiers.map((t, i) => (
            <CleaningTierRow
              key={`ct-${i}`}
              keyId={`ct-${i}`}
              value={t}
              ctx={editorCtx}
              onChange={(next) =>
                update(
                  "cleaning_tiers",
                  rules.cleaning_tiers.map((x, idx) => (idx === i ? next : x))
                )
              }
              onDelete={() =>
                update("cleaning_tiers", rules.cleaning_tiers.filter((_, idx) => idx !== i))
              }
            />
          ))}
        </div>
        <CalloutsList
          callouts={rules.cleaning_tiers_callouts}
          onChange={(next) => update("cleaning_tiers_callouts", next)}
          ctx={editorCtx}
          keyPrefix="ct-callout"
        />
      </Section>

      {/* TA TRIGGERS */}
      <Section
        icon="🔧"
        iconColor="#dc2626"
        iconBg="#fef2f2"
        title="Take-Apart Triggers"
        onAdd={() =>
          update("ta_triggers", [
            ...rules.ta_triggers,
            { name: "New Trigger", category: "always" },
          ])
        }
      >
        <CalloutsList
          callouts={rules.ta_triggers_callouts_top}
          onChange={(next) => update("ta_triggers_callouts_top", next)}
          ctx={editorCtx}
          keyPrefix="ta-callout-top"
          emptyAdd={() =>
            update("ta_triggers_callouts_top", [{ type: "critical", text: "New callout" }])
          }
        />

        <TriggerCategoryBlock
          title="Always Take Apart — these add-ins stick in the blades"
          color="red"
          category="always"
          ctx={editorCtx}
        />
        <TriggerCategoryBlock
          title="Conditional — skip TA if next run has similar heavy ingredients that mask it"
          color="amber"
          category="conditional"
          ctx={editorCtx}
        />
        <TriggerCategoryBlock
          title="Never triggers TA — fold-ins (done outside machine by hand)"
          color="green"
          category="never"
          ctx={editorCtx}
        />

        <div className="mt-4">
          <div className="inline-block px-2.5 py-1 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 mb-2">
            Dissolving Add-Ins — technically add-ins but leave no residue
          </div>
          <EditableInline
            keyId="ta-dissolving-intro"
            ctx={editorCtx}
            onDelete={undefined}
            view={
              <p className="text-[12.5px] text-gray-500 leading-relaxed mb-2">
                {rules.ta_triggers_dissolving_intro || (
                  <span className="italic text-gray-400">Click to add intro text…</span>
                )}
              </p>
            }
            edit={
              <textarea
                autoFocus
                value={rules.ta_triggers_dissolving_intro}
                onChange={(e) => update("ta_triggers_dissolving_intro", e.target.value)}
                rows={3}
                className="w-full px-2 py-1 border rounded text-sm"
              />
            }
          />
          <TriggerCategoryBlock
            title=""
            color="blue"
            category="dissolving"
            ctx={editorCtx}
            inline
          />
        </div>

        <CalloutsList
          callouts={rules.ta_triggers_callouts_bottom}
          onChange={(next) => update("ta_triggers_callouts_bottom", next)}
          ctx={editorCtx}
          keyPrefix="ta-callout-bot"
          emptyAdd={() =>
            update("ta_triggers_callouts_bottom", [{ type: "info", text: "New callout" }])
          }
        />
      </Section>

      {/* ALLERGENS */}
      <Section
        icon="⚕"
        iconColor="#7c3aed"
        iconBg="#f5f3ff"
        title="Allergen Sequencing"
        onAdd={() => update("allergen_rules", [...rules.allergen_rules, "New rule"])}
        onAddCallout={() =>
          update("allergen_rules_callouts", [...rules.allergen_rules_callouts, { type: "info", text: "New callout" }])
        }
      >
        <RuleList
          items={rules.allergen_rules}
          ctx={editorCtx}
          keyPrefix="al"
          onChange={(next) => update("allergen_rules", next)}
        />
        <CalloutsList
          callouts={rules.allergen_rules_callouts}
          onChange={(next) => update("allergen_rules_callouts", next)}
          ctx={editorCtx}
          keyPrefix="al-callout"
        />
      </Section>

      {/* SEQUENCING */}
      <Section
        icon="🎨"
        iconColor="#1d4ed8"
        iconBg="#eff6ff"
        title="Flavor & Base Sequencing"
        onAdd={() => update("sequencing_rules", [...rules.sequencing_rules, "New rule"])}
      >
        <RuleList
          items={rules.sequencing_rules}
          ctx={editorCtx}
          keyPrefix="sq"
          onChange={(next) => update("sequencing_rules", next)}
        />
      </Section>

      {/* OPTIMIZATION */}
      <Section
        icon="⚡"
        iconColor="#d97706"
        iconBg="#fffbeb"
        title="Optimization Rules"
        onAdd={() => update("optimization_rules", [...rules.optimization_rules, "New rule"])}
      >
        <RuleList
          items={rules.optimization_rules}
          ctx={editorCtx}
          keyPrefix="op"
          onChange={(next) => update("optimization_rules", next)}
        />
      </Section>

      {/* 44 QT */}
      <Section
        icon="🏭"
        iconColor="#16a34a"
        iconBg="#f0fdf4"
        title="44 QT Machine Assignment"
        onAddCallout={() =>
          update("forty_four_qt_callouts", [...rules.forty_four_qt_callouts, { type: "info", text: "New callout" }])
        }
      >
        <EditableInline
          keyId="44qt-rule"
          ctx={editorCtx}
          view={
            <p className="text-[13px] text-gray-800 leading-relaxed">
              {rules.forty_four_qt_rule || (
                <span className="italic text-gray-400">Click to add the rule…</span>
              )}
            </p>
          }
          edit={
            <textarea
              autoFocus
              value={rules.forty_four_qt_rule}
              onChange={(e) => update("forty_four_qt_rule", e.target.value)}
              rows={3}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          }
        />
        <CalloutsList
          callouts={rules.forty_four_qt_callouts}
          onChange={(next) => update("forty_four_qt_callouts", next)}
          ctx={editorCtx}
          keyPrefix="44qt-callout"
        />
      </Section>

      {/* RECIPE NOTES */}
      <Section
        icon="📋"
        iconColor="#92400e"
        iconBg="#fef3c7"
        title="Recipe-Specific Notes"
        onAdd={() =>
          update("recipe_notes", [
            ...rules.recipe_notes,
            { recipe: "New Recipe", note: "" },
          ])
        }
      >
        <div className="space-y-2">
          {rules.recipe_notes.map((n, i) => (
            <RecipeNoteCard
              key={`rn-${i}`}
              keyId={`rn-${i}`}
              value={n}
              ctx={editorCtx}
              onChange={(next) =>
                update(
                  "recipe_notes",
                  rules.recipe_notes.map((x, idx) => (idx === i ? next : x))
                )
              }
              onDelete={() =>
                update("recipe_notes", rules.recipe_notes.filter((_, idx) => idx !== i))
              }
            />
          ))}
        </div>
      </Section>

      {/* DAY STRUCTURE */}
      <Section
        icon="📅"
        iconColor="#1e3a5f"
        iconBg="#f0f4f8"
        title="Day Structure Template"
        onAdd={() =>
          update("day_structure", [
            ...rules.day_structure,
            { order: rules.day_structure.length + 1, phase: "New Phase", description: "" },
          ])
        }
      >
        <div className="divide-y divide-gray-100">
          {rules.day_structure.map((d, i) => (
            <DayPhaseRow
              key={`day-${i}`}
              keyId={`day-${i}`}
              value={d}
              ctx={editorCtx}
              onChange={(next) =>
                update(
                  "day_structure",
                  rules.day_structure.map((x, idx) => (idx === i ? next : x))
                )
              }
              onDelete={() =>
                update("day_structure", rules.day_structure.filter((_, idx) => idx !== i))
              }
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Editor context type

interface EditorCtx {
  editing: EditingKey;
  setEditing: (k: EditingKey) => void;
  rules: ProductionRules;
  update: <K extends keyof ProductionRules>(key: K, value: ProductionRules[K]) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// Section wrapper

function Section({
  icon,
  iconColor,
  iconBg,
  title,
  onAdd,
  onAddCallout,
  children,
}: {
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  onAdd?: () => void;
  onAddCallout?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-2.5 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors select-none"
        onClick={() => setOpen(!open)}
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <h2 className="text-[15px] font-semibold text-gray-900 flex-1">{title}</h2>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {onAddCallout && (
            <button
              onClick={onAddCallout}
              title="Add callout"
              className="text-[10px] uppercase tracking-wider px-2 py-1 rounded text-gray-500 hover:bg-gray-100"
            >
              + callout
            </button>
          )}
          {onAdd && (
            <button
              onClick={onAdd}
              title="Add"
              className="w-7 h-7 rounded-md bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 text-gray-500 flex items-center justify-center text-base leading-none transition-colors"
            >
              +
            </button>
          )}
          <span
            className={`text-gray-400 text-lg transition-transform ${open ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </div>
      </div>
      {open && <div className="px-5 pb-5 space-y-3">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// useClickOutside hook

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
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [ref, active, onOutside]);
}

// ─────────────────────────────────────────────────────────────────────────
// Generic editable wrappers

function EditableInline({
  keyId,
  ctx,
  view,
  edit,
  onDelete,
  className = "",
}: {
  keyId: string;
  ctx: EditorCtx;
  view: React.ReactNode;
  edit: React.ReactNode;
  onDelete?: () => void;
  className?: string;
}) {
  const isEditing = ctx.editing === keyId;
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, isEditing, () => ctx.setEditing(null));

  if (isEditing) {
    return (
      <div ref={ref} className={`bg-indigo-50 -mx-2 px-2 py-1.5 rounded border border-indigo-200 ${className}`}>
        {edit}
      </div>
    );
  }
  return (
    <div
      className={`group relative -mx-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-50 ${className}`}
      onClick={() => ctx.setEditing(keyId)}
    >
      {view}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-base leading-none w-5 h-5 flex items-center justify-center transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Machine card

function MachineCardEdit({
  keyId,
  value,
  ctx,
  onChange,
  onDelete,
}: {
  keyId: string;
  value: Machine;
  ctx: EditorCtx;
  onChange: (v: Machine) => void;
  onDelete: () => void;
}) {
  const isEditing = ctx.editing === keyId;
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, isEditing, () => ctx.setEditing(null));

  const cardStyle = value.highlight
    ? "border-amber-200 bg-amber-50"
    : "border-gray-200 bg-gray-50";

  if (isEditing) {
    return (
      <div ref={ref} className={`border-2 border-indigo-400 rounded-lg p-3 bg-white space-y-2`}>
        <input
          autoFocus
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Name"
          className="w-full px-2 py-1 border rounded text-sm font-semibold"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs">
            <span className="text-gray-600">Capacity (gal)</span>
            <input
              type="number"
              value={value.capacity_gallons}
              onChange={(e) =>
                onChange({ ...value, capacity_gallons: parseFloat(e.target.value) || 0 })
              }
              className="w-full px-2 py-1 border rounded text-sm mt-0.5"
            />
          </label>
          <label className="block text-xs">
            <span className="text-gray-600">Tubs/run</span>
            <input
              type="number"
              value={value.tubs_per_run}
              onChange={(e) =>
                onChange({ ...value, tubs_per_run: parseInt(e.target.value) || 0 })
              }
              className="w-full px-2 py-1 border rounded text-sm mt-0.5"
            />
          </label>
        </div>
        <textarea
          value={value.rules}
          onChange={(e) => onChange({ ...value, rules: e.target.value })}
          placeholder="Rules"
          rows={2}
          className="w-full px-2 py-1 border rounded text-xs"
        />
        <div>
          <p className="text-xs text-gray-600 font-medium mb-1">Warnings (red)</p>
          {value.warnings.map((w, i) => (
            <div key={i} className="flex gap-1 mb-1">
              <input
                value={w}
                onChange={(e) =>
                  onChange({
                    ...value,
                    warnings: value.warnings.map((x, idx) => (idx === i ? e.target.value : x)),
                  })
                }
                className="flex-1 px-2 py-1 border rounded text-xs"
              />
              <button
                onClick={() =>
                  onChange({
                    ...value,
                    warnings: value.warnings.filter((_, idx) => idx !== i),
                  })
                }
                className="text-red-400 hover:text-red-600 px-1"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => onChange({ ...value, warnings: [...value.warnings, ""] })}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            + warning
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={value.highlight ?? false}
            onChange={(e) => onChange({ ...value, highlight: e.target.checked })}
          />
          <span>Highlight (amber background)</span>
        </label>
      </div>
    );
  }

  return (
    <div
      className={`group relative border ${cardStyle} rounded-lg p-3.5 cursor-pointer hover:shadow-sm transition-shadow`}
      onClick={() => ctx.setEditing(keyId)}
    >
      <div className="font-semibold text-[14px] mb-0.5">{value.name}</div>
      <div className="text-xs text-gray-500 mb-2">
        {value.capacity_gallons} gallons / {value.tubs_per_run} tubs per run
      </div>
      <div className="text-xs text-gray-700 leading-relaxed">
        {value.rules}
        {value.warnings.length > 0 && (
          <>
            {value.rules && <br />}
            {value.warnings.map((w, i) => (
              <div key={i} className="text-red-600 font-semibold mt-0.5">
                {w}
              </div>
            ))}
          </>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-base leading-none w-5 h-5 flex items-center justify-center transition-opacity"
      >
        ×
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Cleaning tier row

const TIER_COLOR: Record<CleaningTier["level"], string> = {
  NO_CLEAN: "text-green-600",
  WATER_RINSE: "text-blue-700",
  RINSE: "text-amber-600",
  TAKE_APART: "text-red-600",
};

function CleaningTierRow({
  keyId,
  value,
  ctx,
  onChange,
  onDelete,
}: {
  keyId: string;
  value: CleaningTier;
  ctx: EditorCtx;
  onChange: (v: CleaningTier) => void;
  onDelete: () => void;
}) {
  const isEditing = ctx.editing === keyId;
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, isEditing, () => ctx.setEditing(null));

  if (isEditing) {
    return (
      <div ref={ref} className="border-t border-gray-200 bg-indigo-50 p-3 space-y-2">
        <div className="grid grid-cols-12 gap-2">
          <input
            autoFocus
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="Name"
            className="col-span-3 px-2 py-1 border rounded text-sm"
          />
          <select
            value={value.level}
            onChange={(e) => onChange({ ...value, level: e.target.value as CleaningTier["level"] })}
            className="col-span-3 px-2 py-1 border rounded text-sm"
          >
            <option value="NO_CLEAN">NO_CLEAN</option>
            <option value="WATER_RINSE">WATER_RINSE</option>
            <option value="RINSE">RINSE</option>
            <option value="TAKE_APART">TAKE_APART</option>
          </select>
          <input
            value={value.definition}
            onChange={(e) => onChange({ ...value, definition: e.target.value })}
            placeholder="Definition (e.g. 2 hot, 1 cold)"
            className="col-span-5 px-2 py-1 border rounded text-sm"
          />
          <input
            type="number"
            value={value.duration_minutes}
            onChange={(e) =>
              onChange({ ...value, duration_minutes: parseInt(e.target.value) || 0 })
            }
            className="col-span-1 px-2 py-1 border rounded text-sm text-center"
          />
        </div>
        <textarea
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          placeholder="When to use"
          rows={3}
          className="w-full px-2 py-1 border rounded text-xs"
        />
      </div>
    );
  }

  return (
    <div
      className="group grid grid-cols-12 gap-2 px-3 py-2.5 border-t border-gray-100 cursor-pointer hover:bg-gray-50 items-start"
      onClick={() => ctx.setEditing(keyId)}
    >
      <div className={`col-span-2 font-semibold text-sm ${TIER_COLOR[value.level]}`}>
        {value.name}
      </div>
      <div className="col-span-3 font-mono text-[11px] text-gray-500">{value.definition}</div>
      <div className="col-span-6 text-[13px] text-gray-700 leading-snug">{value.description}</div>
      <div className="col-span-1 text-[11px] text-gray-400 text-right font-mono flex items-start justify-end gap-1">
        <span>{value.duration_minutes} min</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-opacity text-base leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TA trigger category block

function TriggerCategoryBlock({
  title,
  color,
  category,
  ctx,
  inline = false,
}: {
  title: string;
  color: "red" | "amber" | "green" | "blue";
  category: TATrigger["category"];
  ctx: EditorCtx;
  inline?: boolean;
}) {
  const colorClasses = {
    red: { dot: "bg-red-500", title: "bg-red-50 text-red-700 border-red-200", btn: "text-red-500 hover:bg-red-100" },
    amber: { dot: "bg-amber-500", title: "bg-amber-50 text-amber-700 border-amber-200", btn: "text-amber-500 hover:bg-amber-100" },
    green: { dot: "bg-green-500", title: "bg-green-50 text-green-700 border-green-200", btn: "text-green-600 hover:bg-green-100" },
    blue: { dot: "bg-blue-500", title: "bg-blue-50 text-blue-700 border-blue-200", btn: "text-blue-500 hover:bg-blue-100" },
  } as const;

  const triggers = ctx.rules.ta_triggers
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => t.category === category);

  function addToCategory() {
    ctx.update("ta_triggers", [
      ...ctx.rules.ta_triggers,
      { name: "New item", category },
    ]);
  }

  return (
    <div className={inline ? "" : "mt-3"}>
      {!inline && title && (
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`inline-block px-2.5 py-1 rounded text-xs font-semibold border ${colorClasses[color].title}`}
          >
            {title}
          </div>
          <button
            onClick={addToCategory}
            title={`Add to ${category}`}
            className={`w-5 h-5 rounded flex items-center justify-center text-sm font-bold leading-none transition-colors ${colorClasses[color].btn}`}
          >
            +
          </button>
        </div>
      )}
      {inline && (
        <div className="flex justify-end mb-1">
          <button
            onClick={addToCategory}
            title="Add dissolving item"
            className={`w-5 h-5 rounded flex items-center justify-center text-sm font-bold leading-none transition-colors ${colorClasses[color].btn}`}
          >
            +
          </button>
        </div>
      )}
      {triggers.length === 0 && (
        <p className="text-xs text-gray-400 italic">No triggers in this category</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-1">
        {triggers.map(({ t, idx }) => (
          <TATriggerItem
            key={`ta-${idx}`}
            keyId={`ta-${idx}`}
            value={t}
            color={color}
            ctx={ctx}
            onChange={(next) =>
              ctx.update(
                "ta_triggers",
                ctx.rules.ta_triggers.map((x, i) => (i === idx ? next : x))
              )
            }
            onDelete={() =>
              ctx.update(
                "ta_triggers",
                ctx.rules.ta_triggers.filter((_, i) => i !== idx)
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

function TATriggerItem({
  keyId,
  value,
  color,
  ctx,
  onChange,
  onDelete,
}: {
  keyId: string;
  value: TATrigger;
  color: "red" | "amber" | "green" | "blue";
  ctx: EditorCtx;
  onChange: (v: TATrigger) => void;
  onDelete: () => void;
}) {
  const isEditing = ctx.editing === keyId;
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, isEditing, () => ctx.setEditing(null));

  const dotColor = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
  }[color];

  if (isEditing) {
    return (
      <div ref={ref} className="bg-indigo-50 border border-indigo-200 rounded p-2 space-y-1">
        <input
          autoFocus
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Name"
          className="w-full px-2 py-1 border rounded text-xs font-medium"
        />
        <div className="flex gap-1">
          <select
            value={value.category}
            onChange={(e) =>
              onChange({ ...value, category: e.target.value as TATrigger["category"] })
            }
            className="px-2 py-1 border rounded text-xs"
          >
            <option value="always">Always</option>
            <option value="conditional">Conditional</option>
            <option value="never">Never</option>
            <option value="dissolving">Dissolving</option>
          </select>
          <input
            value={value.note ?? ""}
            onChange={(e) => onChange({ ...value, note: e.target.value || undefined })}
            placeholder="Note (optional)"
            className="flex-1 px-2 py-1 border rounded text-xs"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="group flex items-baseline gap-1.5 py-0.5 cursor-pointer hover:bg-gray-50 rounded -mx-1 px-1"
      onClick={() => ctx.setEditing(keyId)}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${dotColor}`}></span>
      <div className="flex-1 leading-snug">
        <span className="text-[12.5px] font-medium">{value.name}</span>
        {value.note && (
          <>
            <br />
            <span className="text-[11px] text-gray-500">{value.note}</span>
          </>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-sm leading-none px-1"
      >
        ×
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Simple narrative rule list

function RuleList({
  items,
  ctx,
  keyPrefix,
  onChange,
}: {
  items: string[];
  ctx: EditorCtx;
  keyPrefix: string;
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      {items.map((item, i) => (
        <RuleItem
          key={`${keyPrefix}-${i}`}
          keyId={`${keyPrefix}-${i}`}
          value={item}
          ctx={ctx}
          onChange={(v) => onChange(items.map((x, idx) => (idx === i ? v : x)))}
          onDelete={() => onChange(items.filter((_, idx) => idx !== i))}
        />
      ))}
    </div>
  );
}

function RuleItem({
  keyId,
  value,
  ctx,
  onChange,
  onDelete,
}: {
  keyId: string;
  value: string;
  ctx: EditorCtx;
  onChange: (v: string) => void;
  onDelete: () => void;
}) {
  const isEditing = ctx.editing === keyId;
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, isEditing, () => ctx.setEditing(null));

  if (isEditing) {
    return (
      <div ref={ref} className="bg-indigo-50 border border-indigo-200 rounded p-2 my-1">
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full px-2 py-1 border rounded text-sm"
        />
      </div>
    );
  }

  return (
    <div
      className="group flex items-start gap-2 py-2 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
      onClick={() => ctx.setEditing(keyId)}
    >
      <p className="flex-1 text-[13px] text-gray-800 leading-relaxed">
        {formatBoldText(value)}
      </p>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-base leading-none px-1 shrink-0"
      >
        ×
      </button>
    </div>
  );
}

// Renders text with the convention "Bold prefix: rest of sentence" — bold up to the first colon.
function formatBoldText(text: string): React.ReactNode {
  const m = text.match(/^([^:]{1,80}:)\s*([\s\S]*)$/);
  if (m) {
    return (
      <>
        <b className="font-semibold">{m[1]}</b> {m[2]}
      </>
    );
  }
  return text;
}

// ─────────────────────────────────────────────────────────────────────────
// Recipe note card

function RecipeNoteCard({
  keyId,
  value,
  ctx,
  onChange,
  onDelete,
}: {
  keyId: string;
  value: RecipeNote;
  ctx: EditorCtx;
  onChange: (v: RecipeNote) => void;
  onDelete: () => void;
}) {
  const isEditing = ctx.editing === keyId;
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, isEditing, () => ctx.setEditing(null));

  if (isEditing) {
    return (
      <div ref={ref} className="bg-white border-2 border-indigo-400 rounded-lg p-3 space-y-2">
        <input
          autoFocus
          value={value.recipe}
          onChange={(e) => onChange({ ...value, recipe: e.target.value })}
          placeholder="Recipe name"
          className="w-full px-2 py-1 border rounded text-sm font-semibold"
        />
        <textarea
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          rows={3}
          placeholder="Note"
          className="w-full px-2 py-1 border rounded text-xs"
        />
      </div>
    );
  }

  return (
    <div
      className="group bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow relative"
      onClick={() => ctx.setEditing(keyId)}
    >
      <div className="font-semibold text-[13px] mb-1">{value.recipe}</div>
      <div className="text-[12px] text-gray-600 leading-relaxed">{value.note}</div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-base leading-none w-5 h-5 flex items-center justify-center"
      >
        ×
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Day phase row

function DayPhaseRow({
  keyId,
  value,
  ctx,
  onChange,
  onDelete,
}: {
  keyId: string;
  value: DayPhase;
  ctx: EditorCtx;
  onChange: (v: DayPhase) => void;
  onDelete: () => void;
}) {
  const isEditing = ctx.editing === keyId;
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, isEditing, () => ctx.setEditing(null));

  if (isEditing) {
    return (
      <div ref={ref} className="bg-indigo-50 border border-indigo-200 rounded p-2 my-1 space-y-1">
        <div className="flex gap-2">
          <input
            type="number"
            value={value.order}
            onChange={(e) => onChange({ ...value, order: parseInt(e.target.value) || 0 })}
            className="w-14 px-2 py-1 border rounded text-sm text-center"
          />
          <input
            autoFocus
            value={value.phase}
            onChange={(e) => onChange({ ...value, phase: e.target.value })}
            placeholder="Phase title"
            className="flex-1 px-2 py-1 border rounded text-sm font-semibold"
          />
        </div>
        <textarea
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          rows={2}
          placeholder="Description"
          className="w-full px-2 py-1 border rounded text-xs"
        />
      </div>
    );
  }

  return (
    <div
      className="group flex gap-3.5 items-start py-2.5 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
      onClick={() => ctx.setEditing(keyId)}
    >
      <div className="w-7 h-7 rounded-full bg-gray-900 text-white text-[12px] font-semibold flex items-center justify-center shrink-0">
        {value.order}
      </div>
      <div className="flex-1">
        <div className="font-semibold text-[13px]">{value.phase}</div>
        <div className="text-[12px] text-gray-600">{value.description}</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-base leading-none px-1 shrink-0"
      >
        ×
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Callouts list

function CalloutsList({
  callouts,
  onChange,
  ctx,
  keyPrefix,
  emptyAdd,
}: {
  callouts: Callout[];
  onChange: (next: Callout[]) => void;
  ctx: EditorCtx;
  keyPrefix: string;
  emptyAdd?: () => void;
}) {
  if (callouts.length === 0) {
    if (emptyAdd) {
      return (
        <button
          onClick={emptyAdd}
          className="text-xs text-gray-400 hover:text-indigo-600 italic"
        >
          + add callout
        </button>
      );
    }
    return null;
  }
  return (
    <div className="space-y-2">
      {callouts.map((c, i) => (
        <CalloutItem
          key={`${keyPrefix}-${i}`}
          keyId={`${keyPrefix}-${i}`}
          value={c}
          ctx={ctx}
          onChange={(v) => onChange(callouts.map((x, idx) => (idx === i ? v : x)))}
          onDelete={() => onChange(callouts.filter((_, idx) => idx !== i))}
        />
      ))}
    </div>
  );
}

const CALLOUT_STYLE: Record<CalloutType, { bg: string; border: string; text: string; icon: string }> = {
  info: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-900", icon: "ℹ" },
  warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900", icon: "⚠" },
  critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-900", icon: "🚨" },
  success: { bg: "bg-green-50", border: "border-green-200", text: "text-green-900", icon: "✅" },
};

function CalloutItem({
  keyId,
  value,
  ctx,
  onChange,
  onDelete,
}: {
  keyId: string;
  value: Callout;
  ctx: EditorCtx;
  onChange: (v: Callout) => void;
  onDelete: () => void;
}) {
  const isEditing = ctx.editing === keyId;
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, isEditing, () => ctx.setEditing(null));

  const style = CALLOUT_STYLE[value.type];

  if (isEditing) {
    return (
      <div ref={ref} className={`${style.bg} ${style.border} border rounded p-2.5 space-y-2`}>
        <select
          value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value as CalloutType })}
          className="px-2 py-1 border rounded text-xs"
        >
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
          <option value="success">Success</option>
        </select>
        <textarea
          autoFocus
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          rows={3}
          className="w-full px-2 py-1 border rounded text-xs"
        />
      </div>
    );
  }

  return (
    <div
      className={`group flex gap-2 items-start ${style.bg} ${style.border} ${style.text} border rounded-lg px-3.5 py-3 text-[12.5px] leading-relaxed cursor-pointer relative`}
      onClick={() => ctx.setEditing(keyId)}
    >
      <span className="text-sm shrink-0 mt-px">{style.icon}</span>
      <span className="flex-1">{formatBoldText(value.text)}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-base leading-none px-1 shrink-0"
      >
        ×
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Save indicator

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
