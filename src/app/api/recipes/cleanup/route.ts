import { NextResponse } from "next/server";
import { list, del } from "@vercel/blob";
import { saveParsedRecipes, deleteParsedRecipes } from "@/lib/blob";
import { parsePdfFromUrl } from "@/lib/pdf-parser";

export async function POST(request: Request) {
  try {
    const { keepUrl } = (await request.json()) as { keepUrl: string };
    const result = await list({ prefix: "recipes/" });
    const toDelete = result.blobs.filter((b) => b.url !== keepUrl);
    for (const blob of toDelete) {
      await del(blob.url);
    }

    // Re-parse and cache for fast lookups during validate/generate.
    await deleteParsedRecipes();
    let recipeCount = 0;
    try {
      const recipes = await parsePdfFromUrl(keepUrl);
      await saveParsedRecipes(recipes);
      recipeCount = recipes.length;
    } catch (e) {
      return NextResponse.json({
        deleted: toDelete.length,
        parseError: e instanceof Error ? e.message : String(e),
      });
    }

    return NextResponse.json({ deleted: toDelete.length, recipeCount });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
