import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED_PREFIXES = ["/profile", "/groups/new"];

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);

  const { pathname } = request.nextUrl;

  // Check if the path is protected and there is no session
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and metadata files.
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
