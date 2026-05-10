import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_ACCESS_COOKIE } from "@/lib/auth/cookies";

const PUBLIC_PATHS = new Set(["/", "/login"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isPublic = PUBLIC_PATHS.has(pathname);
  const hasSession = Boolean(request.cookies.get(AUTH_ACCESS_COOKIE)?.value);

  if (!isApi && !isPublic && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/batches", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
