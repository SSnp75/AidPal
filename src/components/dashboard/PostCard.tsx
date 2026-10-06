import Avatar from "./Avatar";
import type { SamplePost } from "@/lib/sampleFeed";

const engagementBtn =
  "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition-colors disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function PostCard({ post }: { post: SamplePost }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      {/* Author row */}
      <div className="flex items-start gap-3">
        <Avatar name={post.authorName} />
        <div className="flex-1 min-w-0">
          <p className="flex items-center gap-1.5 text-sm">
            <span className="font-semibold text-text-primary">
              {post.authorName}
            </span>
            <span className="text-text-secondary">
              @{post.handle} · {post.timeAgo}
            </span>
          </p>
        </div>
        <button
          type="button"
          disabled
          aria-label="Post options"
          className="shrink-0 rounded-lg p-1 text-text-secondary/50 transition-colors disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span aria-hidden="true">⋯</span>
        </button>
      </div>

      {/* Body */}
      <p className="mt-3 whitespace-pre-wrap text-text-primary leading-relaxed">
        {post.body}
      </p>

      {/* Hashtags */}
      {post.hashtags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {post.hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Engagement row */}
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <button type="button" disabled aria-label={`Like, ${post.likes} likes`} className={engagementBtn}>
          <span aria-hidden="true">❤</span> {post.likes}
        </button>
        <button type="button" disabled aria-label={`Comment, ${post.comments} comments`} className={engagementBtn}>
          <span aria-hidden="true">💬</span> {post.comments}
        </button>
        <button type="button" disabled aria-label={`Repost, ${post.reposts} reposts`} className={engagementBtn}>
          <span aria-hidden="true">🔁</span> {post.reposts}
        </button>
        <button type="button" disabled aria-label="Bookmark" className={`${engagementBtn} ml-auto`}>
          <span aria-hidden="true">🔖</span>
        </button>
      </div>
    </article>
  );
}
