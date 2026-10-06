import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export default async function NavBar() {
  let user = null;

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch {
      // Ignore — no session
    }
  }

  return (
    <header className="border-b border-gray-800 bg-gray-950">
      <nav
        className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3"
        aria-label="Main navigation"
      >
        <Link href="/" className="text-xl font-bold text-teal-400">
          AidPal
        </Link>

        <ul className="flex items-center gap-4 text-sm">
          <li>
            <Link
              href="/groups"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Groups
            </Link>
          </li>

          {user ? (
            <>
              <li>
                <Link
                  href="/profile"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Profile
                </Link>
              </li>
              <li>
                <form
                  action={async () => {
                    "use server";
                    await signOut();
                  }}
                >
                  <button
                    type="submit"
                    className="text-gray-300 hover:text-white transition-colors"
                  >
                    Logout
                  </button>
                </form>
              </li>
            </>
          ) : (
            <li>
              <Link
                href="/login"
                className="rounded bg-teal-600 px-3 py-1.5 text-white hover:bg-teal-500 transition-colors"
              >
                Login
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
