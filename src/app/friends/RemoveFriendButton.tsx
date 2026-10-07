"use client";

import { useState, useTransition } from "react";
import { removeFriend } from "./actions";

const btnBase =
  "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function RemoveFriendButton({
  userId,
  name,
}: {
  userId: string;
  name?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (isPending) return;
    const who = name ?? "this person";
    if (!window.confirm(`Remove ${who} from your friends?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await removeFriend(userId);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-disabled={isPending}
        aria-label={name ? `Remove ${name} from friends` : "Remove friend"}
        className={btnBase}
      >
        Remove
      </button>
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
