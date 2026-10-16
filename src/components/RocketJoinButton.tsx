"use client";

import { useState, useTransition } from "react";
import { joinGroup } from "@/app/groups/actions";

interface Props {
  groupId: string;
  initialJoined: boolean;
}

const btnBase =
  "inline-flex items-center gap-0.5 rounded px-2 py-1.5 min-h-9 min-w-9 min-[992px]:px-1 min-[992px]:py-0.5 min-[992px]:min-h-0 min-[992px]:min-w-0 text-[10px] leading-none transition-colors disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * One-way "rocket" join affordance, separate from the three reactions. Pressing
 * joins the post's group (idempotent); pressing again does NOT leave (leaving
 * is the explicit LeaveGroupButton). After a successful join the button reflects
 * the joined state and no longer acts.
 */
export default function RocketJoinButton({ groupId, initialJoined }: Props) {
  const [joined, setJoined] = useState(initialJoined);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (joined || isPending) return;
    setJoined(true); // optimistic
    startTransition(async () => {
      const result = await joinGroup({ groupId });
      // joinGroup is idempotent; on failure revert so the user can retry.
      if (!result.ok) setJoined(false);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={joined || isPending}
      aria-pressed={joined}
      aria-label={joined ? "Joined group" : "Join group"}
      className={`${btnBase} ${
        joined
          ? "text-accent bg-reaction-bg"
          : "text-text-secondary hover:text-text-primary"
      }`}
    >
      <span aria-hidden="true" className="text-[14px] leading-none">
        🚀
      </span>
      <span>{joined ? "Joined" : "Join"}</span>
    </button>
  );
}
