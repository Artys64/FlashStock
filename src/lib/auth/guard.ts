import { NextRequest, NextResponse } from "next/server";
import { hasPermission, PermissionCode } from "./permissions";
import { AuthSession, requireAuthSession } from "./session";
import { badRequest, forbidden } from "@/lib/http/errors";

type AuthorizeResult = {
  response: NextResponse | null;
  session: AuthSession | null;
};

export async function authorizeRequest(input: {
  request: NextRequest;
  establishmentId: string | null;
  permission: PermissionCode;
}): Promise<AuthorizeResult> {
  if (!input.establishmentId) {
    return {
      response: badRequest("Missing establishmentId for authorization."),
      session: null,
    };
  }

  const auth = await requireAuthSession(input.request);
  if (auth.response || !auth.session) return { response: auth.response, session: null };

  const allowed = await hasPermission({
    accessToken: auth.session.accessToken,
    userId: auth.session.userId,
    establishmentId: input.establishmentId,
    permission: input.permission,
  });

  if (!allowed) {
    return { response: forbidden(), session: null };
  }

  return { response: null, session: auth.session };
}
