"use client";

import { useState, useTransition } from "react";
import { setCommentStatus, deleteComment } from "@/app/groups/actions";
import type { ModerationStatus } from "@/types/db";

export default function CommentModerationControls({
  commentId,
  groupId,
  status,
  canDelete,
  canModerate,
}: {
  commentId: string;
  groupId: string;
  status: ModerationStatus;
  canDelete: boolean;
  canModerate: boolean;
}) {
  const [current, setCurrent] = useState<ModerationStatus>(status);
  const [confirming, setConfirming] = useState(false);
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
      const r = await setCommentStatus({ commentId, groupId, status: next });
      if (!r.ok) {
        setCurrent(prev);
        setError(r.error);
      }
    });
  }

  function removeComment() {
    setError(null);
    startTransition(async () => {
      const r = await deleteComment({ commentId, groupId });
      if (!r.ok) {
        setError(r.error);
        setConfirming(false);
      }
    });
  }

  return (
    <span className="ml-2 inline-flex items-center gap-1.5 align-middle text-xs">
      {canModerate && (
        <button
          type="button"
          onClick={toggleStatus}
          disabled={isPending}
          className="text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          {current === "active" ? "Suspend" : "Unsuspend"}
        </button>
      )}
      {canDelete &&
        (confirming ? (
          <>
            <button
              type="button"
              onClick={removeComment}
              disabled={isPending}
              className="font-medium text-reaction-love hover:opacity-80 disabled:opacity-50"
            >
              Click again
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={isPending}
            className="text-reaction-love hover:opacity-80 disabled:opacity-50"
          >
            Delete
          </button>
        ))}
      {error && <span className="text-reaction-love">{error}</span>}
    </span>
  );
}
