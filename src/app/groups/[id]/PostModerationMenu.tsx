"use client";

import { useState, useTransition } from "react";
import { setPostStatus, deletePost } from "@/app/groups/actions";
import type { ModerationStatus } from "@/types/db";

export default function PostModerationMenu({
  postId,
  groupId,
  status,
  canDelete,
  canModerate,
}: {
  postId: string;
  groupId: string;
  status: ModerationStatus;
  canDelete: boolean;
  canModerate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [current, setCurrent] = useState<ModerationStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canDelete && !canModerate) return null;

  function toggleStatus() {
    setError(null);
    const prev = current;
    const next: ModerationStatus =
      current === "active" ? "suspended" : "active";
    setCurrent(next);
    startTransition(async () => {
      const r = await setPostStatus({ postId, groupId, status: next });
      if (!r.ok) {
        setCurrent(prev);
        setError(r.error);
      } else {
        setOpen(false);
      }
    });
  }

  function removePost() {
    setError(null);
    startTransition(async () => {
      const r = await deletePost({ postId, groupId });
      if (!r.ok) {
        setError(r.error);
        setConfirming(false);
      }
      // On success the server revalidatePath re-renders without this post.
    });
  }

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Post moderation menu"
        aria-expanded={open}
        className="rounded-full px-2 py-1 min-h-9 min-w-9 inline-flex items-center justify-center min-[992px]:min-h-0 min-[992px]:min-w-0 text-text-secondary hover:bg-secondary hover:text-text-primary"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-52 max-w-[calc(100vw-2rem)] rounded-xl border border-side-border bg-side-card p-2 shadow-lg">
          {canModerate && (
            <button
              type="button"
              onClick={toggleStatus}
              disabled={isPending}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-text-primary hover:bg-secondary disabled:opacity-50"
            >
              {current === "active" ? "Suspend post" : "Unsuspend post"}
            </button>
          )}
          {canDelete &&
            (confirming ? (
              <div className="mt-1 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={removePost}
                  disabled={isPending}
                  className="block w-full rounded-lg bg-reaction-love px-2 py-1.5 text-left text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Click again to delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={isPending}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={isPending}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-reaction-love hover:bg-reaction-love/10 disabled:opacity-50"
              >
                Delete post
              </button>
            ))}
          {error && (
            <p className="mt-1 px-2 text-xs text-reaction-love">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
