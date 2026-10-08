"use client";

import { useState, useTransition } from "react";
import { sendFriendRequest } from "./actions";

const btnBase =
  "inline-flex items-center gap-1 rounded-lg border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function AddFriendButton({
  userId,
  name,
}: {
  userId: string;
  name?: string;
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (sent || isPending) return;
    setError(null);
    setSent(true); // optimistic

    startTransition(async () => {
      const r = await sendFriendRequest(userId);
      if (!r.ok) {
        setSent(false);
        setError(r.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={sent || isPending}
        aria-disabled={sent || isPending}
        aria-label={name ? `Add ${name} as a friend` : "Add friend"}
        className={btnBase}
      >
        {sent ? "Request sent" : "Add friend"}
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
