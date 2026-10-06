import { createBrowserClient as createBrowserSupabaseClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

export function createBrowserClient() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return createBrowserSupabaseClient(config.url, config.anonKey);
}
