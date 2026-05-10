import { SupabaseAuditLogsRepository } from "@/infra/repositories/supabase-audit-logs.repository";
import { authorizeRequest } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, internalServerError, unauthorized } from "@/lib/http/errors";
import { z } from "zod";
import { buildConflictPayload, buildMergedUpdate } from "./optimistic-conflict";

const patchBatchSchema = z
  .object({
    establishmentId: z.string().uuid(),
    actorUserId: z.string().uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    quarantined: z.boolean().optional(),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    merge: z
      .object({
        strategy: z.enum(["client_wins", "field_level"]),
        resolved: z
          .object({
            quarantined: z.boolean().optional(),
            expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .refine((v) => v.quarantined !== undefined || v.expiryDate !== undefined, {
    message: "At least one field must be provided: quarantined or expiryDate.",
  });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    const { batchId } = await context.params;
    const payload = patchBatchSchema.parse(await request.json());
    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "inventory.write",
    });
    if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const auditLogsRepository = new SupabaseAuditLogsRepository(client);

    const { data: currentBatch, error: currentBatchError } = await client
      .from("batches")
      .select("id, establishment_id, quarantined, expiry_date, version")
      .eq("id", batchId)
      .eq("establishment_id", payload.establishmentId)
      .maybeSingle();

    if (currentBatchError) {
      return internalServerError();
    }
    if (!currentBatch) {
      return NextResponse.json({ error: "Batch not found." }, { status: 404 });
    }

    const hasVersionExpectation = payload.expectedVersion !== undefined;
    const currentVersion = Number(currentBatch.version);
    const hasVersionConflict =
      hasVersionExpectation && payload.expectedVersion !== currentVersion;

    if (hasVersionConflict && !payload.merge) {
      const expectedVersion = payload.expectedVersion as number;
      const conflict = buildConflictPayload({
        entityId: batchId,
        expectedVersion,
        currentVersion,
        clientChanges: {
          quarantined: payload.quarantined,
          expiryDate: payload.expiryDate,
        },
        serverState: {
          quarantined: Boolean(currentBatch.quarantined),
          expiryDate: String(currentBatch.expiry_date),
        },
      });

      return NextResponse.json(
        {
          error: "Optimistic concurrency conflict.",
          code: "OPTIMISTIC_CONFLICT",
          conflict,
        },
        { status: 409 },
      );
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const mergedUpdate = buildMergedUpdate({
      clientChanges: {
        quarantined: payload.quarantined,
        expiryDate: payload.expiryDate,
      },
      merge: payload.merge,
    });
    if (mergedUpdate.quarantined !== undefined) updates.quarantined = mergedUpdate.quarantined;
    if (mergedUpdate.expiryDate !== undefined) updates.expiry_date = mergedUpdate.expiryDate;
    updates.version = currentVersion + 1;

    const { data: updatedBatch, error: updateError } = await client
      .from("batches")
      .update(updates)
      .eq("id", batchId)
      .eq("establishment_id", payload.establishmentId)
      .eq("version", currentVersion)
      .select("*")
      .maybeSingle();

    if (updateError) {
      return internalServerError();
    }
    if (!updatedBatch) {
      return NextResponse.json(
        {
          error: "Optimistic concurrency conflict while applying merge.",
          code: "OPTIMISTIC_CONFLICT_RETRY",
        },
        { status: 409 },
      );
    }

    if (
      payload.quarantined !== undefined &&
      payload.quarantined !== Boolean(currentBatch.quarantined)
    ) {
      await auditLogsRepository.create({
        establishmentId: payload.establishmentId,
        entityType: "batch",
        entityId: batchId,
        action: "quarantine_updated",
        actorUserId: auth.session.userId,
        payload: {
          before: { quarantined: currentBatch.quarantined },
          after: { quarantined: payload.quarantined },
        },
      });
    }

    if (
      payload.expiryDate !== undefined &&
      payload.expiryDate !== String(currentBatch.expiry_date)
    ) {
      await auditLogsRepository.create({
        establishmentId: payload.establishmentId,
        entityType: "batch",
        entityId: batchId,
        action: "expiry_date_corrected",
        actorUserId: auth.session.userId,
        payload: {
          before: { expiryDate: currentBatch.expiry_date },
          after: { expiryDate: payload.expiryDate },
        },
      });
    }

    return NextResponse.json({ data: updatedBatch });
  } catch (error) {
    return handleRouteError(error);
  }
}








