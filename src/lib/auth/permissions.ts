import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PermissionCode =
  | "inventory.read"
  | "inventory.write"
  | "movements.read"
  | "movements.write"
  | "audit.read"
  | "admin.manage";

export async function hasPermission(input: {
  accessToken: string;
  userId: string;
  establishmentId: string;
  permission: PermissionCode;
}): Promise<boolean> {
  const client = createSupabaseServerClient({ accessToken: input.accessToken });

  const { data, error } = await client
    .from("user_roles")
    .select(
      `
      role_id,
      roles!inner(
        role_permissions!inner(
          permissions!inner(code)
        )
      )
    `,
    )
    .eq("user_id", input.userId)
    .eq("establishment_id", input.establishmentId);

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const role = (row as { roles?: unknown }).roles as
      | { role_permissions?: Array<{ permissions?: { code?: string } }> }
      | undefined;
    for (const rp of role?.role_permissions ?? []) {
      if (rp.permissions?.code === input.permission) return true;
    }
  }

  return false;
}
