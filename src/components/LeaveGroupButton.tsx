"use client";

import { useState, useTransition } from "react";
import { leaveGroup } from "@/app/groups/actions";

interface Props {
  groupId: string;
}

export default function LeaveGroupButton({ groupId }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await leaveGroup({ groupId });
      if (result.ok) {
        setLeft(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (left) {
    return (
      <p className="text-sm text-text-secondary">
        You&apos;ve left this group. Refresh to update.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-full border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {isPending ? "Leaving…" : "Leave group"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-sm text-reaction-love">
          {error}
        </p>
      )}
    </div>
  );
}
