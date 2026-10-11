import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import MediaUploadForm from "@/components/MediaUploadForm";
import CommentForm from "@/components/CommentForm";
import ReactionBar from "@/components/ReactionBar";
import BookmarkButton from "@/components/BookmarkButton";
import ShareButton from "@/components/ShareButton";
import JoinButton from "@/components/JoinButton";
import PostBody from "@/components/PostBody";
import MyEventsPanel from "@/components/MyEventsPanel";
import OpenGroupChatButton from "./OpenGroupChatButton";
import RelatedGroups from "./RelatedGroups";
import type { Group, Post, Media, Comment, Profile, ReactionType, Country, GroupCategory, GroupTag } from "@/types/db";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <SupabaseNotConfigured />
      </div>
    );
  }

  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS gates reads: a private group not visible to the viewer returns null.
  const { data: group } = await supabase
    .from("groups")
    .select("*")
    .eq("id", id)
    .single<Group>();

  if (!group) notFound();

  // Determine membership (for post form) — only meaningful when signed in.
  let isMember = false;
  if (user) {
    const { data: membership } = await supabase.rpc("is_group_member", {
      gid: id,
    });
    isMember = Boolean(membership);
  }

  // Organization metadata (category label, country, tags) — additive.
  const [{ data: groupCategory }, { data: groupCountry }, { data: groupTags }] =
    await Promise.all([
      group.category_slug
        ? supabase
            .from("group_categories")
            .select("slug,label")
            .eq("slug", group.category_slug)
            .maybeSingle<GroupCategory>()
        : Promise.resolve({ data: null }),
      group.country_code
        ? supabase
            .from("countries")
            .select("code,name,flag")
            .eq("code", group.country_code)
            .maybeSingle<Country>()
        : Promise.resolve({ data: null }),
      supabase
        .from("group_tags")
        .select("group_id,tag")
        .eq("group_id", id)
        .order("tag")
        .returns<GroupTag[]>(),
    ]);

  // Related groups (either side of the pair), with the other group's name.
  const { data: relationRows } = await supabase
    .from("group_relations")
    .select("group_low, group_high")
    .or(`group_low.eq.${id},group_high.eq.${id}`)
    .returns<{ group_low: string; group_high: string }[]>();
  const relatedIds = (relationRows ?? []).map((r) =>
    r.group_low === id ? r.group_high : r.group_low
  );
  const { data: relatedRows } = relatedIds.length
    ? await supabase
        .from("groups")
        .select("id, name")
        .in("id", relatedIds)
        .returns<{ id: string; name: string }[]>()
    : { data: [] as { id: string; name: string }[] };
  const relatedGroups = relatedRows ?? [];

  // Can the viewer add/remove relations? Owner always; members when open.
  const isOwner = Boolean(user) && group.owner_id === user!.id;
  const canRelate = isOwner || (group.relations_open && isMember);

  // Suggested groups to relate: groups the viewer created or belongs to,
  // plus recent public groups — excluding this group and already-related ones.
  let relationSuggestions: { id: string; name: string }[] = [];
  if (canRelate && user) {
    const [{ data: ownedSug }, { data: memberSug }, { data: recentSug }] =
      await Promise.all([
        supabase
          .from("groups")
          .select("id, name")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10)
          .returns<{ id: string; name: string }[]>(),
        supabase
          .from("group_members")
          .select("groups ( id, name )")
          .eq("user_id", user.id)
          .limit(10)
          .returns<{ groups: { id: string; name: string } | null }[]>(),
        supabase
          .from("groups")
          .select("id, name")
          .eq("is_private", false)
          .order("created_at", { ascending: false })
          .limit(10)
          .returns<{ id: string; name: string }[]>(),
      ]);

    const exclude = new Set<string>([id, ...relatedIds]);
    const seen = new Set<string>();
    const pool: { id: string; name: string }[] = [
      ...(ownedSug ?? []),
      ...((memberSug ?? [])
        .map((m) => m.groups)
        .filter((g): g is { id: string; name: string } => g !== null)),
      ...(recentSug ?? []),
    ];
    for (const g of pool) {
      if (exclude.has(g.id) || seen.has(g.id)) continue;
      seen.add(g.id);
      relationSuggestions.push(g);
    }
    relationSuggestions = relationSuggestions.slice(0, 8);
  }

  // Posts
  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .eq("group_id", id)
    .order("created_at", { ascending: false })
    .returns<Post[]>();

  const postIds = (posts ?? []).map((p) => p.id);

  // Media, comments, reactions, author profiles for these posts
  const [mediaRes, commentsRes, reactionsRes, authorsRes, bookmarksRes] = await Promise.all([
    postIds.length
      ? supabase.from("media").select("*").in("post_id", postIds).returns<Media[]>()
      : Promise.resolve({ data: [] as Media[] }),
    postIds.length
      ? supabase
          .from("comments")
          .select("*")
          .in("post_id", postIds)
          .order("created_at", { ascending: true })
          .returns<Comment[]>()
      : Promise.resolve({ data: [] as Comment[] }),
    postIds.length
      ? supabase
          .from("reactions")
          .select("post_id,user_id,type")
          .in("post_id", postIds)
          .returns<{ post_id: string; user_id: string; type: ReactionType }[]>()
      : Promise.resolve({
          data: [] as { post_id: string; user_id: string; type: ReactionType }[],
        }),
    (posts ?? []).length
      ? supabase
          .from("profiles")
          .select("id,display_name")
          .in(
            "id",
            Array.from(new Set((posts ?? []).map((p) => p.author_id)))
          )
          .returns<Pick<Profile, "id" | "display_name">[]>()
      : Promise.resolve({ data: [] as Pick<Profile, "id" | "display_name">[] }),
    user && postIds.length
      ? supabase
          .from("bookmarks")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", postIds)
          .returns<{ post_id: string }[]>()
      : Promise.resolve({ data: [] as { post_id: string }[] }),
  ]);

  const mediaByPost = new Map<string, Media>();
  for (const m of mediaRes.data ?? []) mediaByPost.set(m.post_id, m);

  const commentsByPost = new Map<string, Comment[]>();
  for (const c of commentsRes.data ?? []) {
    const arr = commentsByPost.get(c.post_id) ?? [];
    arr.push(c);
    commentsByPost.set(c.post_id, arr);
  }

  const reactionsByPost = new Map<
    string,
    { counts: { like: number; love: number; dislike: number }; mine: ReactionType | null }
  >();
  for (const r of reactionsRes.data ?? []) {
    const cur =
      reactionsByPost.get(r.post_id) ??
      { counts: { like: 0, love: 0, dislike: 0 }, mine: null };
    cur.counts[r.type] += 1;
    if (user && r.user_id === user.id) cur.mine = r.type;
    reactionsByPost.set(r.post_id, cur);
  }

  const authorNames = new Map<string, string>();
  for (const a of authorsRes.data ?? [])
    authorNames.set(a.id, a.display_name);

  const bookmarkedSet = new Set(
    (bookmarksRes.data ?? []).map((b) => b.post_id)
  );

  function publicUrl(path: string): string {
    return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <main className="min-w-0 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-teal-400">{group.name}</h1>
          {group.is_private && (
            <span className="inline-block mt-1 rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              Private
            </span>
          )}
          {group.description && (
            <p className="mt-2 text-gray-300">{group.description}</p>
          )}

          {/* Organization metadata */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            {groupCategory && (
              <span className="rounded-full bg-gray-800 px-2 py-0.5">
                {groupCategory.label}
              </span>
            )}
            <span className="rounded-full bg-gray-800 px-2 py-0.5 capitalize">
              {group.scope}
            </span>
            {groupCountry ? (
              <span>
                {groupCountry.name}
                {group.city ? ` · ${group.city}` : ""}
              </span>
            ) : (
              group.scope === "global" && <span>🌍 Global</span>
            )}
          </div>

          {groupTags && groupTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {groupTags.map((t) => (
                <span
                  key={t.tag}
                  className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-teal-300"
                >
                  #{t.tag}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Join / Post controls */}
        {user ? (
          isMember ? (
            <MediaUploadForm groupId={group.id} />
          ) : !group.is_private ? (
            <JoinButton groupId={group.id} />
          ) : (
            <p className="text-sm text-gray-400">
              This is a private group. You need an invitation to participate.
            </p>
          )
        ) : (
          <p className="text-sm text-gray-400">
            Sign in to join this group and post.
          </p>
        )}

        {/* Posts */}
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Posts</h2>
          {!posts || posts.length === 0 ? (
            <p className="text-text-secondary">No posts yet.</p>
          ) : (
            <ul className="space-y-3">
              {posts.map((post) => {
                const media = mediaByPost.get(post.id);
                const comments = commentsByPost.get(post.id) ?? [];
                const reactionInfo =
                  reactionsByPost.get(post.id) ?? {
                    counts: { like: 0, love: 0, dislike: 0 },
                    mine: null,
                  };
                const authorName =
                  authorNames.get(post.author_id) ?? "Someone";

                return (
                  <li
                    key={post.id}
                    className="overflow-hidden rounded-xl border border-border bg-card p-2"
                  >
                    <p className="text-[10px] text-text-secondary mb-1">{authorName}</p>

                    {post.body && (
                      <PostBody text={post.body} className="text-[15px] text-text-primary whitespace-pre-wrap leading-snug mb-1.5" />
                    )}

                    {media && (
                      <img
                        src={publicUrl(media.storage_path)}
                        alt={`Image posted by ${authorName} in ${group.name}`}
                        className="mb-1.5 -mx-2 w-[calc(100%+1rem)] max-w-none max-h-[42rem] object-cover"
                      />
                    )}

                    <div className="flex items-center gap-0.5 border-t border-border pt-1">
                      <ReactionBar
                        postId={post.id}
                        initialCounts={reactionInfo.counts}
                        initialMine={reactionInfo.mine}
                      />
                      <BookmarkButton
                        postId={post.id}
                        initialBookmarked={bookmarkedSet.has(post.id)}
                        disabled={false}
                      />
                      <ShareButton groupId={group.id} disabled={false} />
                    </div>

                    {/* Comments */}
                    <div className="mt-1.5 border-t border-border pt-1.5">
                      {comments.length > 0 && (
                        <ul className="space-y-1 mb-1">
                          {comments.map((c) => (
                            <li key={c.id} className="text-[15px] leading-snug">
                              <span className="text-text-secondary">
                                {authorNames.get(c.author_id) ?? "Someone"}:
                              </span>{" "}
                              <span className="text-text-primary">{c.body}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {user && isMember && <CommentForm postId={post.id} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        </main>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          {/* Create a new group — quick access from within a group. */}
          <Link
            href="/groups/new"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-side-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            + Create a Group
          </Link>

          {/* Member-only Create Event entry — relocated to the right sidebar
              (additive — muted tokens). */}
          {user && isMember && (
            <Link
              href={`/events/new?groupId=${group.id}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              Create Event
            </Link>
          )}

          {/* Related groups — link this group to other existing groups. */}
          <RelatedGroups
            groupId={group.id}
            related={relatedGroups}
            suggestions={relationSuggestions}
            canRelate={canRelate}
            isOwner={isOwner}
            relationsOpen={group.relations_open}
          />

          {user && isMember && <OpenGroupChatButton groupId={group.id} />}

          {/* The user's own/interested/volunteering events across ALL
              groups and scopes — not limited to this group. */}
          {user && <MyEventsPanel />}
        </aside>
      </div>
    </div>
  );
}
