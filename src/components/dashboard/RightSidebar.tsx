import Avatar from "./Avatar";
import type { TrendingItem, SuggestedPerson } from "@/lib/sampleFeed";

export default function RightSidebar({
  trending,
  suggestions,
}: {
  trending: TrendingItem[];
  suggestions: SuggestedPerson[];
}) {
  return (
    <aside
      aria-label="Trending and suggestions"
      className="hidden flex-col gap-6 min-[992px]:flex"
    >
      {/* Trending Now */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          Trending Now
        </h2>
        <ul className="flex flex-col gap-3">
          {trending.map((item) => (
            <li key={item.tag} className="flex items-center justify-between">
              <span className="text-sm font-medium text-accent">
                {item.tag}
              </span>
              <span className="text-xs text-text-secondary">
                {item.postCount.toLocaleString()} posts
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Suggested For You */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          Suggested For You
        </h2>
        <ul className="flex flex-col gap-4">
          {suggestions.map((person) => (
            <li key={person.handle} className="flex items-center gap-3">
              <Avatar name={person.name} sizeClass="h-10 w-10 text-xs" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">
                  {person.name}
                </p>
                <p className="text-xs text-text-secondary truncate">
                  @{person.handle}
                </p>
              </div>
              <button
                type="button"
                disabled
                className="shrink-0 rounded-full border border-accent px-3 py-1 text-xs font-medium text-accent transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Follow
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
