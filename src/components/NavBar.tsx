import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import MobileNav from "@/components/MobileNav";

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
    <header className="border-b border-border bg-card shadow-sm">
      <nav
        className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-1"
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-2">
          {/* Hamburger drawer — mobile only (hidden at >=992px). Additive;
              desktop top links are untouched. */}
          <MobileNav
            isAuthed={Boolean(user)}
            logoutForm={
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-text-secondary transition-colors hover:bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  Logout
                </button>
              </form>
            }
          />
          <Link
            href="/"
            className="text-xl font-bold text-text-primary transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            aidPAL
          </Link>
        </div>

        <ul className="flex items-center gap-4 text-sm">
          <li>
            <Link
              href="/groups"
              className="text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Groups
            </Link>
          </li>

          {user ? (
            <>
              <li>
                <Link
                  href="/profile"
                  className="text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
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
                    className="text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
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
                className="rounded bg-accent px-3 py-1.5 text-white transition-colors hover:bg-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
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
