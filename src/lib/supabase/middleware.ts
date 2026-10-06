import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";

export async function updateSession(
  request: NextRequest
): Promise<{ supabaseResponse: NextResponse; user: import("@supabase/supabase-js").User | null }> {
  const config = getSupabaseConfig();
  if (!config) {
    // No Supabase — pass through with no session work.
    return { supabaseResponse: NextResponse.next({ request }), user: null };
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session by calling getUser — this updates cookies if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user };
}
