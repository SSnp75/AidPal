import { isSupabaseConfigured } from "@/lib/supabase/config";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import LeftSidebar from "@/components/dashboard/LeftSidebar";
import CenterFeed from "@/components/dashboard/CenterFeed";
import RightSidebar from "@/components/dashboard/RightSidebar";
import MyEventsPanel from "@/components/MyEventsPanel";
import {
  samplePosts,
  sampleTrending,
  sampleSuggestions,
  type SamplePost,
} from "@/lib/sampleFeed";
import { fetchFeedPosts, rankByEngagement } from "@/lib/feed";
import type { Profile } from "@/types/db";

interface GroupSummary {
  id: string;
  name: string;
}

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
  let createdGroups: GroupSummary[] = [];
  let memberGroups: GroupSummary[] = [];

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

      // Groups this user owns (created).
      const { data: owned } = await supabase
        .from("groups")
        .select("id, name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .returns<GroupSummary[]>();
      createdGroups = owned ?? [];

      // Groups this user is a member of (role = member, i.e. not owner).
      const { data: memberships } = await supabase
        .from("group_members")
        .select("role, groups ( id, name )")
        .eq("user_id", user.id)
        .eq("role", "member")
        .returns<{ role: string; groups: GroupSummary | null }[]>();
      memberGroups = (memberships ?? [])
        .map((m) => m.groups)
        .filter((g): g is GroupSummary => g !== null);
    }
  } catch {
    // no session — keep placeholder guest identity
  }

  // Fetch real posts from the database for the feed.
  let latestPosts: SamplePost[] = [];
  let trendingPosts: SamplePost[] = [];

  try {
    const supabase = await createClient();
    const allPosts = await fetchFeedPosts(supabase, 30);
    if (allPosts.length > 0) {
      latestPosts = allPosts.slice(0, 15);
      trendingPosts = rankByEngagement(allPosts).slice(0, 10);
    }
  } catch {
    // if feed fetch fails, fall through to sample data
  }

  // Fall back to sample data when there are no real posts.
  const useRealFeed = latestPosts.length > 0;

  // Presentational sample stats (no backend counts).
  const stats = { posts: 128, followers: 2140, following: 312 };

  return (
    <div className="min-h-full w-full">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-6 px-4 py-8 max-[767px]:px-2 min-[992px]:grid-cols-[15%_minmax(0,70%)_15%]">
        <LeftSidebar
          displayName={displayName}
          handle={handle}
          stats={stats}
        />
        <CenterFeed
          composerName={displayName}
          latestPosts={useRealFeed ? latestPosts : samplePosts}
          trendingPosts={useRealFeed ? trendingPosts : []}
        />
        <div className="hidden flex-col gap-6 min-[992px]:flex">
          {/* Create Event button + the user's events (My / Interested / Volunteering) */}
          <Link
            href="/events/new"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            Create Event
          </Link>
          <MyEventsPanel />

          <RightSidebar
            trending={sampleTrending}
            suggestions={sampleSuggestions}
            createdGroups={createdGroups}
            memberGroups={memberGroups}
          />
        </div>
      </div>
    </div>
  );
}
