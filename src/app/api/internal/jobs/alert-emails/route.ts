import { shouldTriggerAlertMilestone } from "@/core/domain/notification-rules";
import { badRequest, handleRouteError, internalServerError, unauthorized } from "@/lib/http/errors";
import { buildExpiryAlertEmail, ExpiryAlertEmailStatus } from "@/lib/notifications/expiry-alert-template";
import { isEmailNotificationsEnabled, sendEmail } from "@/lib/notifications/email";
import { computeNextRetryAt, MAX_EMAIL_RETRY_ATTEMPTS } from "@/lib/notifications/retry-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { diffDaysIsoDate, getTodayInOperationTimezone } from "@/lib/time/business-date";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type BatchRow = {
  id: string;
  establishment_id: string;
  product_id: string;
  lot_code: string;
  expiry_date: string;
  quantity_current: number;
  quarantined: boolean;
  created_at: string;
};

type ProductRow = {
  id: string;
  name: string;
};

type EstablishmentRow = {
  id: string;
  organization_id: string;
  name: string;
};

type SnoozeRow = {
  batch_id: string;
  snoozed_until: string;
};

type PreferenceRow = {
  establishment_id: string;
  user_id: string;
  critical_only: boolean;
  mute_non_expired: boolean;
};

type RolePermissionRow = {
  user_id: string;
  establishment_id: string;
  roles:
    | {
        role_permissions?: Array<{ permissions?: { code?: string } | null }>;
      }
    | Array<{
        role_permissions?: Array<{ permissions?: { code?: string } | null }>;
      }>
    | null;
};

type NotificationKind = "alert_milestone" | "expired_daily" | "quarantine_daily";

type QueuedNotificationRow = {
  id: string;
  organization_id: string;
  establishment_id: string;
  user_id: string;
  batch_id: string;
  notification_kind: NotificationKind;
  milestone_days: number | null;
  recipient_email: string;
  attempts: number;
  payload: Record<string, unknown> | null;
};

const querySchema = z.object({
  establishmentId: z.string().uuid().optional(),
});

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const headerSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
  const authorization = request.headers.get("authorization");
  const bearerSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  return headerSecret === secret || bearerSecret === secret;
}

function getCreatedDateIso(createdAtIso: string, fallbackTodayIso: string): string {
  const date = new Date(createdAtIso);
  if (Number.isNaN(date.getTime())) return fallbackTodayIso;
  return getTodayInOperationTimezone(date);
}

function resolveNotificationKind(input: {
  batch: BatchRow;
  todayDateIso: string;
}): { kind: NotificationKind; daysUntilExpiry: number; milestoneDays: number | null } | null {
  const daysUntilExpiry = diffDaysIsoDate(input.todayDateIso, input.batch.expiry_date);
  if (input.batch.quarantined) {
    return { kind: "quarantine_daily", daysUntilExpiry, milestoneDays: null };
  }
  if (daysUntilExpiry <= 0) {
    return { kind: "expired_daily", daysUntilExpiry, milestoneDays: null };
  }

  const createdDateIso = getCreatedDateIso(input.batch.created_at, input.todayDateIso);
  const totalShelfLifeDays = Math.max(1, diffDaysIsoDate(createdDateIso, input.batch.expiry_date));
  if (
    shouldTriggerAlertMilestone({
      daysUntilExpiry,
      totalShelfLifeDays,
    })
  ) {
    return { kind: "alert_milestone", daysUntilExpiry, milestoneDays: daysUntilExpiry };
  }

  return null;
}

function getRolePermissionCodes(row: RolePermissionRow): string[] {
  if (!row.roles) return [];
  const roles = Array.isArray(row.roles) ? row.roles : [row.roles];
  const output: string[] = [];
  for (const role of roles) {
    for (const rolePermission of role.role_permissions ?? []) {
      const code = rolePermission.permissions?.code;
      if (typeof code === "string" && code.length > 0) {
        output.push(code);
      }
    }
  }
  return output;
}

