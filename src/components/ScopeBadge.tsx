import type { EventScope } from "@/types/db";

const LABELS: Record<EventScope, string> = {
  individual: "Individual",
  group: "Group",
  public: "Public",
};

/**
 * Small muted-token pill rendering an event's scope. No bright colors —
 * uses bg-side-card / border-border / text-text-secondary only.
 */
export default function ScopeBadge({ scope }: { scope: EventScope }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-side-card px-2.5 py-0.5 text-xs font-medium text-text-secondary">
      {LABELS[scope]}
    </span>
  );
}
