import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";

export default async function PhotosPage() {
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

  // Privacy is enforced by the top-level media_select / can_read_post policy,
  // NOT by the posts!inner embed. The to-one posts embed is a single object.
  const { data: media } = await supabase
    .from("media")
    .select("id, storage_path, post_id, posts!inner(group_id, author_id)")
    .order("created_at", { ascending: false })
    .limit(60)
    .returns<
      {
        id: string;
        storage_path: string;
        post_id: string;
        posts: { group_id: string; author_id: string };
      }[]
    >();

  const authorIds = Array.from(
    new Set((media ?? []).map((m) => m.posts.author_id))
  );

  const { data: authors } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", authorIds)
        .returns<{ id: string; display_name: string }[]>()
    : { data: [] as { id: string; display_name: string }[] };

  const authorNames = new Map<string, string>();
  for (const a of authors ?? []) authorNames.set(a.id, a.display_name);

  function publicUrl(path: string): string {
    return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
  }

  const items = media ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">Photos</h1>

      {items.length === 0 ? (
        <p className="text-text-secondary">No photos to show yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((m) => (
            <Link
              key={m.id}
              href={`/groups/${m.posts.group_id}`}
              className="block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <img
                src={publicUrl(m.storage_path)}
                alt={`Image posted by ${
                  authorNames.get(m.posts.author_id) ?? "Someone"
                }`}
                className="aspect-square w-full object-cover"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
