import { NextResponse } from "next/server";
import { getRules, saveRules } from "@/lib/blob";

export async function GET() {
  const rules = await getRules();
  if (!rules) {
    return NextResponse.json({ error: "No rules found. Seed first." }, { status: 404 });
  }
  return NextResponse.json(rules);
}

export async function PUT(request: Request) {
  const rules = await request.json();
  await saveRules(rules);
  return NextResponse.json({ success: true });
}
