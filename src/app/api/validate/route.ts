import { NextResponse } from "next/server";
import {
  getRecipePdfUrl,
  getParsedRecipes,
  saveParsedRecipes,
} from "@/lib/blob";
import { parsePdfFromUrl, findExactMatch } from "@/lib/pdf-parser";
import { suggestRecipeMatches } from "@/lib/claude";
import type { ValidationResult } from "@/lib/recipe-schema";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { recipes } = (await request.json()) as {
      recipes: { name: string; tubs: number }[];
    };

    let knownRecipes = await getParsedRecipes();
    if (!knownRecipes) {
      const pdfUrl = await getRecipePdfUrl();
      if (!pdfUrl) {
        return NextResponse.json(
          { error: "No recipe PDF uploaded yet. Go to Recipes to upload one." },
          { status: 404 }
        );
      }
      try {
        knownRecipes = await parsePdfFromUrl(pdfUrl);
        await saveParsedRecipes(knownRecipes);
      } catch (e) {
        return NextResponse.json(
          {
            error: "Failed to parse recipe PDF",
            details: e instanceof Error ? e.message : String(e),
          },
          { status: 500 }
        );
      }
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

    // First pass: exact matches by name.
    const results: ValidationResult[] = [];
    const needsAi: string[] = [];
    for (const input of recipes) {
      const matched = findExactMatch(input.name, knownRecipes);
      if (matched) {
        results.push({
          recipe: input.name,
          status: "matched",
          matchedRecipe: matched,
          tubs: input.tubs,
        });
      } else {
        results.push({
          recipe: input.name,
          status: "not_found",
          tubs: input.tubs,
        });
        needsAi.push(input.name);
      }
    }

    // Second pass: AI suggestions for everything that didn't exactly match.
    if (needsAi.length > 0) {
      const knownNames = knownRecipes.map((r) => r.name);
      let suggestions: Record<string, string[]> = {};
      try {
        suggestions = await suggestRecipeMatches(needsAi, knownNames);
      } catch {
        // AI failed — leave results as not_found with no suggestions.
      }

      for (const r of results) {
        if (r.status !== "not_found") continue;
        const names = suggestions[r.recipe] || [];
        if (names.length > 0) {
          const top = knownRecipes.find((rec) => rec.name === names[0]);
          if (top) {
            r.status = "ambiguous";
            r.matchedRecipe = top;
            r.suggestions = names.slice(0, 5);
          } else {
            r.suggestions = names.slice(0, 5);
          }
        }
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
