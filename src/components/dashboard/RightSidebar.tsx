import Link from "next/link";
import Avatar from "./Avatar";
import type { TrendingItem, SuggestedPerson } from "@/lib/sampleFeed";

interface GroupSummary {
  id: string;
  name: string;
}

function GroupList({
  title,
  groups,
  emptyText,
}: {
  title: string;
  groups: GroupSummary[];
  emptyText: string;
}) {
  return (
    <section className="rounded-2xl border border-side-border bg-side-card p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </h2>
      {groups.length === 0 ? (
        <p className="text-xs text-text-secondary/70">{emptyText}</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/groups/${g.id}`}
                className="block truncate rounded-lg px-2 py-1.5 text-sm text-text-primary transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                title={g.name}
              >
                {g.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function RightSidebar({
  trending,
  suggestions,
  createdGroups,
  interestedGroups,
  memberGroups,
}: {
  trending: TrendingItem[];
  suggestions: SuggestedPerson[];
  createdGroups: GroupSummary[];
  interestedGroups: GroupSummary[];
  memberGroups: GroupSummary[];
}) {
  return (
    <aside
      aria-label="Groups, trending and suggestions"
      className="hidden flex-col gap-6 min-[992px]:flex"
    >
      {/* Group lists */}
      <GroupList
        title="Created Groups"
        groups={createdGroups}
        emptyText="You haven't created any groups yet."
      />
      <GroupList
        title="Interested Groups"
        groups={interestedGroups}
        emptyText="No interested groups yet."
      />
      <GroupList
        title="Member of Groups"
        groups={memberGroups}
        emptyText="You're not a member of any groups yet."
      />

      {/* Trending Now */}
      <div className="rounded-2xl border border-side-border bg-side-card p-5">
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          Trending Now
        </h2>
        <ul className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
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
      <div className="rounded-2xl border border-side-border bg-side-card p-5">
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          Suggested For You
        </h2>
        <ul className="flex max-h-72 flex-col gap-4 overflow-y-auto pr-1">
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
