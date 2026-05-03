import { NextResponse } from "next/server";
import { list, del } from "@vercel/blob";
import { saveParsedRecipes, deleteParsedRecipes } from "@/lib/blob";
import { extractPdfTextFromUrl } from "@/lib/pdf-parser";
import { parseRecipesWithClaude } from "@/lib/claude";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { keepUrl } = (await request.json()) as { keepUrl: string };
    const result = await list({ prefix: "recipes/" });
    const toDelete = result.blobs.filter((b) => b.url !== keepUrl);
    for (const blob of toDelete) {
      await del(blob.url);
    }

    await deleteParsedRecipes();

    let recipeCount = 0;
    let parseError: string | undefined;
    try {
      const pdfText = await extractPdfTextFromUrl(keepUrl);
      const recipes = await parseRecipesWithClaude(pdfText);
      await saveParsedRecipes(recipes);
      recipeCount = recipes.length;
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json({
      deleted: toDelete.length,
      recipeCount,
      ...(parseError ? { parseError } : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
