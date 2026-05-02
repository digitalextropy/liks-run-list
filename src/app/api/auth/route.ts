import { NextResponse } from "next/server";
import { verifyPassword, getSessionCookieConfig } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const { password } = body;

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const config = getSessionCookieConfig();
  const response = NextResponse.json({ success: true });
  response.cookies.set(config);
  return response;
}
