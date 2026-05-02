import { put, list, del } from "@vercel/blob";
import type { Recipe } from "./recipe-schema";

const RECIPE_PDF_PREFIX = "recipes/";
const PARSED_RECIPES_PREFIX = "recipes-parsed/";
const PARSED_RECIPES_KEY = `${PARSED_RECIPES_PREFIX}recipes.json`;
const RULES_PREFIX = "rules/";
const RULES_KEY = `${RULES_PREFIX}production-rules.json`;

export async function uploadRecipePdf(file: Buffer, filename: string) {
  const existing = await list({ prefix: RECIPE_PDF_PREFIX });
  for (const blob of existing.blobs) {
    await del(blob.url);
  }

  const blob = await put(`${RECIPE_PDF_PREFIX}${filename}`, file, {
    access: "public",
    contentType: "application/pdf",
  });
  return blob;
}

export async function getRecipePdfUrl(): Promise<string | null> {
  const result = await list({ prefix: RECIPE_PDF_PREFIX });
  if (result.blobs.length === 0) return null;
  return result.blobs[0].url;
}

export async function getRecipePdfInfo() {
  const result = await list({ prefix: RECIPE_PDF_PREFIX });
  if (result.blobs.length === 0) return null;
  return {
    url: result.blobs[0].url,
    filename: result.blobs[0].pathname.replace(RECIPE_PDF_PREFIX, ""),
    uploadedAt: result.blobs[0].uploadedAt,
  };
}

export async function saveParsedRecipes(recipes: Recipe[]) {
  await put(PARSED_RECIPES_KEY, JSON.stringify(recipes), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
}

export async function getParsedRecipes(): Promise<Recipe[] | null> {
  const result = await list({ prefix: PARSED_RECIPES_PREFIX });
  const target = result.blobs.find((b) => b.pathname === PARSED_RECIPES_KEY);
  if (!target) return null;
  const response = await fetch(`${target.url}?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as Recipe[];
}

export async function deleteParsedRecipes() {
  const result = await list({ prefix: PARSED_RECIPES_PREFIX });
  for (const blob of result.blobs) {
    await del(blob.url);
  }
}

export async function saveRules(rules: unknown) {
  const blob = await put(RULES_KEY, JSON.stringify(rules, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
  return blob;
}

export async function getRules(): Promise<unknown | null> {
  const result = await list({ prefix: RULES_PREFIX });
  if (result.blobs.length === 0) return null;
  const canonical = result.blobs.find((b) => b.pathname === RULES_KEY);
  const target = canonical ?? result.blobs[0];
  const response = await fetch(`${target.url}?t=${Date.now()}`, {
    cache: "no-store",
  });
  return response.json();
}
