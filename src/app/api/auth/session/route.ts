import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const auth = await requireAuthSession(request);
  if (auth.response || !auth.session) {
    return NextResponse.json({ data: { authenticated: false } }, { status: 401 });
  }

  return NextResponse.json({
    data: {
      authenticated: true,
      userId: auth.session.userId,
    },
  });
}
