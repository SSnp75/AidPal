import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <section className="text-center py-16">
          <h1 className="text-4xl font-bold text-teal-400 mb-4">
            Welcome to AidPal
          </h1>
          <p className="text-gray-300 max-w-xl mx-auto mb-8">
            A social network that turns community goodwill into organized
            action. Create groups, share photos, comment, and connect.
          </p>
        </section>
        <SupabaseNotConfigured />
      </>
    );
  }

  let user = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // no session
  }

  return (
    <section className="text-center py-16">
      <h1 className="text-4xl font-bold text-teal-400 mb-4">
        Welcome to AidPal
      </h1>
      <p className="text-gray-300 max-w-xl mx-auto mb-8">
        A social network that turns community goodwill into organized action.
        Create groups, share photos, comment, and connect.
      </p>

      <div className="flex justify-center gap-4">
        <Link
          href="/groups"
          className="rounded bg-teal-600 px-6 py-2.5 text-white font-medium hover:bg-teal-500 transition-colors"
        >
          Browse Groups
        </Link>
        {user ? (
          <Link
            href="/profile"
            className="rounded border border-gray-600 px-6 py-2.5 text-gray-200 hover:bg-gray-800 transition-colors"
          >
            My Profile
          </Link>
        ) : (
          <Link
            href="/register"
            className="rounded border border-gray-600 px-6 py-2.5 text-gray-200 hover:bg-gray-800 transition-colors"
          >
            Register
          </Link>
        )}
      </div>
    </section>
  );
}
