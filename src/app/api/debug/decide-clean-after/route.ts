import { NextRequest, NextResponse } from "next/server";
import { decideCleanAfter } from "@/lib/deterministic-engine";
import type { AssignedRecipe } from "@/lib/machine-assigner";
import type { ProductionRules } from "@/lib/rules-schema";

interface RequestBody {
  rules: Partial<ProductionRules>;
  prev: AssignedRecipe | null;
  curr: AssignedRecipe;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;

    if (!body.curr) {
      return NextResponse.json({ error: "Missing required field: curr" }, { status: 400 });
    }

    const rules = (body.rules ?? {}) as ProductionRules;
    const result = decideCleanAfter(body.prev ?? null, body.curr, rules);

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to evaluate", details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
