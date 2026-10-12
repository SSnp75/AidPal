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
import { distinctInterestedGroups } from "@/lib/affinity";
import type { Profile } from "@/types/db";

interface GroupSummary {
  id: string;
  name: string;
}

interface NewGroupItem {
  id: string;
  name: string;
  owner: string;
  isSelf: boolean;
}

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <section className="text-center py-16">
          <h1 className="text-4xl font-bold text-accent mb-4">
            Welcome to aidPAL
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
  let interestedGroups: GroupSummary[] = [];
  let newGroups: NewGroupItem[] = [];
  let friendsGroups: NewGroupItem[] = [];

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

      // Interested Groups: any group where the viewer has a like OR love
      // reaction on at least one of that group's posts (dislike doesn't count).
      // Derived — joins reactions → posts → groups and dedupes. RLS already
      // limits `groups` to those the viewer can read.
      const { data: myReactions } = await supabase
        .from("reactions")
        .select("post_id, type")
        .eq("user_id", user.id)
        .in("type", ["like", "love"])
        .returns<{ post_id: string; type: string }[]>();
      const reactedPostIds = Array.from(
        new Set((myReactions ?? []).map((r) => r.post_id))
      );
      if (reactedPostIds.length > 0) {
        const { data: reactedPosts } = await supabase
          .from("posts")
          .select("group_id")
          .in("id", reactedPostIds)
          .returns<{ group_id: string | null }[]>();
        const interestedGroupIds = Array.from(
          new Set(
            (reactedPosts ?? [])
              .map((p) => p.group_id)
              .filter((g): g is string => !!g)
          )
        );
        if (interestedGroupIds.length > 0) {
          const { data: interestedRows } = await supabase
            .from("groups")
            .select("id, name")
            .in("id", interestedGroupIds)
            .returns<GroupSummary[]>();
          interestedGroups = distinctInterestedGroups(interestedRows ?? []);
        }
      }

      // Recent public groups (visible to everyone) — "New Groups".
      const { data: recent } = await supabase
        .from("groups")
        .select("id, name, owner_id, created_at")
        .eq("is_private", false)
        .order("created_at", { ascending: false })
        .limit(20)
        .returns<
          { id: string; name: string; owner_id: string; created_at: string }[]
        >();

      // Owner display names for those groups.
      const ownerIds = Array.from(
        new Set((recent ?? []).map((g) => g.owner_id))
      );
      const { data: owners } = ownerIds.length
        ? await supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", ownerIds)
            .returns<{ id: string; display_name: string }[]>()
        : { data: [] as { id: string; display_name: string }[] };
      const ownerName = new Map(
        (owners ?? []).map((o) => [o.id, o.display_name])
      );

      // Which of those owners are my accepted friends?
      const { data: myFriendships } = await supabase
        .from("friendships")
        .select("user_low, user_high, status")
        .eq("status", "accepted")
        .returns<{ user_low: string; user_high: string; status: string }[]>();
      const friendIds = new Set<string>();
      for (const f of myFriendships ?? []) {
        if (f.user_low === user.id) friendIds.add(f.user_high);
        else if (f.user_high === user.id) friendIds.add(f.user_low);
      }

      const toItem = (g: {
        id: string;
        name: string;
        owner_id: string;
      }): NewGroupItem => ({
        id: g.id,
        name: g.name,
        owner: ownerName.get(g.owner_id) ?? "Someone",
        isSelf: g.owner_id === user.id,
      });

      newGroups = (recent ?? []).slice(0, 30).map(toItem);
      friendsGroups = (recent ?? [])
        .filter((g) => friendIds.has(g.owner_id))
        .slice(0, 30)
        .map(toItem);
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
      <div className="grid w-full grid-cols-1 gap-6 py-8 min-[992px]:grid-cols-[15%_minmax(0,70%)_15%]">
        <LeftSidebar
          displayName={displayName}
          handle={handle}
          stats={stats}
        />
        <div className="min-w-0 flex flex-col gap-3">
          {friendsGroups.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-3">
              <h2 className="mb-2 text-sm font-semibold text-text-primary">
                👥 Friends&apos; new groups
              </h2>
              <ul className="flex max-h-36 flex-col gap-1 overflow-y-auto pr-1">
                {friendsGroups.map((g) => (
                  <li key={`fr-${g.id}`} className="text-sm text-text-secondary">
                    <span className="font-medium text-text-primary">
                      {g.owner}
                    </span>{" "}
                    created a new group:{" "}
                    <Link
                      href={`/groups/${g.id}`}
                      className="text-accent underline underline-offset-2 hover:text-accent-light"
                    >
                      {g.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {newGroups.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-3">
              <h2 className="mb-2 text-sm font-semibold text-text-primary">
                ✨ New groups
              </h2>
              <ul className="flex max-h-36 flex-col gap-1 overflow-y-auto pr-1">
                {newGroups.map((g) => (
                  <li key={`new-${g.id}`} className="text-sm text-text-secondary">
                    <span className="font-medium text-text-primary">
                      {g.isSelf ? "You" : g.owner}
                    </span>{" "}
                    created a new group:{" "}
                    <Link
                      href={`/groups/${g.id}`}
                      className="text-accent underline underline-offset-2 hover:text-accent-light"
                    >
                      {g.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <CenterFeed
            composerName={displayName}
            latestPosts={useRealFeed ? latestPosts : samplePosts}
            trendingPosts={useRealFeed ? trendingPosts : []}
          />
        </div>
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
            interestedGroups={interestedGroups}
            memberGroups={memberGroups}
          />
        </div>
      </div>
    </div>
  );
}
