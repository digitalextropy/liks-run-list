import { NextResponse } from "next/server";
import { getRecipePdfUrl } from "@/lib/blob";
import { parsePdfFromUrl } from "@/lib/pdf-parser";

export async function GET() {
  const pdfUrl = await getRecipePdfUrl();
  if (!pdfUrl) {
    return NextResponse.json({ error: "No recipe PDF uploaded" }, { status: 404 });
  }

  try {
    const recipes = await parsePdfFromUrl(pdfUrl);
    return NextResponse.json({ recipes, count: recipes.length });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to parse PDF", details: String(error) },
      { status: 500 }
    );
  }
}
