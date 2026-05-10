import { authorizeRequest } from "@/lib/auth/guard";
import { badRequest, internalServerError, unauthorized } from "@/lib/http/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const establishmentId = request.nextUrl.searchParams.get("establishmentId");
  if (!establishmentId) return badRequest("Missing establishmentId query param.");

  const auth = await authorizeRequest({
    request,
    establishmentId,
    permission: "inventory.write",
  });
  if (auth.response) return auth.response;
  if (!auth.session) return unauthorized();

  const cutoffIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const client = createSupabaseServerClient({ accessToken: auth.session.accessToken });

  const { data: toArchive, error: listError } = await client
    .from("batches")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("quantity_current", 0)
    .is("archived_at", null)
    .lte("updated_at", cutoffIso);

  if (listError) return internalServerError();

  const ids = (toArchive ?? []).map((row) => String((row as Record<string, unknown>).id));
  if (ids.length === 0) {
    return NextResponse.json({ data: { archivedCount: 0 } });
  }

  const { error: updateError } = await client
    .from("batches")
    .update({ archived_at: new Date().toISOString() })
    .eq("establishment_id", establishmentId)
    .in("id", ids);

  if (updateError) return internalServerError();

  return NextResponse.json({ data: { archivedCount: ids.length } });
}
