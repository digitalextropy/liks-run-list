import { NextRequest, NextResponse } from "next/server";
import { sequenceRunsWithCost } from "@/lib/deterministic-engine";
import type { AssignedRecipe } from "@/lib/machine-assigner";
import type { ProductionRules } from "@/lib/rules-schema";

interface RequestBody {
  rules: Partial<ProductionRules>;
  recipes: AssignedRecipe[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;

    if (!body.recipes?.length) {
      return NextResponse.json({ error: "Missing or empty 'recipes' array" }, { status: 400 });
    }

    const rules = (body.rules ?? {}) as ProductionRules;
    const result = sequenceRunsWithCost(body.recipes, rules);

    return NextResponse.json({
      sequence: result.sequence.map((r, i) => ({
        order: i + 1,
        name: r.name,
        family: r.family,
        base: r.recipe.base.type,
        addIns: r.recipe.addIns.map(a => `${a.name} [${a.taTrigger}]`),
      })),
      totalCleanMinutes: result.totalCleanMinutes,
      cleanBreakdown: result.cleanBreakdown,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to sequence", details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
