import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_ACCESS_COOKIE } from "@/lib/auth/cookies";

export default async function Home() {
  const cookieStore = await cookies();
  const hasSession = Boolean(cookieStore.get(AUTH_ACCESS_COOKIE)?.value);
  redirect(hasSession ? "/batches" : "/login");
}
