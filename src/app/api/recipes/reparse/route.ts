import { NextResponse } from "next/server";
import {
  getRecipePdfUrl,
  saveParsedRecipes,
  deleteParsedRecipes,
} from "@/lib/blob";
import { parsePdfFromUrl } from "@/lib/pdf-parser";

export async function POST() {
  const pdfUrl = await getRecipePdfUrl();
  if (!pdfUrl) {
    return NextResponse.json(
      { error: "No recipe PDF uploaded yet." },
      { status: 404 }
    );
  }

  try {
    const recipes = await parsePdfFromUrl(pdfUrl);
    await deleteParsedRecipes();
    await saveParsedRecipes(recipes);
    return NextResponse.json({ recipeCount: recipes.length });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Failed to parse PDF",
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
