import { NextResponse } from "next/server";
import { uploadRecipePdf } from "@/lib/blob";
import { parsePdfBuffer } from "@/lib/pdf-parser";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const blob = await uploadRecipePdf(buffer, file.name);

  let recipeCount = 0;
  try {
    const recipes = await parsePdfBuffer(buffer);
    recipeCount = recipes.length;
  } catch {
    // PDF uploaded but parsing may need refinement
  }

  return NextResponse.json({
    success: true,
    url: blob.url,
    filename: file.name,
    recipeCount,
  });
}
