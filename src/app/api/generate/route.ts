import { NextResponse } from "next/server";
import { getRules } from "@/lib/blob";
import { generateRunList } from "@/lib/claude";
import type { ProductionRules } from "@/lib/rules-schema";
import type { Recipe } from "@/lib/recipe-schema";

export async function POST(request: Request) {
  const { recipes, machines } = await request.json() as {
    recipes: { name: string; tubs: number; recipe: Recipe }[];
    machines?: string[];
  };

  if (!recipes || recipes.length === 0) {
    return NextResponse.json({ error: "No recipes provided" }, { status: 400 });
  }

  const rules = await getRules() as ProductionRules | null;
  if (!rules) {
    return NextResponse.json({ error: "Production rules not configured. Seed rules first." }, { status: 500 });
  }

  const filteredRules: ProductionRules = machines && machines.length > 0
    ? { ...rules, machines: rules.machines.filter((m) => machines.includes(m.name)) }
    : rules;

  if (filteredRules.machines.length === 0) {
    return NextResponse.json({ error: "No matching machines selected" }, { status: 400 });
  }

  try {
    const runList = await generateRunList(recipes, filteredRules);
    return NextResponse.json(runList);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate run list", details: String(error) },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
