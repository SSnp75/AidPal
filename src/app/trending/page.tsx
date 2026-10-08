import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import PostCard from "@/components/dashboard/PostCard";
import { fetchTrendingPosts } from "@/lib/feed";

export default async function TrendingPage() {
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

  const posts = await fetchTrendingPosts(supabase, { days: 7, limit: 30 });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary">Trending</h1>
      <p className="mt-1 text-text-secondary">
        Top posts from the last 7 days.
      </p>

      {posts.length === 0 ? (
        <p className="mt-6 text-text-secondary">Nothing trending yet.</p>
      ) : (
        <ul className="mt-6 space-y-6">
          {posts.map((p) => (
            <li key={p.id}>
              <PostCard post={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