function toEmailTemplateStatus(kind: NotificationKind): ExpiryAlertEmailStatus {
  return kind;
}

function getPayloadString(payload: Record<string, unknown> | null, key: string, fallback: string): string {
  const value = payload?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getPayloadNumber(payload: Record<string, unknown> | null, key: string, fallback: number): number {
  const value = payload?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      return unauthorized("Unauthorized cron request.");
    }

    if (!isEmailNotificationsEnabled()) {
      return internalServerError("Email provider is not configured.");
    }

    const payload = querySchema.parse({
      establishmentId: request.nextUrl.searchParams.get("establishmentId") ?? undefined,
    });

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return internalServerError("Supabase service role is not configured.");
    }

    const operationId = crypto.randomUUID();
    const now = new Date();
    const nowIso = now.toISOString();
    const todayDateIso = getTodayInOperationTimezone(now);

    let batchesQuery = adminClient
      .from("batches")
      .select("id, establishment_id, product_id, lot_code, expiry_date, quantity_current, quarantined, created_at")
      .is("archived_at", null)
      .gt("quantity_current", 0);

    if (payload.establishmentId) {
      batchesQuery = batchesQuery.eq("establishment_id", payload.establishmentId);
    }

    const { data: rawBatches, error: batchesError } = await batchesQuery;
    if (batchesError) return internalServerError();
    const batches = (rawBatches ?? []) as BatchRow[];

    const summary = {
      operationId,
      scannedBatches: batches.length,
      enqueued: 0,
      notified: 0,
      failed: 0,
      skipped: 0,
      deduplicated: 0,
      retried: 0,
    };

    if (batches.length > 0) {
      const establishmentIds = Array.from(new Set(batches.map((batch) => batch.establishment_id)));
      const productIds = Array.from(new Set(batches.map((batch) => batch.product_id)));

      const [{ data: rawProducts, error: productsError }, { data: rawEstablishments, error: establishmentsError }] =
        await Promise.all([
          adminClient.from("products").select("id, name").in("id", productIds),
          adminClient
            .from("establishments")
            .select("id, organization_id, name")
            .in("id", establishmentIds),
        ]);

      if (productsError || establishmentsError) return internalServerError();

      const productById = new Map<string, ProductRow>(
        ((rawProducts ?? []) as ProductRow[]).map((row) => [row.id, row]),
      );
      const establishmentById = new Map<string, EstablishmentRow>(
        ((rawEstablishments ?? []) as EstablishmentRow[]).map((row) => [row.id, row]),
      );

      const { data: rawRoleRows, error: roleRowsError } = await adminClient
        .from("user_roles")
        .select(
          `
          user_id,
          establishment_id,
          roles!inner(
            role_permissions!inner(
              permissions!inner(code)
            )
          )
        `,
        )
        .in("establishment_id", establishmentIds);

      if (roleRowsError) return internalServerError();

      const recipientsByEstablishment = new Map<string, Set<string>>();
      for (const row of (rawRoleRows ?? []) as RolePermissionRow[]) {
        const codes = getRolePermissionCodes(row);
        if (!codes.includes("inventory.read")) continue;
        const current = recipientsByEstablishment.get(row.establishment_id) ?? new Set<string>();
        current.add(row.user_id);
        recipientsByEstablishment.set(row.establishment_id, current);
      }

      const recipientUserIds = Array.from(
        new Set(
          Array.from(recipientsByEstablishment.values())
            .flatMap((set) => Array.from(set))
            .filter(Boolean),
        ),
      );

      const [{ data: rawPreferences, error: preferencesError }, { data: rawSnoozes, error: snoozesError }] =
        await Promise.all([
          recipientUserIds.length > 0
            ? adminClient
                .from("alert_notification_preferences")
                .select("establishment_id, user_id, critical_only, mute_non_expired")
                .in("establishment_id", establishmentIds)
                .in("user_id", recipientUserIds)
            : Promise.resolve({ data: [], error: null }),
          adminClient
            .from("batch_alert_snoozes")
            .select("batch_id, snoozed_until")
            .in("establishment_id", establishmentIds)
            .in("batch_id", batches.map((batch) => batch.id)),
        ]);

      if (preferencesError || snoozesError) return internalServerError();

      const preferenceByScope = new Map<string, PreferenceRow>();
      for (const row of (rawPreferences ?? []) as PreferenceRow[]) {
        preferenceByScope.set(`${row.establishment_id}:${row.user_id}`, row);
      }

      const activeSnoozeByBatch = new Map<string, string>();
      for (const row of (rawSnoozes ?? []) as SnoozeRow[]) {
        if (row.snoozed_until > nowIso) {
          activeSnoozeByBatch.set(row.batch_id, row.snoozed_until);
        }
      }

      const userEmailById = new Map<string, string>();
      await Promise.all(
        recipientUserIds.map(async (userId) => {
          const { data, error } = await adminClient.auth.admin.getUserById(userId);
          if (error) return;
          const email = data.user?.email?.trim().toLowerCase() ?? "";
          if (email) userEmailById.set(userId, email);
        }),
      );

      for (const batch of batches) {
        const establishment = establishmentById.get(batch.establishment_id);
        if (!establishment) {
          summary.skipped += 1;
          continue;
        }

        const product = productById.get(batch.product_id);
        const productName = product?.name ?? "Produto";
        const notification = resolveNotificationKind({ batch, todayDateIso });
        if (!notification) continue;

        const recipients = recipientsByEstablishment.get(batch.establishment_id);
        if (!recipients || recipients.size === 0) {
          summary.skipped += 1;
          continue;
        }

        const batchIsSnoozed = activeSnoozeByBatch.has(batch.id);
        for (const userId of recipients) {
          const recipientEmail = userEmailById.get(userId);
          if (!recipientEmail) {
            summary.skipped += 1;
            continue;
          }

          const preference = preferenceByScope.get(`${batch.establishment_id}:${userId}`);
          const criticalOnly = preference?.critical_only ?? false;
          const muteNonExpired = preference?.mute_non_expired ?? false;

          if (
            notification.kind === "alert_milestone" &&
            (criticalOnly || muteNonExpired || batchIsSnoozed)
          ) {
            summary.skipped += 1;
            continue;
          }

          const { error: insertError } = await adminClient.from("alert_email_notifications").insert({
            organization_id: establishment.organization_id,
            establishment_id: batch.establishment_id,
            user_id: userId,
            batch_id: batch.id,
            notification_kind: notification.kind,
            milestone_days: notification.milestoneDays,
            operation_date: todayDateIso,
            recipient_email: recipientEmail,
            status: "pending",
            attempts: 0,
            next_retry_at: nowIso,
            payload: {
              operationId,
              productId: batch.product_id,
              productName,
              lotCode: batch.lot_code,
              expiryDate: batch.expiry_date,
              daysUntilExpiry: notification.daysUntilExpiry,
              establishmentName: establishment.name,
            },
            updated_at: nowIso,
          });

          if (insertError) {
            if ((insertError as { code?: string }).code === "23505") {
              summary.deduplicated += 1;
              continue;
            }
            summary.failed += 1;
            continue;
          }

          summary.enqueued += 1;
        }
      }
    }

    let dueNotificationsQuery = adminClient
      .from("alert_email_notifications")
      .select(
        "id, organization_id, establishment_id, user_id, batch_id, notification_kind, milestone_days, recipient_email, attempts, payload",
      )
      .in("status", ["pending", "failed"])
      .lt("attempts", MAX_EMAIL_RETRY_ATTEMPTS)
      .lte("next_retry_at", nowIso)
      .order("created_at", { ascending: true })
      .limit(500);

    if (payload.establishmentId) {
      dueNotificationsQuery = dueNotificationsQuery.eq("establishment_id", payload.establishmentId);
    }

    const { data: rawDueNotifications, error: dueNotificationsError } = await dueNotificationsQuery;
    if (dueNotificationsError) return internalServerError();

    const dueNotifications = (rawDueNotifications ?? []) as QueuedNotificationRow[];
    const auditRows: Array<{
      establishment_id: string;
      entity_type: string;
      entity_id: string;
      action: string;
      actor_user_id: string | null;
      payload: Record<string, unknown>;
    }> = [];

    for (const notification of dueNotifications) {
      const payloadData = notification.payload;
      const productName = getPayloadString(payloadData, "productName", "Produto");
      const lotCode = getPayloadString(payloadData, "lotCode", "-");
      const expiryDate = getPayloadString(payloadData, "expiryDate", "-");
      const establishmentName = getPayloadString(payloadData, "establishmentName", "Estabelecimento");
      const daysUntilExpiry = getPayloadNumber(payloadData, "daysUntilExpiry", 0);
      const attemptsAfterSend = notification.attempts + 1;

      if (notification.attempts > 0) {
        summary.retried += 1;
      }

      try {
        const emailMessage = buildExpiryAlertEmail({
          status: toEmailTemplateStatus(notification.notification_kind),
          productName,
          lotCode,
          expiryDate,
          daysUntilExpiry,
          establishmentName,
        });
        const providerResult = await sendEmail({
          to: notification.recipient_email,
          subject: emailMessage.subject,
          text: emailMessage.text,
        });

        const { error: updateSentError } = await adminClient
          .from("alert_email_notifications")
          .update({
            status: "sent",
            attempts: attemptsAfterSend,
            provider_message_id: providerResult.messageId,
            sent_at: new Date().toISOString(),
            last_attempt_at: new Date().toISOString(),
            next_retry_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", notification.id);
        if (updateSentError) return internalServerError();

        auditRows.push({
          establishment_id: notification.establishment_id,
          entity_type: "batch",
          entity_id: notification.batch_id,
          action: "alert_email_sent",
          actor_user_id: null,
          payload: {
            operationId,
            organizationId: notification.organization_id,
            establishmentId: notification.establishment_id,
            userId: notification.user_id,
            notificationKind: notification.notification_kind,
            milestoneDays: notification.milestone_days,
            recipientEmail: notification.recipient_email,
            attempts: attemptsAfterSend,
          },
        });

        summary.notified += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown email error";
        const nextRetryAt = computeNextRetryAt({
          failedAttempts: attemptsAfterSend,
          now: new Date(),
        });

        const { error: updateFailedError } = await adminClient
          .from("alert_email_notifications")
          .update({
            status: "failed",
            attempts: attemptsAfterSend,
            last_error: errorMessage,
            last_attempt_at: new Date().toISOString(),
            next_retry_at: nextRetryAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", notification.id);
        if (updateFailedError) return internalServerError();

        auditRows.push({
          establishment_id: notification.establishment_id,
          entity_type: "batch",
          entity_id: notification.batch_id,
          action: "alert_email_failed",
          actor_user_id: null,
          payload: {
            operationId,
            organizationId: notification.organization_id,
            establishmentId: notification.establishment_id,
            userId: notification.user_id,
            notificationKind: notification.notification_kind,
            milestoneDays: notification.milestone_days,
            recipientEmail: notification.recipient_email,
            attempts: attemptsAfterSend,
            nextRetryAt,
            error: errorMessage,
          },
        });

        summary.failed += 1;
      }
    }

    if (auditRows.length > 0) {
      const { error: auditError } = await adminClient.from("audit_logs").insert(auditRows);
      if (auditError) return internalServerError();
    }

    return NextResponse.json({ data: summary });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(error.issues[0]?.message ?? "Invalid query params.");
    }
    return handleRouteError(error);
  }
}
