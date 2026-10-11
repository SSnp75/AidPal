"use client";

import { useState, useTransition } from "react";
import { joinGroup } from "@/app/groups/actions";

interface Props {
  groupId: string;
}

export default function JoinButton({ groupId }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await joinGroup({ groupId });
      if (result.ok) {
        setJoined(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (joined) {
    return (
      <p className="text-sm text-success">
        You&apos;ve joined. Refresh to post.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-full bg-accent px-4 py-2 text-sm text-white hover:bg-accent-light disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {isPending ? "Joining…" : "Join Group"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-sm text-reaction-love">
          {error}
        </p>
      )}
    </div>
  );
}
