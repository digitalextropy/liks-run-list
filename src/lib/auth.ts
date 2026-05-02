import { cookies } from "next/headers";

const COOKIE_NAME = "liks_session";
const SESSION_VALUE = "authenticated";

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value === SESSION_VALUE;
}

export function getSessionCookieConfig() {
  return {
    name: COOKIE_NAME,
    value: SESSION_VALUE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

export function verifyPassword(password: string): boolean {
  return password === process.env.AUTH_PASSWORD;
}
