import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, internalServerError, unauthorized } from "@/lib/http/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function parseLimit(value: string | null): number {
  if (!value) return 20;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return 20;
  return Math.min(n, 20);
}

function movementLabel(input: string): string {
  if (input === "entry_purchase") return "registrou entrada";
  if (input === "exit_sale") return "registrou saida para venda";
  if (input === "exit_loss") return "descartou";
  return "realizou ajuste";
}

function buildAuditMessage(input: { action: string; payload: Record<string, unknown> }): string {
  if (input.action === "quarantine_updated") {
    const after = input.payload.after as Record<string, unknown> | undefined;
    return `Usuario alterou quarentena para ${after?.quarantined ? "Sim" : "Nao"}.`;
  }
  if (input.action === "expiry_date_corrected") {
    const after = input.payload.after as Record<string, unknown> | undefined;
    return `Usuario corrigiu validade para ${String(after?.expiryDate ?? "-")}.`;
  }
  if (input.action === "alert_snoozed") {
    return `Usuario silenciou alerta ate ${String(input.payload.snoozedUntil ?? "-")}.`;
  }
  return "Usuario realizou atualizacao de auditoria.";
}

export async function GET(request: NextRequest) {
  const establishmentId = request.nextUrl.searchParams.get("establishmentId");
  if (!establishmentId) return badRequest("Missing establishmentId query param.");

  const auth = await authorizeRequest({
    request,
    establishmentId,
    permission: "audit.read",
  });
  if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });

  const { data: movementData, error: movementError } = await client
    .from("inventory_movements")
    .select("id, batch_id, product_id, movement_type, quantity, created_at, reason_code")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (movementError) return internalServerError();

  const { data: auditData, error: auditError } = await client
    .from("audit_logs")
    .select("id, entity_id, action, payload, created_at")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (auditError) return internalServerError();

  const movementRows = (movementData ?? []) as Array<Record<string, unknown>>;
  const auditRows = (auditData ?? []) as Array<Record<string, unknown>>;
  const productIds = Array.from(new Set(movementRows.map((row) => String(row.product_id))));
  const batchIds = Array.from(new Set(movementRows.map((row) => String(row.batch_id))));

  const [{ data: products, error: productsError }, { data: batches, error: batchesError }] =
    await Promise.all([
      client.from("products").select("id, name, uom").in("id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]),
      client.from("batches").select("id, lot_code").in("id", batchIds.length ? batchIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);

  if (productsError || batchesError) return internalServerError();

  const productMap = new Map<string, { name: string; uom: string }>();
  for (const row of products ?? []) {
    const product = row as Record<string, unknown>;
    productMap.set(String(product.id), {
      name: String(product.name),
      uom: String(product.uom),
    });
  }

  const batchMap = new Map<string, string>();
  for (const row of batches ?? []) {
    const batch = row as Record<string, unknown>;
    batchMap.set(String(batch.id), String(batch.lot_code));
  }

  const movementItems = movementRows.map((row) => {
    const product = productMap.get(String(row.product_id));
    const lotCode = batchMap.get(String(row.batch_id)) ?? "-";
    const qty = Number(row.quantity);
    const uom = product?.uom ?? "un";
    const productName = product?.name ?? "Produto";
    const movementType = String(row.movement_type);
    const reasonCode = row.reason_code ? String(row.reason_code) : null;

    const message = `Usuario ${movementLabel(movementType)} ${qty}${uom} de ${productName} (Lote ${lotCode})${reasonCode ? ` por ${reasonCode}` : ""}.`;

    return {
      at: String(row.created_at),
      actorName: "Usuario",
      actorRole: "Operador",
      action: movementType,
      message,
      references: {
        movementId: String(row.id),
        batchId: String(row.batch_id),
        productId: String(row.product_id),
      },
    };
  });

  const auditItems = auditRows.map((row) => {
    const payload = (row.payload as Record<string, unknown>) ?? {};
    return {
      at: String(row.created_at),
      actorName: "Usuario",
      actorRole: "Operador",
      action: String(row.action),
      message: buildAuditMessage({
        action: String(row.action),
        payload,
      }),
      references: {
        movementId: String(row.id),
        batchId: String(row.entity_id),
        productId: "",
      },
    };
  });

  const merged = [...movementItems, ...auditItems]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);

  return NextResponse.json({ data: merged });
}
