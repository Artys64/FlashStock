import { SupabaseAuditLogsRepository } from "@/infra/repositories/supabase-audit-logs.repository";
import { requireAuthSession } from "@/lib/auth/session";
import { handleRouteError, unauthorized } from "@/lib/http/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type AcceptInvitationOutcome =
  | "accepted"
  | "already_accepted_self"
  | "already_accepted_other"
  | "revoked"
  | "expired"
  | "email_mismatch"
  | "not_found"
  | "invalid_status"
  | "missing_email"
  | "unauthenticated";

type AcceptInvitationRow = {
  outcome: AcceptInvitationOutcome;
  invitation_id: string | null;
  establishment_id: string | null;
  role_id: string | null;
  user_id: string | null;
};

const acceptInvitationSchema = z.object({
  invitationId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = acceptInvitationSchema.parse(await request.json());

    const auth = await requireAuthSession(request);
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });

    const { data, error } = await client.rpc("accept_establishment_invitation", {
      target_invitation_id: payload.invitationId,
    });

    if (error) throw new Error(error.message);

    const row = (Array.isArray(data) ? data[0] : data) as AcceptInvitationRow | undefined;
    if (!row) {
      return NextResponse.json({ error: "Could not process invitation." }, { status: 500 });
    }

    if (row.outcome === "accepted") {
      if (!row.establishment_id || !row.role_id || !row.user_id || !row.invitation_id) {
        return NextResponse.json({ error: "Could not process invitation." }, { status: 500 });
      }

      const audit = new SupabaseAuditLogsRepository(client);
      await audit.create({
        establishmentId: row.establishment_id,
        entityType: "invitation",
        entityId: row.invitation_id,
        action: "invitation_accepted",
        actorUserId: row.user_id,
        payload: {
          invitationId: row.invitation_id,
          roleId: row.role_id,
          userId: row.user_id,
        },
      });

      await audit.create({
        establishmentId: row.establishment_id,
        entityType: "user_role",
        entityId: row.user_id,
        action: "user_role_updated",
        actorUserId: row.user_id,
        payload: {
          userId: row.user_id,
          roleId: row.role_id,
          source: "invitation_acceptance",
        },
      });

      return NextResponse.json({
        data: {
          accepted: true,
          invitationId: row.invitation_id,
          establishmentId: row.establishment_id,
          roleId: row.role_id,
          userId: row.user_id,
          idempotent: false,
        },
      });
    }

    if (row.outcome === "already_accepted_self") {
      return NextResponse.json({
        data: {
          accepted: true,
          invitationId: row.invitation_id,
          establishmentId: row.establishment_id,
          roleId: row.role_id,
          userId: row.user_id,
          idempotent: true,
        },
      });
    }

    if (row.outcome === "not_found") {
      return NextResponse.json(
        {
          error: "Invitation not found.",
          code: "INVITATION_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    if (row.outcome === "email_mismatch") {
      return NextResponse.json(
        {
          error: "This invitation does not belong to the authenticated user.",
          code: "INVITATION_EMAIL_MISMATCH",
        },
        { status: 403 },
      );
    }

    if (row.outcome === "revoked") {
      return NextResponse.json(
        {
          error: "Invitation has been revoked.",
          code: "INVITATION_REVOKED",
        },
        { status: 409 },
      );
    }

    if (row.outcome === "expired") {
      return NextResponse.json(
        {
          error: "Invitation has expired.",
          code: "INVITATION_EXPIRED",
        },
        { status: 422 },
      );
    }

    if (row.outcome === "already_accepted_other") {
      return NextResponse.json(
        {
          error: "Invitation has already been accepted by another user.",
          code: "INVITATION_ALREADY_ACCEPTED",
        },
        { status: 409 },
      );
    }

    if (row.outcome === "missing_email") {
      return NextResponse.json(
        {
          error: "Authenticated user has no email claim.",
          code: "INVITATION_MISSING_EMAIL",
        },
        { status: 400 },
      );
    }

    if (row.outcome === "unauthenticated") {
      return unauthorized();
    }

    return NextResponse.json(
      {
        error: "Invitation cannot be accepted in its current state.",
        code: "INVITATION_INVALID_STATE",
      },
      { status: 409 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
