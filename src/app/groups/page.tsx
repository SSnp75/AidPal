import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import type { Group } from "@/types/db";

export default async function GroupsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <SupabaseNotConfigured />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS: can_read_group ensures only public (or member) groups come back.
  const { data: groups } = await supabase
    .from("groups")
    .select("*")
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .returns<Group[]>();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-teal-400">Public Groups</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/groups/browse"
            className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            Browse
          </Link>
          {user && (
            <Link
              href="/groups/new"
              className="rounded bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-500 transition-colors"
            >
              New Group
            </Link>
          )}
        </div>
      </div>

      {!groups || groups.length === 0 ? (
        <p className="text-gray-400">No public groups yet.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/groups/${g.id}`}
                className="block rounded-xl border border-gray-800 bg-gray-900/50 p-4 hover:border-teal-700 transition-colors"
              >
                <span className="text-lg font-medium text-white">
                  {g.name}
                </span>
                {g.description && (
                  <p className="mt-1 text-sm text-gray-400 line-clamp-2">
                    {g.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
