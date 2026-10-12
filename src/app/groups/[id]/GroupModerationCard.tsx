"use client";

import { useState, useTransition } from "react";
import { setGroupStatus, deleteGroup } from "@/app/groups/actions";
import type { ModerationStatus } from "@/types/db";

export default function GroupModerationCard({
  groupId,
  status,
  isOwner,
  canModerate,
}: {
  groupId: string;
  status: ModerationStatus;
  isOwner: boolean;
  canModerate: boolean;
}) {
  const [current, setCurrent] = useState<ModerationStatus>(status);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The page only mounts this card when canModerate is true, but guard anyway.
  if (!canModerate) return null;

  function toggleStatus() {
    setError(null);
    const prev = current;
    const next: ModerationStatus =
      current === "active" ? "suspended" : "active";
    setCurrent(next);
    startTransition(async () => {
      const r = await setGroupStatus({ groupId, status: next });
      if (!r.ok) {
        setCurrent(prev);
        setError(r.error);
      }
    });
  }

  function removeGroup() {
    setError(null);
    startTransition(async () => {
      // On success this redirects; a returned result means it failed.
      const r = await deleteGroup({ groupId });
      if (r && !r.ok) {
        setError(r.error);
        setConfirming(false);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-side-border bg-side-card p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Moderation
      </h2>

      {current === "suspended" && (
        <p className="mb-2 rounded-lg bg-secondary px-2 py-1 text-xs text-text-secondary">
          This group is suspended. Only owners and moderators can see it.
        </p>
      )}

      <button
        type="button"
        onClick={toggleStatus}
        disabled={isPending}
        className="w-full rounded-full border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-secondary disabled:opacity-50"
      >
        {current === "active" ? "Suspend group" : "Unsuspend group"}
      </button>

      {isOwner && (
        <div className="mt-4 border-t border-side-border pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-reaction-love">
            Danger zone
          </h3>
          {confirming ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-text-secondary">
                Click again to permanently delete this group and all its
                content.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={removeGroup}
                  disabled={isPending}
                  className="flex-1 rounded-full bg-reaction-love px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Delete permanently
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={isPending}
                  className="rounded-full border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={isPending}
              className="w-full rounded-full border border-reaction-love px-3 py-1.5 text-sm text-reaction-love hover:bg-reaction-love/10 disabled:opacity-50"
            >
              Delete group
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-reaction-love">{error}</p>}
    </section>
  );
}
