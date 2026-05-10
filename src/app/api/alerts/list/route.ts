import { computeBatchStatus } from "@/core/domain/rules";
import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, handleRouteError, internalServerError, unauthorized } from "@/lib/http/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type AlertScope = "all" | "expired" | "alert" | "quarantine";

type BatchRow = {
  id: string;
  lot_code: string;
  expiry_date: string;
  quantity_current: number;
  quarantined: boolean;
  version: number;
  created_at: string;
  products: {
    id: string;
    name: string;
    sku: string;
    category_id: string;
  } | null;
};

type CategoryRow = {
  id: string;
  lead_time_alert_days: number;
};

type SnoozeRow = {
  batch_id: string;
  snoozed_until: string;
};

const querySchema = z.object({
  establishmentId: z.string().uuid(),
  scope: z.enum(["all", "expired", "alert", "quarantine"]).default("all"),
  q: z.string().trim().max(120).optional(),
  productId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

function scopeMatches(scope: AlertScope, status: string): boolean {
  if (scope === "all") return status !== "active";
  return status === scope;
}

function severityRank(input: { status: string; snoozed: boolean }): number {
  if (input.status === "expired") return 0;
  if (input.status === "quarantine") return 1;
  if (input.status === "alert" && !input.snoozed) return 2;
  if (input.status === "alert" && input.snoozed) return 3;
  return 4;
}

export async function GET(request: NextRequest) {
  try {
    const payload = querySchema.parse({
      establishmentId: request.nextUrl.searchParams.get("establishmentId"),
      scope: request.nextUrl.searchParams.get("scope") ?? "all",
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      productId: request.nextUrl.searchParams.get("productId") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? "1",
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? "30",
    });

    const auth = await authorizeRequest({
      request,
      establishmentId: payload.establishmentId,
      permission: "inventory.read",
    });
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    let batchesQuery = client
      .from("batches")
      .select(
        `
        id,
        lot_code,
        expiry_date,
        quantity_current,
        quarantined,
        version,
        created_at,
        products(id, name, sku, category_id)
      `,
      )
      .eq("establishment_id", payload.establishmentId)
      .is("archived_at", null)
      .order("expiry_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (payload.productId) {
      batchesQuery = batchesQuery.eq("product_id", payload.productId);
    }

    const { data: rawBatches, error: batchesError } = await batchesQuery;
    if (batchesError) return internalServerError();

    const batches = (rawBatches ?? []) as unknown as BatchRow[];
    if (batches.length === 0) {
      return NextResponse.json({
        data: [],
        summary: {
          expired: 0,
          alert: 0,
          quarantine: 0,
          total: 0,
          snoozed: 0,
        },
        pagination: {
          page: payload.page,
          pageSize: payload.pageSize,
          total: 0,
          totalPages: 0,
        },
      });
    }

    const categoryIds = Array.from(
      new Set(batches.map((row) => row.products?.category_id).filter(Boolean)),
    ) as string[];

    const { data: rawCategories, error: categoriesError } = await client
      .from("categories")
      .select("id, lead_time_alert_days")
      .in("id", categoryIds.length > 0 ? categoryIds : ["00000000-0000-0000-0000-000000000000"]);

    if (categoriesError) return internalServerError();

    const leadTimeByCategory = new Map<string, number>();
    for (const category of (rawCategories ?? []) as CategoryRow[]) {
      leadTimeByCategory.set(category.id, category.lead_time_alert_days);
    }

    const batchIds = batches.map((item) => item.id);
    const { data: rawSnoozes, error: snoozesError } = await client
      .from("batch_alert_snoozes")
      .select("batch_id, snoozed_until")
      .eq("establishment_id", payload.establishmentId)
      .in("batch_id", batchIds);

    if (snoozesError) return internalServerError();

    const snoozedUntilByBatch = new Map<string, string>();
    for (const snooze of (rawSnoozes ?? []) as SnoozeRow[]) {
      snoozedUntilByBatch.set(snooze.batch_id, snooze.snoozed_until);
    }

    const nowIso = new Date().toISOString();
    const qNormalized = payload.q?.toLowerCase() ?? "";

    const searchable = batches
      .map((batch) => {
        const leadTimeAlertDays = batch.products?.category_id
          ? (leadTimeByCategory.get(batch.products.category_id) ?? 0)
          : 0;
        const status = computeBatchStatus({
          batch: {
            expiryDate: batch.expiry_date,
            quantityCurrent: Number(batch.quantity_current),
            quarantined: batch.quarantined,
          },
          leadTimeAlertDays,
        });
        const snoozedUntil = snoozedUntilByBatch.get(batch.id) ?? null;
        const snoozed = status === "alert" && Boolean(snoozedUntil && snoozedUntil > nowIso);
        return {
          id: batch.id,
          lotCode: batch.lot_code,
          expiryDate: batch.expiry_date,
          quarantined: batch.quarantined,
          version: batch.version,
          createdAt: batch.created_at,
          product: batch.products
            ? {
                id: batch.products.id,
                name: batch.products.name,
                sku: batch.products.sku,
              }
            : null,
          status,
          leadTimeAlertDays,
          snoozedUntil,
          snoozed,
        };
      })
      .filter((item) => scopeMatches(payload.scope, item.status))
      .filter((item) => {
        if (!qNormalized) return true;
        const statusText = item.status.toLowerCase();
        const lotCodeText = item.lotCode.toLowerCase();
        const productNameText = item.product?.name.toLowerCase() ?? "";
        const skuText = item.product?.sku.toLowerCase() ?? "";
        return (
          lotCodeText.includes(qNormalized) ||
          productNameText.includes(qNormalized) ||
          skuText.includes(qNormalized) ||
          statusText.includes(qNormalized)
        );
      });

    const summary = searchable.reduce(
      (acc, item) => {
        if (item.status === "expired") acc.expired += 1;
        if (item.status === "alert") acc.alert += 1;
        if (item.status === "quarantine") acc.quarantine += 1;
        if (item.snoozed) acc.snoozed += 1;
        if (item.status !== "active") acc.total += 1;
        return acc;
      },
      { expired: 0, alert: 0, quarantine: 0, total: 0, snoozed: 0 },
    );

    const scoped = searchable
      .filter((item) => scopeMatches(payload.scope, item.status))
      .sort((left, right) => {
        const bySeverity = severityRank(left) - severityRank(right);
        if (bySeverity !== 0) return bySeverity;
        const byExpiry = left.expiryDate.localeCompare(right.expiryDate);
        if (byExpiry !== 0) return byExpiry;
        const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
        if (byCreatedAt !== 0) return byCreatedAt;
        return left.id.localeCompare(right.id);
      });

    const total = scoped.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / payload.pageSize);
    const offset = (payload.page - 1) * payload.pageSize;
    const pageData = scoped.slice(offset, offset + payload.pageSize);

    return NextResponse.json({
      data: pageData,
      summary,
      pagination: {
        page: payload.page,
        pageSize: payload.pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(error.issues[0]?.message ?? "Invalid query params.");
    }
    return handleRouteError(error);
  }
}
