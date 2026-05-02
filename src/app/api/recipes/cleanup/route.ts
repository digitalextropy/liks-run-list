import { NextResponse } from "next/server";
import { list, del } from "@vercel/blob";

export async function POST(request: Request) {
  try {
    const { keepUrl } = (await request.json()) as { keepUrl: string };
    const result = await list({ prefix: "recipes/" });
    const toDelete = result.blobs.filter((b) => b.url !== keepUrl);
    for (const blob of toDelete) {
      await del(blob.url);
    }
    return NextResponse.json({ deleted: toDelete.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
