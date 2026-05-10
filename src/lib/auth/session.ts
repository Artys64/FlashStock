import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { AUTH_ACCESS_COOKIE } from "./cookies";
import { unauthorized } from "@/lib/http/errors";

export type AuthSession = {
  accessToken: string;
  userId: string;
};

export async function requireAuthSession(
  request: NextRequest,
): Promise<{ session: AuthSession | null; response: NextResponse | null }> {
  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
  const cookieToken = request.cookies.get(AUTH_ACCESS_COOKIE)?.value?.trim() ?? null;
  const accessToken = bearerToken || cookieToken || "";

  if (!accessToken) {
    return {
      session: null,
      response: unauthorized("Missing auth token."),
    };
  }

  const authClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser(accessToken);

  if (error || !data.user) {
    return {
      session: null,
      response: unauthorized(),
    };
  }

  return {
    session: {
      accessToken,
      userId: data.user.id,
    },
    response: null,
  };
}
