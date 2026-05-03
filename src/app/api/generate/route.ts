import { NextResponse } from "next/server";
import { getRules } from "@/lib/blob";
import { generateRunList, type RunListOutput } from "@/lib/claude";
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
    const runList = await generateRunList(recipes, filteredRules);
    return NextResponse.json(normalizeChainLabels(runList));
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate run list", details: String(error) },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
