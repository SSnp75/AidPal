import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import PostBody from "@/components/PostBody";
import type { Post, Profile } from "@/types/db";

export default async function SavedPage() {
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

  if (!user) redirect("/login");

  const { data: bookmarks } = await supabase
    .from("bookmarks")
    .select("post_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<{ post_id: string; created_at: string }[]>();

  const ids = (bookmarks ?? []).map((b) => b.post_id);

  if (ids.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-6">Saved</h1>
        <p className="text-text-secondary">Nothing saved yet.</p>
      </div>
    );
  }

  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .in("id", ids)
    .returns<Post[]>();

  const authorIds = Array.from(
    new Set((posts ?? []).map((p) => p.author_id))
  );

  const { data: authors } = await supabase
    .from("profiles")
    .select("id,display_name")
    .in("id", authorIds)
    .returns<Pick<Profile, "id" | "display_name">[]>();

  const postById = new Map<string, Post>();
  for (const p of posts ?? []) postById.set(p.id, p);

  const authorNames = new Map<string, string>();
  for (const a of authors ?? []) authorNames.set(a.id, a.display_name);

  // Join in memory, preserving the newest-first bookmark order and skipping
  // any post RLS dropped (not present in postById).
  const entries = (bookmarks ?? [])
    .map((b) => postById.get(b.post_id))
    .filter((p): p is Post => Boolean(p));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">Saved</h1>

      {entries.length === 0 ? (
        <p className="text-text-secondary">Nothing saved yet.</p>
      ) : (
        <ul className="space-y-6">
          {entries.map((post) => (
            <li
              key={post.id}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <p className="text-sm text-text-secondary mb-2">
                {authorNames.get(post.author_id) ?? "Someone"}
              </p>

              {post.body && (
                <PostBody
                  text={post.body}
                  className="whitespace-pre-wrap text-text-primary leading-relaxed"
                />
              )}

              <div className="mt-3">
                <Link
                  href={`/groups/${post.group_id}`}
                  className="text-sm text-text-secondary underline underline-offset-2 transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  View in group
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
