import type { SupabaseClient } from "@supabase/supabase-js";
import type { Post, Comment, Profile, ReactionType } from "@/types/db";
import type { SamplePost } from "@/lib/sampleFeed";

/**
 * Build real feed posts from the database, shaped like SamplePost so the
 * existing PostCard component can render them unchanged.
 *
 * Returns the most recent public-visible posts (RLS already limits what the
 * caller can see). Each post carries like + comment counts for ranking.
 */
export async function fetchFeedPosts(
  supabase: SupabaseClient,
  limit = 30
): Promise<SamplePost[]> {
  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<Post[]>();

  if (!posts || posts.length === 0) return [];

  return enrichPosts(supabase, posts);
}

/**
 * Shared enrichment: given a set of raw posts, resolve the viewer, reaction
 * counts, comment counts, author names, bookmark state, and the first image's
 * public URL, then shape each row as a SamplePost. Used by both the home feed
 * and trending so image + reaction behaviour stays identical across pages.
 */
async function enrichPosts(
  supabase: SupabaseClient,
  posts: Post[]
): Promise<SamplePost[]> {
  // Determine the viewer once so we can compute each post's `myReaction`.
  // getUser() returns { user: null } without error when unauthenticated.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const postIds = posts.map((p) => p.id);
  const authorIds = Array.from(new Set(posts.map((p) => p.author_id)));

  const [reactionsRes, commentsRes, authorsRes, bmRes, mediaRes] =
    await Promise.all([
      supabase
        .from("reactions")
        .select("post_id, user_id, type")
        .in("post_id", postIds)
        .returns<{ post_id: string; user_id: string; type: ReactionType }[]>(),
      supabase
        .from("comments")
        .select("post_id")
        .in("post_id", postIds)
        .returns<Pick<Comment, "post_id">[]>(),
      supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", authorIds)
        .returns<Pick<Profile, "id" | "display_name">[]>(),
      user
        ? supabase
            .from("bookmarks")
            .select("post_id")
            .eq("user_id", user.id)
            .in("post_id", postIds)
            .returns<{ post_id: string }[]>()
        : Promise.resolve({ data: [] as { post_id: string }[] }),
      supabase
        .from("media")
        .select("post_id, storage_path, created_at")
        .in("post_id", postIds)
        .order("created_at", { ascending: true })
        .returns<
          { post_id: string; storage_path: string; created_at: string }[]
        >(),
    ]);

  const reactionCounts = new Map<
    string,
    { like: number; love: number; dislike: number }
  >();
  const myReaction = new Map<string, ReactionType>();
  for (const r of reactionsRes.data ?? []) {
    const cur = reactionCounts.get(r.post_id) ?? { like: 0, love: 0, dislike: 0 };
    cur[r.type] += 1;
    reactionCounts.set(r.post_id, cur);
    if (user && r.user_id === user.id) myReaction.set(r.post_id, r.type);
  }

  const commentCount = new Map<string, number>();
  for (const c of commentsRes.data ?? []) {
    commentCount.set(c.post_id, (commentCount.get(c.post_id) ?? 0) + 1);
  }

  const authorName = new Map<string, string>();
  for (const a of authorsRes.data ?? []) authorName.set(a.id, a.display_name);

  const bookmarkedSet = new Set((bmRes.data ?? []).map((b) => b.post_id));

  // First (earliest) media path per post — the media select is already
  // ordered ascending, so the first row we see for a post_id is the earliest.
  const firstMediaPath = new Map<string, string>();
  for (const m of mediaRes.data ?? []) {
    if (!firstMediaPath.has(m.post_id)) firstMediaPath.set(m.post_id, m.storage_path);
  }

  return posts.map((p) => {
    const name = authorName.get(p.author_id) ?? "Someone";
    const reactions = reactionCounts.get(p.id) ?? { like: 0, love: 0, dislike: 0 };
    const path = firstMediaPath.get(p.id);
    return {
      id: p.id,
      authorName: name,
      handle: name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
      timeAgo: timeAgo(p.created_at),
      body: p.body ?? "",
      hashtags: [],
      likes: reactions.like,
      comments: commentCount.get(p.id) ?? 0,
      reposts: 0,
      isReal: true,
      groupId: p.group_id,
      reactions,
      myReaction: myReaction.get(p.id) ?? null,
      bookmarked: user ? bookmarkedSet.has(p.id) : false,
      imageUrl: path
        ? supabase.storage.from("media").getPublicUrl(path).data.publicUrl
        : undefined,
    } satisfies SamplePost;
  });
}

/**
 * Trending posts: real posts created within the last `days` window, ranked by
 * positive engagement. Reuses enrichPosts so reactions, bookmarks, and images
 * work exactly as on the home feed.
 */
export async function fetchTrendingPosts(
  supabase: SupabaseClient,
  { days = 7, limit = 30 }: { days?: number; limit?: number } = {}
): Promise<SamplePost[]> {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<Post[]>();

  if (!posts || posts.length === 0) return [];

  return rankByEngagement(await enrichPosts(supabase, posts));
}

/**
 * Trending posts scoped to a specific set of groups (e.g. a group's related
 * groups). Pulls recent posts from those groups and ranks them by positive
 * engagement, reusing enrichPosts so cards render identically to the home feed.
 * RLS still gates visibility — private groups the viewer can't read are empty.
 */
export async function fetchPostsByGroups(
  supabase: SupabaseClient,
  groupIds: string[],
  { days = 30, limit = 30 }: { days?: number; limit?: number } = {}
): Promise<SamplePost[]> {
  if (groupIds.length === 0) return [];
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .in("group_id", groupIds)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<Post[]>();

  if (!posts || posts.length === 0) return [];

  return rankByEngagement(await enrichPosts(supabase, posts));
}

/**
 * Rank by positive engagement: like + love + comments.
 * Dislikes are ignored (not subtracted) to keep the score monotonic and
 * avoid negative/zeroed trending (per requirements A5).
 */
export function rankByEngagement(posts: SamplePost[]): SamplePost[] {
  const score = (p: SamplePost) =>
    p.reactions.like + p.reactions.love + p.comments;
  return [...posts].sort((a, b) => score(b) - score(a));
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}
