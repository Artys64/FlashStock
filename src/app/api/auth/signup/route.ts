import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE } from "@/lib/auth/cookies";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { badRequest, conflict, handleRouteError, internalServerError } from "@/lib/http/errors";

const signupSchema = z.object({
  email: z.string().email("Email inválido."),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres."),
  organizationName: z.string().min(1, "Nome da organização obrigatório.").max(100),
  establishmentName: z.string().min(1, "Nome do estabelecimento obrigatório.").max(100),
});

async function bootstrapViaAdmin(
  adminClient: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  organizationName: string,
  establishmentName: string,
): Promise<void> {
  const { data: org, error: orgErr } = await adminClient
    .from("organizations")
    .insert({ name: organizationName })
    .select("id")
    .single();
  if (orgErr || !org?.id) throw orgErr ?? new Error("Organization create failed.");

  const orgId = String(org.id);

  const { data: est, error: estErr } = await adminClient
    .from("establishments")
    .insert({ organization_id: orgId, name: establishmentName })
    .select("id")
    .single();
  if (estErr || !est?.id) throw estErr ?? new Error("Establishment create failed.");

  const estId = String(est.id);

  const { data: adminRole, error: adminRoleErr } = await adminClient
    .from("roles")
    .insert({ organization_id: orgId, name: "admin" })
    .select("id")
    .single();
  if (adminRoleErr || !adminRole?.id) throw adminRoleErr ?? new Error("Admin role create failed.");

  const { data: opRole, error: opRoleErr } = await adminClient
    .from("roles")
    .insert({ organization_id: orgId, name: "operador" })
    .select("id")
    .single();
  if (opRoleErr || !opRole?.id) throw opRoleErr ?? new Error("Operator role create failed.");

  const adminRoleId = String(adminRole.id);
  const opRoleId = String(opRole.id);

  const { data: permissions, error: permErr } = await adminClient
    .from("permissions")
    .select("id, code");
  if (permErr) throw permErr;

  const perms = (permissions ?? []) as Array<{ id: string; code: string }>;
  const opCodes = new Set(["inventory.read", "inventory.write", "movements.read", "movements.write"]);

  await adminClient
    .from("role_permissions")
    .insert(perms.map((p) => ({ role_id: adminRoleId, permission_id: p.id })));
  await adminClient
    .from("role_permissions")
    .insert(perms.filter((p) => opCodes.has(p.code)).map((p) => ({ role_id: opRoleId, permission_id: p.id })));

  const { error: urErr } = await adminClient
    .from("user_roles")
    .insert({ user_id: userId, establishment_id: estId, role_id: adminRoleId });
  if (urErr) throw urErr;
}

export async function POST(request: NextRequest) {
  try {
    const payload = signupSchema.parse(await request.json());

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return internalServerError("Serviço indisponível.");
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
    });

    if (createError) {
      const msg = createError.message ?? "";
      if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already been registered")) {
        return conflict("Email já cadastrado.");
      }
      return badRequest("Falha ao criar conta.");
    }

    const anonClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: false },
    });
    const { data: signIn, error: signInError } = await anonClient.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    });

    if (signInError || !signIn.session) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return internalServerError("Conta criada, mas falha ao autenticar.");
    }

    const serverClient = createSupabaseServerClient({ accessToken: signIn.session.access_token });
    const { data: rpcData, error: rpcError } = await serverClient.rpc(
      "bootstrap_establishment_for_current_user",
      {
        target_organization_name: payload.organizationName.trim(),
        target_establishment_name: payload.establishmentName.trim(),
      },
    );

    const bootstrapped = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (rpcError || !bootstrapped?.organization_id) {
      try {
        await bootstrapViaAdmin(
          adminClient,
          created.user.id,
          payload.organizationName.trim(),
          payload.establishmentName.trim(),
        );
      } catch (bootstrapErr) {
        console.error("[auth/signup] bootstrap failed", bootstrapErr);
        await adminClient.auth.admin.deleteUser(created.user.id);
        return internalServerError("Falha ao configurar organização.");
      }
    }

    const response = NextResponse.json({ data: { userId: created.user.id } }, { status: 201 });

    response.cookies.set(AUTH_ACCESS_COOKIE, signIn.session.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: signIn.session.expires_in ?? 3600,
    });
    response.cookies.set(AUTH_REFRESH_COOKIE, signIn.session.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
