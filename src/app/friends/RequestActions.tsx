"use client";

import { useState, useTransition } from "react";
import { acceptFriendRequest, declineFriendRequest } from "./actions";

const acceptBase =
  "inline-flex items-center gap-1 rounded-lg border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const declineBase =
  "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function RequestActions({
  requesterId,
  name,
}: {
  requesterId: string;
  name?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const r = await action(requesterId);
      if (!r.ok) setError(r.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => run(acceptFriendRequest)}
          disabled={isPending}
          aria-disabled={isPending}
          aria-label={
            name ? `Accept friend request from ${name}` : "Accept friend request"
          }
          className={acceptBase}
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => run(declineFriendRequest)}
          disabled={isPending}
          aria-disabled={isPending}
          aria-label={
            name ? `Decline friend request from ${name}` : "Decline friend request"
          }
          className={declineBase}
        >
          Decline
        </button>
      </div>
      {error && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-text-secondary"
        >
          {error}
        </p>
      )}
    </div>
  );
}
