import { requireAuthSession } from "@/lib/auth/session";
import { handleRouteError, internalServerError, unauthorized } from "@/lib/http/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bootstrapSchema = z.object({
  organizationName: z.string().min(1),
  establishmentName: z.string().min(1),
});

type BootstrapResult = {
  organization_id: string;
  establishment_id: string;
  admin_role_id: string;
  operator_role_id: string;
  user_id: string;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function toBootstrapResponse(row: BootstrapResult) {
  return NextResponse.json(
    {
      data: {
        organizationId: row.organization_id,
        establishmentId: row.establishment_id,
        adminRoleId: row.admin_role_id,
        operatorRoleId: row.operator_role_id,
        userId: row.user_id,
      },
    },
    { status: 201 },
  );
}

function normalizeBootstrapResult(data: unknown): BootstrapResult | null {
  const row = (Array.isArray(data) ? data[0] : data) as BootstrapResult | undefined;
  if (!row) return null;
  if (!row.organization_id || !row.establishment_id || !row.admin_role_id || !row.operator_role_id || !row.user_id) {
    return null;
  }

  return row;
}

function toOperationalBootstrapError(error?: SupabaseLikeError | null): string {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "");

  if (code === "PGRST202" || message.includes("Could not find the function public.bootstrap_establishment_for_current_user")) {
    return "Configuracao de banco incompleta para onboarding. Aplique as migrations mais recentes do Supabase e tente novamente.";
  }

  if (code === "23505") {
    return "Conflito de dados ao criar estabelecimento. Revise o cadastro e tente novamente.";
  }

  return "Falha ao criar organizacao e estabelecimento. Tente novamente em instantes.";
}

async function bootstrapWithServiceRole(input: {
  userId: string;
  organizationName: string;
  establishmentName: string;
}): Promise<{ row: BootstrapResult | null; error: SupabaseLikeError | null }> {
  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return {
      row: null,
      error: {
        code: "SERVICE_ROLE_UNAVAILABLE",
        message: "Missing SUPABASE_SERVICE_ROLE_KEY.",
      },
    };
  }

  let organizationIdForRollback: string | null = null;

  try {
    const normalizedOrganizationName = input.organizationName.trim();
    const normalizedEstablishmentName = input.establishmentName.trim();

    const { data: organization, error: organizationError } = await adminClient
      .from("organizations")
      .insert({ name: normalizedOrganizationName })
      .select("id")
      .single();
    if (organizationError || !organization?.id) throw organizationError ?? { message: "Organization create failed." };
    organizationIdForRollback = String(organization.id);

    const { data: establishment, error: establishmentError } = await adminClient
      .from("establishments")
      .insert({
        organization_id: organizationIdForRollback,
        name: normalizedEstablishmentName,
      })
      .select("id")
      .single();
    if (establishmentError || !establishment?.id) throw establishmentError ?? { message: "Establishment create failed." };

    const establishmentId = String(establishment.id);

    const { data: adminRole, error: adminRoleError } = await adminClient
      .from("roles")
      .insert({
        organization_id: organizationIdForRollback,
        name: "admin",
      })
      .select("id")
      .single();
    if (adminRoleError || !adminRole?.id) throw adminRoleError ?? { message: "Admin role create failed." };

    const { data: operatorRole, error: operatorRoleError } = await adminClient
      .from("roles")
      .insert({
        organization_id: organizationIdForRollback,
        name: "operador",
      })
      .select("id")
      .single();
    if (operatorRoleError || !operatorRole?.id) throw operatorRoleError ?? { message: "Operator role create failed." };

    const adminRoleId = String(adminRole.id);
    const operatorRoleId = String(operatorRole.id);

    const { data: permissions, error: permissionsError } = await adminClient.from("permissions").select("id, code");
    if (permissionsError) throw permissionsError;

    const permissionRows = (permissions ?? []) as Array<{ id: string; code: string }>;
    const adminPermissionRows = permissionRows.map((item) => ({ role_id: adminRoleId, permission_id: item.id }));
    const operatorAllowedCodes = new Set(["inventory.read", "inventory.write", "movements.read", "movements.write"]);
    const operatorPermissionRows = permissionRows
      .filter((item) => operatorAllowedCodes.has(item.code))
      .map((item) => ({ role_id: operatorRoleId, permission_id: item.id }));

    if (adminPermissionRows.length > 0) {
      const { error: adminPermissionsError } = await adminClient.from("role_permissions").insert(adminPermissionRows);
      if (adminPermissionsError) throw adminPermissionsError;
    }

    if (operatorPermissionRows.length > 0) {
      const { error: operatorPermissionsError } = await adminClient.from("role_permissions").insert(operatorPermissionRows);
      if (operatorPermissionsError) throw operatorPermissionsError;
    }

    const { error: userRoleError } = await adminClient.from("user_roles").insert({
      user_id: input.userId,
      establishment_id: establishmentId,
      role_id: adminRoleId,
    });
    if (userRoleError) throw userRoleError;

    const { error: auditError } = await adminClient.from("audit_logs").insert([
      {
        establishment_id: establishmentId,
        entity_type: "organization",
        entity_id: organizationIdForRollback,
        action: "organization_bootstrapped",
        actor_user_id: input.userId,
        payload: {
          organizationId: organizationIdForRollback,
          organizationName: normalizedOrganizationName,
          createdBy: input.userId,
        },
      },
      {
        establishment_id: establishmentId,
        entity_type: "establishment",
        entity_id: establishmentId,
        action: "establishment_bootstrapped",
        actor_user_id: input.userId,
        payload: {
          establishmentId,
          establishmentName: normalizedEstablishmentName,
          organizationId: organizationIdForRollback,
        },
      },
      {
        establishment_id: establishmentId,
        entity_type: "user_role",
        entity_id: input.userId,
        action: "user_role_bootstrapped",
        actor_user_id: input.userId,
        payload: {
          userId: input.userId,
          roleId: adminRoleId,
          establishmentId,
        },
      },
    ]);
    if (auditError) throw auditError;

    return {
      row: {
        organization_id: organizationIdForRollback,
        establishment_id: establishmentId,
        admin_role_id: adminRoleId,
        operator_role_id: operatorRoleId,
        user_id: input.userId,
      },
      error: null,
    };
  } catch (error) {
    if (organizationIdForRollback) {
      await adminClient.from("organizations").delete().eq("id", organizationIdForRollback);
    }

    return {
      row: null,
      error: (error as SupabaseLikeError) ?? { message: "Unknown bootstrap fallback error." },
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = bootstrapSchema.parse(await request.json());
    const auth = await requireAuthSession(request);
    if (auth.response) return auth.response;
    if (!auth.session) return unauthorized();

    const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });
    const { data, error } = await client.rpc("bootstrap_establishment_for_current_user", {
      target_organization_name: payload.organizationName,
      target_establishment_name: payload.establishmentName,
    });
    const row = normalizeBootstrapResult(data);
    if (!error && row) {
      return toBootstrapResponse(row);
    }

    const fallback = await bootstrapWithServiceRole({
      userId: auth.session.userId,
      organizationName: payload.organizationName,
      establishmentName: payload.establishmentName,
    });
    if (fallback.row) {
      return toBootstrapResponse(fallback.row);
    }

    const operationError = fallback.error ?? error;
    console.error("[onboarding/bootstrap] failed", {
      rpcError: error,
      fallbackError: fallback.error,
      userId: auth.session.userId,
    });
    return internalServerError(toOperationalBootstrapError(operationError));
  } catch (error) {
    return handleRouteError(error);
  }
}
