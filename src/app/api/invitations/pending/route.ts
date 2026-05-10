import { requireAuthSession } from "@/lib/auth/session";
import { internalServerError, unauthorized } from "@/lib/http/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuthSession(request);
  if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

  const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
  const { data, error } = await client.rpc("list_pending_invitations_for_current_user");
  if (error) return internalServerError();

  return NextResponse.json({ data: data ?? [] });
}
