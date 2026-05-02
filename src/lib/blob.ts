import { put, list, del } from "@vercel/blob";

const RECIPE_PDF_PREFIX = "recipes/";
const RULES_KEY = "rules/production-rules.json";

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

export async function saveRules(rules: unknown) {
  const blob = await put(RULES_KEY, JSON.stringify(rules, null, 2), {
    access: "public",
    contentType: "application/json",
  });
  return blob;
}

export async function getRules(): Promise<unknown | null> {
  const result = await list({ prefix: "rules/" });
  if (result.blobs.length === 0) return null;
  const response = await fetch(result.blobs[0].url);
  return response.json();
}
