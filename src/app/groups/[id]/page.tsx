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
import RocketJoinButton from "@/components/RocketJoinButton";
import LeaveGroupButton from "@/components/LeaveGroupButton";
import PostBody from "@/components/PostBody";
import MyEventsPanel from "@/components/MyEventsPanel";
import PostCard from "@/components/dashboard/PostCard";
import { fetchPostsByGroups } from "@/lib/feed";
import OpenGroupChatButton from "./OpenGroupChatButton";
import RelatedGroups from "./RelatedGroups";
import TagEditor from "./TagEditor";
import MembersPanel from "./MembersPanel";
import GroupModerationCard from "./GroupModerationCard";
import PostModerationMenu from "./PostModerationMenu";
import CommentModerationControls from "./CommentModerationControls";
import { canModerate as canModerateRole, canDeleteItem } from "@/lib/moderation";
import type { GroupRole } from "@/lib/moderation";
import { canLeaveGroup } from "@/lib/affinity";
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

  const isOwner = Boolean(user) && group.owner_id === user!.id;

  // Viewer's group role, computed for ALL signed-in viewers (not just owners)
  // so a plain moderator's suspend/unsuspend affordances render. The owner is
  // "owner" without a membership lookup; everyone else gets their membership
  // role (or null when not a member).
  let viewerRole: GroupRole = null;
  if (user) {
    if (isOwner) {
      viewerRole = "owner";
    } else {
      const { data: membershipRow } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", id)
        .eq("user_id", user.id)
        .maybeSingle<{ role: "owner" | "moderator" | "member" }>();
      viewerRole = membershipRow?.role ?? null;
    }
  }
  const canModerate = canModerateRole(viewerRole);

  // Members list (for the owner's role-management panel).
  let members: { user_id: string; role: string; name: string }[] = [];
  if (isOwner) {
    const { data: mems } = await supabase
      .from("group_members")
      .select("user_id, role")
      .eq("group_id", id)
      .returns<{ user_id: string; role: string }[]>();
    const memIds = (mems ?? []).map((m) => m.user_id);
    const { data: memProfiles } = memIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", memIds)
          .returns<{ id: string; display_name: string }[]>()
      : { data: [] as { id: string; display_name: string }[] };
    const nameOf = new Map((memProfiles ?? []).map((p) => [p.id, p.display_name]));
    members = (mems ?? []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      name: nameOf.get(m.user_id) ?? "Member",
    }));
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

  // Trending posts from this group's related groups, ranked by engagement.
  // Rendered as cards in a vertical scroll box in the main column.
  const relatedPosts = await fetchPostsByGroups(supabase, relatedIds);

  // Can the viewer add/remove relations? Owner always; members when open.
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
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr_20rem]">
        {/* Left sidebar — Related groups + the viewer's events. */}
        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start lg:order-first">
          {/* Related groups — link this group to other existing groups. */}
          <RelatedGroups
            groupId={group.id}
            related={relatedGroups}
            suggestions={relationSuggestions}
            canRelate={canRelate}
            isOwner={isOwner}
            relationsOpen={group.relations_open}
          />

          {/* The user's own/interested/volunteering events across ALL
              groups and scopes — not limited to this group. */}
          {user && <MyEventsPanel />}
        </aside>

        <main className="min-w-0 space-y-6">
        <header className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">{group.name}</h1>
          {group.is_private && (
            <span className="inline-block mt-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-text-secondary">
              Private
            </span>
          )}
          {group.description && (
            <p className="mt-2 leading-relaxed text-text-secondary">{group.description}</p>
          )}

          {/* Organization metadata */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            {groupCategory && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-text-primary">
                {groupCategory.label}
              </span>
            )}
            <span className="rounded-full bg-secondary px-2 py-0.5 capitalize text-text-primary">
              {group.scope}
            </span>
            {groupCountry ? (
              (() => {
                // Prefer the group's precise location (Plus Code / lat,lng /
                // address) when set; otherwise fall back to "City, Country".
                // Google Maps and Earth both accept a free-text search in the
                // URL — no API key or coordinates parsing needed.
                const place =
                  group.location_query ||
                  [group.city, groupCountry.name].filter(Boolean).join(", ");
                const q = encodeURIComponent(place);
                return (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span>
                      {groupCountry.name}
                      {group.city ? ` · ${group.city}` : ""}
                    </span>
                    {/* When a precise location is set, show it as the clickable
                        label so the exact entry is visible, not hidden behind a
                        generic chip. */}
                    {group.location_query && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${q}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`View ${place} on Google Maps`}
                        className="text-accent underline underline-offset-2 hover:text-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        📍 {group.location_query}
                      </a>
                    )}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${q}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`View ${place} on Google Maps`}
                      className="rounded-full bg-secondary px-2 py-0.5 text-text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      🗺️ Maps
                    </a>
                    <a
                      href={`https://earth.google.com/web/search/${q}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`View ${place} on Google Earth`}
                      className="rounded-full bg-secondary px-2 py-0.5 text-text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      🌍 Earth
                    </a>
                  </span>
                );
              })()
            ) : (
              group.scope === "global" && <span>🌍 Global</span>
            )}
          </div>

          {/* Tags — any member can add/remove; others see read-only chips. */}
          <TagEditor
            groupId={group.id}
            initialTags={(groupTags ?? []).map((t) => t.tag)}
            canEdit={isMember}
          />
        </header>

        {/* Join / Post controls */}
        {user ? (
          isMember ? (
            <div className="space-y-3">
              <MediaUploadForm groupId={group.id} />
              {canLeaveGroup(viewerRole) && (
                <LeaveGroupButton groupId={group.id} />
              )}
            </div>
          ) : !group.is_private ? (
            <JoinButton groupId={group.id} />
          ) : (
            <p className="text-sm text-text-secondary">
              This is a private group. You need an invitation to participate.
            </p>
          )
        ) : (
          <p className="text-sm text-text-secondary">
            Sign in to join this group and post.
          </p>
        )}

        {/* Posts */}
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Posts</h2>
          {!posts || posts.length === 0 ? (
            <p className="text-text-secondary">No posts yet.</p>
          ) : (
            <ul className="max-h-[70vh] space-y-3 overflow-y-auto rounded-xl border border-border p-2">
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
                const postIsAuthor = post.author_id === user?.id;
                const canDeletePost = canDeleteItem(viewerRole, postIsAuthor);
                const postSuspended = post.status === "suspended";

                return (
                  <li
                    key={post.id}
                    className={`overflow-hidden rounded-xl border border-border bg-card p-3 sm:p-4${
                      postSuspended ? " opacity-60" : ""
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <p className="text-xs text-text-secondary">{authorName}</p>
                      {postSuspended && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-text-secondary">
                          Suspended
                        </span>
                      )}
                    </div>

                    {post.body && (
                      <PostBody text={post.body} className="text-[15px] text-text-primary whitespace-pre-wrap leading-snug mb-1.5" />
                    )}

                    {media && (
                      <img
                        src={publicUrl(media.storage_path)}
                        alt={`Image posted by ${authorName} in ${group.name}`}
                        className="mb-1.5 w-full max-h-[42rem] rounded-lg object-contain"
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
                      <RocketJoinButton
                        groupId={group.id}
                        initialJoined={isMember}
                      />
                      {(canDeletePost || canModerate) && (
                        <PostModerationMenu
                          postId={post.id}
                          groupId={group.id}
                          status={post.status}
                          canDelete={canDeletePost}
                          canModerate={canModerate}
                        />
                      )}
                    </div>

                    {/* Comments */}
                    <div className="mt-1.5 border-t border-border pt-1.5">
                      {comments.length > 0 && (
                        <ul className="space-y-1 mb-1">
                          {comments.map((c) => {
                            const commentIsAuthor = c.author_id === user?.id;
                            const canDeleteComment = canDeleteItem(
                              viewerRole,
                              commentIsAuthor
                            );
                            const commentSuspended = c.status === "suspended";
                            return (
                              <li
                                key={c.id}
                                className={`text-[15px] leading-snug${
                                  commentSuspended ? " opacity-60" : ""
                                }`}
                              >
                                <span className="text-text-secondary">
                                  {authorNames.get(c.author_id) ?? "Someone"}:
                                </span>{" "}
                                <span className="text-text-primary">{c.body}</span>
                                {commentSuspended && (
                                  <span className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-[11px] text-text-secondary">
                                    Suspended
                                  </span>
                                )}
                                {(canDeleteComment || canModerate) && (
                                  <CommentModerationControls
                                    commentId={c.id}
                                    groupId={group.id}
                                    status={c.status}
                                    canDelete={canDeleteComment}
                                    canModerate={canModerate}
                                  />
                                )}
                              </li>
                            );
                          })}
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

        {/* Trending posts from related groups — card list in a scroll box. */}
        {relatedPosts.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-text-primary">
              <span aria-hidden="true">🔗</span> From Related Groups
            </h2>
            {/* One vertical scroll box; each card is shrink-0 so it keeps
                full height and the box scrolls instead. */}
            <div className="max-h-[70vh] space-y-3 overflow-y-auto rounded-xl border border-border p-2">
              {relatedPosts.map((post) => (
                <div key={`related-${post.id}`} className="shrink-0">
                  <PostCard post={post} />
                </div>
              ))}
            </div>
          </section>
        )}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          {/* AI thinks — placeholder for upcoming AI insights on this issue. */}
          <section className="min-h-[25vh] rounded-2xl border border-side-border bg-side-card p-4">
            <h2 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <span aria-hidden="true">🤖</span> AI thinks
            </h2>
            <p className="text-sm text-text-secondary/80">
              AI insights about this issue are coming soon — summaries,
              suggested actions, and who might help.
            </p>
          </section>

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

          {/* Owner-only: manage member roles (promote/demote moderators). */}
          {isOwner && members.length > 0 && (
            <MembersPanel groupId={group.id} initialMembers={members} />
          )}

          {/* Owner/moderator: suspend/unsuspend (and owner-only delete). */}
          {canModerate && (
            <GroupModerationCard
              groupId={group.id}
              status={group.status}
              isOwner={isOwner}
              canModerate={canModerate}
            />
          )}

          {user && isMember && <OpenGroupChatButton groupId={group.id} />}
        </aside>
      </div>
    </div>
  );
}
