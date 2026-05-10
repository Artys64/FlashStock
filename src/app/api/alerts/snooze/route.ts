import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, handleRouteError, unauthorized } from "@/lib/http/errors";
import { isExpired, parseSnoozeHours, computeSnoozedUntil } from "@/lib/inventory/alerts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const snoozeSchema = z.object({
  establishmentId: z.string().uuid(),
  batchId: z.string().uuid(),
  hours: z.union([z.literal(24), z.literal(48)]),
  reason: z.string().trim().min(1).max(280).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = snoozeSchema.parse(await request.json());
    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "inventory.write",
    });
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });

    const { data: batch, error: batchError } = await client
      .from("batches")
      .select("id, expiry_date")
      .eq("id", payload.batchId)
      .eq("establishment_id", payload.establishmentId)
      .is("archived_at", null)
      .maybeSingle();

    if (batchError) throw new Error(batchError.message);
    if (!batch) return badRequest("Batch not found for establishment.");

    if (isExpired(String(batch.expiry_date))) {
      return NextResponse.json(
        {
          error: "Cannot snooze expired batch.",
          code: "SNOOZE_NOT_ALLOWED_FOR_EXPIRED",
        },
        { status: 422 },
      );
    }

    const hours = parseSnoozeHours(payload.hours);
    if (!hours) return badRequest("hours must be 24 or 48.");

    const snoozedUntil = computeSnoozedUntil(hours);

    const { error: upsertError } = await client.from("batch_alert_snoozes").upsert(
      {
        batch_id: payload.batchId,
        establishment_id: payload.establishmentId,
        snoozed_until: snoozedUntil,
        reason: payload.reason ?? null,
        actor_user_id: auth.session.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "batch_id" },
    );

    if (upsertError) throw new Error(upsertError.message);

    await client.from("audit_logs").insert({
      establishment_id: payload.establishmentId,
      entity_type: "batch",
      entity_id: payload.batchId,
      action: "alert_snoozed",
      actor_user_id: auth.session.userId,
      payload: {
        hours,
        snoozedUntil,
        reason: payload.reason ?? null,
      },
    });

    return NextResponse.json({
      data: {
        batchId: payload.batchId,
        snoozedUntil,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
