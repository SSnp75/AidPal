import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const config = getSupabaseConfig();
  if (!config || !tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }

  // Build a Supabase client that can write cookies on this response.
  const redirectUrl = new URL("/profile/edit", request.url);
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    console.error("[auth/callback]", error.message);
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }

  // Ensure a profile row exists for this user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const fallbackName =
      (user.email?.split("@")[0] ?? "").slice(0, 60) || "New user";

    await supabase.from("profiles").upsert(
      {
        id: user.id,
        display_name: fallbackName,
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
  }

  return response;
}
