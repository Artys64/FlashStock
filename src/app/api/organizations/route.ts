import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthSession } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, internalServerError, unauthorized } from "@/lib/http/errors";
import { z } from "zod";

const createOrganizationSchema = z.object({
  name: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthSession(request);
    if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

    const payload = createOrganizationSchema.parse(await request.json());
    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const { data, error } = await client
      .from("organizations")
      .insert({ name: payload.name })
      .select()
      .single();
    if (error) return internalServerError();
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}








