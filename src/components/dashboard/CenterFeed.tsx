import Avatar from "./Avatar";
import PostCard from "./PostCard";
import type { SamplePost } from "@/lib/sampleFeed";

export default function CenterFeed({
  composerName,
  latestPosts,
  trendingPosts,
}: {
  composerName: string;
  latestPosts: SamplePost[];
  trendingPosts: SamplePost[];
}) {
  return (
    <section className="flex flex-col gap-3">
      {/* Create-post composer */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex gap-3">
          <Avatar name={composerName} />
          <div className="flex-1">
            <label htmlFor="compose-post" className="sr-only">
              What&apos;s on your mind?
            </label>
            <textarea
              id="compose-post"
              placeholder="What's on your mind?"
              readOnly
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-text-primary placeholder-text-secondary/50 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <div className="flex gap-2">
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-text-secondary transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span aria-hidden="true">📷</span> Photo
            </button>
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-text-secondary transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span aria-hidden="true">🎬</span> Video
            </button>
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-text-secondary transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span aria-hidden="true">😊</span> Feeling
            </button>
          </div>
          <button
            type="button"
            disabled
            className="rounded-full bg-accent px-5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            Post
          </button>
        </div>
      </div>

      {/* Trending posts */}
      {trendingPosts.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <span aria-hidden="true">🔥</span>
            <h2 className="text-base font-semibold text-text-primary">
              Trending Posts
            </h2>
          </div>
          {/* One vertical scroll box for all trending content. Each card is
              shrink-0 so it keeps full height; the box scrolls instead. */}
          <div className="max-h-[80vh] space-y-3 overflow-y-auto rounded-xl border border-border p-2">
            {trendingPosts.map((post) => (
              <div key={`trending-${post.id}`} className="shrink-0">
                <PostCard post={post} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Latest / unread posts */}
      <div className="flex items-center gap-2 pt-1">
        <span aria-hidden="true">🆕</span>
        <h2 className="text-base font-semibold text-text-primary">
          Latest Posts
        </h2>
      </div>
      {latestPosts.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-text-secondary">
          No posts yet. Join a group and start sharing.
        </p>
      ) : (
        /* One vertical scroll box for all latest content. */
        <div className="max-h-[600px] space-y-3 overflow-y-auto rounded-xl border border-border p-2">
          {latestPosts.map((post) => (
            <div key={`latest-${post.id}`} className="shrink-0">
              <PostCard post={post} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
