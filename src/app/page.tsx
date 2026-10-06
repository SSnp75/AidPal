import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import LeftSidebar from "@/components/dashboard/LeftSidebar";
import CenterFeed from "@/components/dashboard/CenterFeed";
import RightSidebar from "@/components/dashboard/RightSidebar";
import {
  samplePosts,
  sampleTrending,
  sampleSuggestions,
} from "@/lib/sampleFeed";
import type { Profile } from "@/types/db";

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <section className="text-center py-16">
          <h1 className="text-4xl font-bold text-accent mb-4">
            Welcome to AidPal
          </h1>
          <p className="text-text-secondary max-w-xl mx-auto mb-8">
            A social network that turns community goodwill into organized
            action. Create groups, share photos, comment, and connect.
          </p>
        </section>
        <SupabaseNotConfigured />
      </div>
    );
  }

  // Derive the profile card data from the current user when trivially available.
  let displayName = "Guest";
  let handle = "guest";

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single<Pick<Profile, "display_name">>();

      const name = profile?.display_name || user.email?.split("@")[0] || "Guest";
      displayName = name;
      handle = (profile?.display_name || user.email?.split("@")[0] || "guest")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
    }
  } catch {
    // no session — keep placeholder guest identity
  }

  // Presentational sample stats (no backend counts).
  const stats = { posts: 128, followers: 2140, following: 312 };

  return (
    <div className="app-bg-glow min-h-full w-full">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-8 max-[767px]:px-2 min-[992px]:grid-cols-[260px_minmax(0,1fr)_300px]">
        <LeftSidebar displayName={displayName} handle={handle} stats={stats} />
        <CenterFeed composerName={displayName} posts={samplePosts} />
        <RightSidebar trending={sampleTrending} suggestions={sampleSuggestions} />
      </div>
    </div>
  );
}
