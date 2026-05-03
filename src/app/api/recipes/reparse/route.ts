import { NextResponse } from "next/server";
import {
  getRecipePdfUrl,
  saveParsedRecipes,
  deleteParsedRecipes,
} from "@/lib/blob";
import { extractPdfTextFromUrl } from "@/lib/pdf-parser";
import { parseRecipesWithClaude } from "@/lib/claude";

export const maxDuration = 120;

export async function POST() {
  const pdfUrl = await getRecipePdfUrl();
  if (!pdfUrl) {
    return NextResponse.json(
      { error: "No recipe PDF uploaded yet." },
      { status: 404 }
    );
  }

  try {
    const pdfText = await extractPdfTextFromUrl(pdfUrl);
    const recipes = await parseRecipesWithClaude(pdfText);
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
