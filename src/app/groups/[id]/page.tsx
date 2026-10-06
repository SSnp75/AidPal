import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import MediaUploadForm from "@/components/MediaUploadForm";
import CommentForm from "@/components/CommentForm";
import LikeButton from "@/components/LikeButton";
import JoinButton from "@/components/JoinButton";
import type { Group, Post, Media, Comment, Profile } from "@/types/db";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return <SupabaseNotConfigured />;
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

  // Posts
  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .eq("group_id", id)
    .order("created_at", { ascending: false })
    .returns<Post[]>();

  const postIds = (posts ?? []).map((p) => p.id);

  // Media, comments, likes, author profiles for these posts
  const [mediaRes, commentsRes, likesRes, authorsRes] = await Promise.all([
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
      ? supabase.from("likes").select("post_id,user_id").in("post_id", postIds)
      : Promise.resolve({ data: [] as { post_id: string; user_id: string }[] }),
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
  ]);

  const mediaByPost = new Map<string, Media>();
  for (const m of mediaRes.data ?? []) mediaByPost.set(m.post_id, m);

  const commentsByPost = new Map<string, Comment[]>();
  for (const c of commentsRes.data ?? []) {
    const arr = commentsByPost.get(c.post_id) ?? [];
    arr.push(c);
    commentsByPost.set(c.post_id, arr);
  }

  const likesByPost = new Map<string, { count: number; mine: boolean }>();
  for (const l of likesRes.data ?? []) {
    const cur = likesByPost.get(l.post_id) ?? { count: 0, mine: false };
    cur.count += 1;
    if (user && l.user_id === user.id) cur.mine = true;
    likesByPost.set(l.post_id, cur);
  }

  const authorNames = new Map<string, string>();
  for (const a of authorsRes.data ?? [])
    authorNames.set(a.id, a.display_name);

  function publicUrl(path: string): string {
    return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
  }

  return (
    <div className="space-y-6">
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
        <h2 className="text-lg font-semibold text-gray-200 mb-3">Posts</h2>
        {!posts || posts.length === 0 ? (
          <p className="text-gray-400">No posts yet.</p>
        ) : (
          <ul className="space-y-6">
            {posts.map((post) => {
              const media = mediaByPost.get(post.id);
              const comments = commentsByPost.get(post.id) ?? [];
              const likeInfo =
                likesByPost.get(post.id) ?? { count: 0, mine: false };
              const authorName =
                authorNames.get(post.author_id) ?? "Someone";

              return (
                <li
                  key={post.id}
                  className="rounded-xl border border-gray-800 bg-gray-900/50 p-4"
                >
                  <p className="text-xs text-gray-500 mb-2">{authorName}</p>

                  {post.body && (
                    <p className="text-gray-200 whitespace-pre-wrap mb-3">
                      {post.body}
                    </p>
                  )}

                  {media && (
                    <img
                      src={publicUrl(media.storage_path)}
                      alt={`Image posted by ${authorName} in ${group.name}`}
                      className="rounded-lg max-h-96 w-auto border border-gray-800 mb-3"
                    />
                  )}

                  <div className="flex items-center gap-3">
                    <LikeButton
                      postId={post.id}
                      initialLiked={likeInfo.mine}
                      initialCount={likeInfo.count}
                    />
                  </div>

                  {/* Comments */}
                  <div className="mt-3 border-t border-gray-800 pt-3">
                    {comments.length > 0 && (
                      <ul className="space-y-2 mb-2">
                        {comments.map((c) => (
                          <li key={c.id} className="text-sm">
                            <span className="text-gray-400">
                              {authorNames.get(c.author_id) ?? "Someone"}:
                            </span>{" "}
                            <span className="text-gray-200">{c.body}</span>
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
    </div>
  );
}
