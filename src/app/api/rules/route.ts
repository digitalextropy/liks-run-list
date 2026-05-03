import { NextResponse } from "next/server";
import { getRules, saveRules } from "@/lib/blob";
import type { ProductionRules } from "@/lib/rules-schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrate(raw: any): ProductionRules {
  if (!raw || typeof raw !== "object") raw = {};
  const machines = Array.isArray(raw.machines) ? raw.machines : [];
  const cleaning = Array.isArray(raw.cleaning_tiers) ? raw.cleaning_tiers : [];
  const ta = Array.isArray(raw.ta_triggers) ? raw.ta_triggers : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allergens: string[] = (Array.isArray(raw.allergen_rules) ? raw.allergen_rules : []).map((a: any) =>
    typeof a === "string" ? a : a?.rule || ""
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sequencing: string[] = (Array.isArray(raw.sequencing_rules) ? raw.sequencing_rules : []).map((s: any) =>
    typeof s === "string" ? s : s?.rule || ""
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const optimization: string[] = (Array.isArray(raw.optimization_rules) ? raw.optimization_rules : []).map((o: any) =>
    typeof o === "string" ? o : o?.description || o?.name || ""
  );

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    machines: machines.map((m: any) => ({
      name: m.name || "",
      capacity_gallons: Number(m.capacity_gallons) || 0,
      tubs_per_run: Number(m.tubs_per_run) || 0,
      rules: m.rules ?? m.notes ?? "",
      warnings: Array.isArray(m.warnings) ? m.warnings : [],
      highlight: Boolean(m.highlight),
    })),
    machines_callouts: Array.isArray(raw.machines_callouts) ? raw.machines_callouts : [],

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cleaning_tiers: cleaning.map((t: any) => ({
      name: t.name || "",
      level: t.level || "RINSE",
      definition: t.definition || "",
      description: t.description || "",
      duration_minutes: Number(t.duration_minutes) || 0,
    })),
    cleaning_tiers_callouts: Array.isArray(raw.cleaning_tiers_callouts) ? raw.cleaning_tiers_callouts : [],

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ta_triggers: ta.map((t: any) => ({
      name: t.name ?? t.ingredient ?? "",
      category: ["always", "conditional", "never", "dissolving"].includes(t.category) ? t.category : "always",
      note: t.note ?? t.condition ?? undefined,
    })),
    ta_triggers_callouts_top: Array.isArray(raw.ta_triggers_callouts_top) ? raw.ta_triggers_callouts_top : [],
    ta_triggers_callouts_bottom: Array.isArray(raw.ta_triggers_callouts_bottom) ? raw.ta_triggers_callouts_bottom : [],
    ta_triggers_dissolving_intro: typeof raw.ta_triggers_dissolving_intro === "string" ? raw.ta_triggers_dissolving_intro : "",

    allergen_rules: allergens,
    allergen_rules_callouts: Array.isArray(raw.allergen_rules_callouts) ? raw.allergen_rules_callouts : [],

    sequencing_rules: sequencing,
    optimization_rules: optimization,

    forty_four_qt_rule: typeof raw.forty_four_qt_rule === "string"
      ? raw.forty_four_qt_rule
      : raw.forty_four_qt_rules?.rule || "",
    forty_four_qt_callouts: Array.isArray(raw.forty_four_qt_callouts) ? raw.forty_four_qt_callouts : [],

    recipe_notes: Array.isArray(raw.recipe_notes) ? raw.recipe_notes : [],
    day_structure: Array.isArray(raw.day_structure) ? raw.day_structure : [],
  };
}

export async function GET() {
  try {
    const rules = await getRules();
    if (!rules) {
      return NextResponse.json({ error: "No rules found. Seed first." }, { status: 404 });
    }
    return NextResponse.json(migrate(rules));
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to load rules", details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const rules = await request.json();
    await saveRules(rules);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to save rules", details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
