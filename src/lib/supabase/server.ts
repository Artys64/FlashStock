import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

export function createSupabaseServerClient(input?: { accessToken?: string | null }) {
  const accessToken = input?.accessToken?.trim();
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}
