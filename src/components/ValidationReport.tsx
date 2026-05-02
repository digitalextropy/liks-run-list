"use client";

import type { ValidationResult } from "@/lib/recipe-schema";

interface Props {
  results: ValidationResult[];
}

export default function ValidationReport({ results }: Props) {
  return (
    <div className="space-y-2">
      {results.map((r, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 px-3 py-2 rounded text-sm ${
            r.status === "matched"
              ? "bg-green-50 border border-green-200"
              : r.status === "ambiguous"
              ? "bg-yellow-50 border border-yellow-200"
              : "bg-red-50 border border-red-200"
          }`}
        >
          <span className="text-lg leading-none mt-0.5">
            {r.status === "matched" ? "✓" : r.status === "ambiguous" ? "⚠" : "✗"}
          </span>
          <div className="flex-1">
            <span className="font-medium">{r.recipe}</span>
            {r.status === "matched" && r.matchedRecipe && (
              <span className="text-green-700 ml-2">
                → {r.matchedRecipe.name} ({r.tubs} tubs)
              </span>
            )}
            {r.status === "ambiguous" && r.matchedRecipe && (
              <span className="text-yellow-700 ml-2">
                Did you mean: <strong>{r.matchedRecipe.name}</strong>?
              </span>
            )}
            {r.status === "not_found" && r.suggestions && r.suggestions.length > 0 && (
              <span className="text-red-700 ml-2">
                Not found. Similar: {r.suggestions.join(", ")}
              </span>
            )}
            {r.status === "not_found" && (!r.suggestions || r.suggestions.length === 0) && (
              <span className="text-red-700 ml-2">Not found in recipe PDF</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
