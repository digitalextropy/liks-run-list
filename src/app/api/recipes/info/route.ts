import { NextResponse } from "next/server";
import { getRecipePdfInfo } from "@/lib/blob";

export async function GET() {
  const info = await getRecipePdfInfo();
  if (!info) {
    return NextResponse.json({ error: "No recipe PDF uploaded" }, { status: 404 });
  }
  return NextResponse.json(info);
}
