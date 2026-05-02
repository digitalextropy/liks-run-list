import { NextResponse } from "next/server";
import { getRecipePdfUrl, getParsedRecipes, saveParsedRecipes } from "@/lib/blob";
import { parsePdfFromUrl } from "@/lib/pdf-parser";

export async function GET() {
  // Fast path: serve from cached JSON when available.
  const cached = await getParsedRecipes();
  if (cached) {
    return NextResponse.json({ recipes: cached, count: cached.length, cached: true });
  }

  const pdfUrl = await getRecipePdfUrl();
  if (!pdfUrl) {
    return NextResponse.json({ error: "No recipe PDF uploaded" }, { status: 404 });
  }

  try {
    const recipes = await parsePdfFromUrl(pdfUrl);
    await saveParsedRecipes(recipes);
    return NextResponse.json({ recipes, count: recipes.length, cached: false });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to parse PDF", details: String(error) },
      { status: 500 }
    );
  }
}
