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
      <p className="text-sm text-teal-300">
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
        className="rounded bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Joining…" : "Join Group"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
