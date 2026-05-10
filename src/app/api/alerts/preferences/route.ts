import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, handleRouteError, unauthorized } from "@/lib/http/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  establishmentId: z.string().uuid(),
});

const updateSchema = z.object({
  establishmentId: z.string().uuid(),
  criticalOnly: z.boolean(),
  dailyDigest: z.boolean(),
  muteNonExpired: z.boolean(),
});

type PreferenceRow = {
  critical_only: boolean;
  daily_digest: boolean;
  mute_non_expired: boolean;
};

export async function GET(request: NextRequest) {
  try {
    const payload = querySchema.parse({
      establishmentId: request.nextUrl.searchParams.get("establishmentId"),
    });

    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "inventory.read",
    });
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const { data, error } = await client
      .from("alert_notification_preferences")
      .select("critical_only, daily_digest, mute_non_expired")
      .eq("establishment_id", payload.establishmentId)
      .eq("user_id", auth.session.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const row = data as PreferenceRow | null;
    return NextResponse.json({
      data: {
        criticalOnly: row?.critical_only ?? false,
        dailyDigest: row?.daily_digest ?? true,
        muteNonExpired: row?.mute_non_expired ?? false,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(error.issues[0]?.message ?? "Invalid query params.");
    }
    return handleRouteError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = updateSchema.parse(await request.json());

    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "inventory.write",
    });
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const { error } = await client.from("alert_notification_preferences").upsert(
      {
        establishment_id: payload.establishmentId,
        user_id: auth.session.userId,
        critical_only: payload.criticalOnly,
        daily_digest: payload.dailyDigest,
        mute_non_expired: payload.muteNonExpired,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "establishment_id,user_id" },
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({
      data: {
        criticalOnly: payload.criticalOnly,
        dailyDigest: payload.dailyDigest,
        muteNonExpired: payload.muteNonExpired,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

