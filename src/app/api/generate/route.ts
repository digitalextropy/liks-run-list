import { NextResponse } from "next/server";
import { getRules } from "@/lib/blob";
import { generateRunList, type RunListOutput } from "@/lib/claude";
import {
  generateRunListDeterministic,
  isDeterministicEngineEnabled,
} from "@/lib/deterministic-engine";
import type { ProductionRules } from "@/lib/rules-schema";
import type { Recipe } from "@/lib/recipe-schema";

function normalizeChainLabels(runList: RunListOutput): RunListOutput {
  for (const machine of runList.machines) {
    let chainStart = 0;
    for (let i = 0; i <= machine.runs.length; i++) {
      const sameAsPrev =
        i > 0 &&
        i < machine.runs.length &&
        machine.runs[i].flavor === machine.runs[i - 1].flavor;

      if (!sameAsPrev) {
        const chainLength = i - chainStart;
        if (chainLength >= 2) {
          for (let k = 0; k < chainLength; k++) {
            const run = machine.runs[chainStart + k];
            run.chain_badge = true;
            run.chain_label = k === 0 ? "chain" : `×${k + 1}`;
          }
        } else if (chainLength === 1) {
          const run = machine.runs[chainStart];
          run.chain_badge = false;
          run.chain_label = undefined;
        }
        chainStart = i;
      }
    }
  }
  return runList;
}

export async function POST(request: Request) {
  const { recipes, machines } = (await request.json()) as {
    recipes: { name: string; tubs: number; recipe: Recipe }[];
    machines?: string[];
  };

  if (!recipes || recipes.length === 0) {
    return NextResponse.json({ error: "No recipes provided" }, { status: 400 });
  }

  const rules = (await getRules()) as ProductionRules | null;
  if (!rules) {
    return NextResponse.json(
      { error: "Production rules not configured. Seed rules first." },
      { status: 500 }
    );
  }

  const filteredRules: ProductionRules =
    machines && machines.length > 0
      ? { ...rules, machines: rules.machines.filter((m) => machines.includes(m.name)) }
      : rules;

  if (filteredRules.machines.length === 0) {
    return NextResponse.json({ error: "No matching machines selected" }, { status: 400 });
  }

  try {
    const useDeterministic = isDeterministicEngineEnabled();
    console.log(
      `[generate] engine: ${useDeterministic ? "deterministic" : "claude"}`
    );
    const runList = useDeterministic
      ? await generateRunListDeterministic(recipes, filteredRules)
      : await generateRunList(recipes, filteredRules);
    const normalized = normalizeChainLabels(runList);

    // Build scheduled-tubs map from actual run data (not Claude's self-reported totals).
    const scheduledByFlavor: Record<string, number> = {};
    for (const machine of normalized.machines) {
      for (const run of machine.runs) {
        const key = run.flavor.toLowerCase().trim();
        scheduledByFlavor[key] = (scheduledByFlavor[key] || 0) + run.tubs;
      }
    }

    // Match each requested recipe to scheduled tubs.
    // Try exact match first, then normalized (spaces stripped), then substring.
    function findScheduled(name: string): { scheduled: number; matchedAs: string | null } {
      const exact = name.toLowerCase().trim();
      if (scheduledByFlavor[exact] !== undefined) {
        return { scheduled: scheduledByFlavor[exact], matchedAs: null };
      }
      const norm = exact.replace(/\s+/g, "");
      for (const [key, tubs] of Object.entries(scheduledByFlavor)) {
        if (key.replace(/\s+/g, "") === norm) {
          return { scheduled: tubs, matchedAs: key };
        }
      }
      // Substring fallback: accumulate all partial matches
      let total = 0;
      let found = false;
      for (const [key, tubs] of Object.entries(scheduledByFlavor)) {
        if (key.includes(norm) || norm.includes(key.replace(/\s+/g, ""))) {
          total += tubs;
          found = true;
        }
      }
      if (found) return { scheduled: total, matchedAs: "(partial)" };
      return { scheduled: 0, matchedAs: null };
    }

    const tubAccounting = recipes.map((r) => {
      const { scheduled, matchedAs } = findScheduled(r.name);
      return {
        name: r.name,
        requested: r.tubs,
        scheduled,
        matchedAs,
        ok: scheduled === r.tubs,
      };
    });

    // Recompute totals from actual run data.
    const actualTotalScheduled = Object.values(scheduledByFlavor).reduce((s, t) => s + t, 0);
    const requestedTotal = recipes.reduce((s, r) => s + r.tubs, 0);

    // Override Claude's reported totals with recomputed values.
    normalized.totals.tubs = actualTotalScheduled;
    normalized.totals.runs = normalized.machines.reduce((s, m) => s + m.runs.length, 0);

    const tubWarnings = tubAccounting
      .filter((a) => !a.ok)
      .map((a) => `${a.name}: requested ${a.requested}, scheduled ${a.scheduled}${a.matchedAs ? ` (matched as "${a.matchedAs}")` : ""}`);

    return NextResponse.json({
      ...normalized,
      _tubWarnings: tubWarnings,
      _tubAccounting: tubAccounting,
      _totalsCheck: {
        requested: requestedTotal,
        scheduled: actualTotalScheduled,
        claudeReported: runList.totals.tubs,
        allFlavorsSeen: Object.keys(scheduledByFlavor),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate run list", details: String(error) },
      { status: 500 }
    );
  }
}

export const maxDuration = 120;
