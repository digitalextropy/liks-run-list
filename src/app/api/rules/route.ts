import { NextResponse } from "next/server";
import { getRules, saveRules } from "@/lib/blob";

export async function GET() {
  try {
    const rules = await getRules();
    if (!rules) {
      return NextResponse.json({ error: "No rules found. Seed first." }, { status: 404 });
    }
    return NextResponse.json(rules);
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
