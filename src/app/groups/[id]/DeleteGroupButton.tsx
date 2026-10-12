"use client";

import { useState, useTransition } from "react";
import { deleteGroup } from "@/app/groups/actions";

/**
 * Owner-only group deletion with a two-step confirm so it can't fire on a
 * single accidental click. First click reveals a confirm/cancel pair; the
 * confirm calls the deleteGroup action (which redirects to /groups on success).
 */
export default function DeleteGroupButton({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const r = await deleteGroup({ groupId });
      // On success the action redirects; we only land here on failure.
      if (r && !r.ok) {
        setError(r.error);
        setConfirming(false);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-reaction-love/40 bg-card p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Danger zone
      </h2>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-lg border border-reaction-love/50 px-3 py-2 text-sm font-medium text-reaction-love transition-colors hover:bg-reaction-love/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-reaction-love"
        >
          Delete this group
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-text-primary">
            Delete “{groupName}” and all its posts, members, tags, and events?
            This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              className="flex-1 rounded-lg bg-reaction-love px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-reaction-love"
            >
              {isPending ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-text-primary transition-colors hover:bg-secondary disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-reaction-love">{error}</p>}
    </section>
  );
}
