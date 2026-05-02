import { NextResponse } from "next/server";
import { getRecipePdfUrl } from "@/lib/blob";
import { parsePdfFromUrl, fuzzyMatchRecipe } from "@/lib/pdf-parser";
import type { ValidationResult } from "@/lib/recipe-schema";

export async function POST(request: Request) {
  try {
    const { recipes } = (await request.json()) as {
      recipes: { name: string; tubs: number }[];
    };

    const pdfUrl = await getRecipePdfUrl();
    if (!pdfUrl) {
      return NextResponse.json(
        { error: "No recipe PDF uploaded yet. Go to Admin → Recipes to upload one." },
        { status: 404 }
      );
    }

    let knownRecipes;
    try {
      knownRecipes = await parsePdfFromUrl(pdfUrl);
    } catch (e) {
      return NextResponse.json(
        {
          error: "Failed to parse recipe PDF",
          details: e instanceof Error ? e.message : String(e),
        },
        { status: 500 }
      );
    }

    if (knownRecipes.length === 0) {
      return NextResponse.json(
        {
          error:
            "PDF parsed but no recipes were found. The parser may need tuning for this PDF format.",
        },
        { status: 422 }
      );
    }

    const results: ValidationResult[] = [];
    for (const input of recipes) {
      const matched = fuzzyMatchRecipe(input.name, knownRecipes);
      if (matched) {
        if (matched.name.toLowerCase() === input.name.toLowerCase()) {
          results.push({
            recipe: input.name,
            status: "matched",
            matchedRecipe: matched,
            tubs: input.tubs,
          });
        } else {
          results.push({
            recipe: input.name,
            status: "ambiguous",
            matchedRecipe: matched,
            suggestions: [matched.name],
            tubs: input.tubs,
          });
        }
      } else {
        const suggestions = knownRecipes
          .filter((r) => {
            const words = input.name.toLowerCase().split(/\s+/);
            return words.some((w) => r.name.toLowerCase().includes(w));
          })
          .slice(0, 3)
          .map((r) => r.name);
        results.push({
          recipe: input.name,
          status: "not_found",
          suggestions,
          tubs: input.tubs,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Validation crashed",
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
