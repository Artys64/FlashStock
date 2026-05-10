import { NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE } from "@/lib/auth/cookies";

export async function POST() {
  const response = NextResponse.json({ data: { ok: true } });
  response.cookies.set(AUTH_ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(AUTH_REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
