"use client";

import { useState, useTransition } from "react";
import { toggleLike } from "@/app/groups/actions";

interface Props {
  postId: string;
  initialLiked: boolean;
  initialCount: number;
}

export default function LikeButton({
  postId,
  initialLiked,
  initialCount,
}: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const nextLiked = !liked;
    // Optimistic update
    setLiked(nextLiked);
    setCount((c) => c + (nextLiked ? 1 : -1));

    startTransition(async () => {
      const result = await toggleLike({ postId, liked: nextLiked });
      if (result.ok) {
        setCount(result.count);
      } else {
        // Revert
        setLiked(!nextLiked);
        setCount((c) => c + (nextLiked ? -1 : 1));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={liked}
      aria-label={`Like, ${count} ${count === 1 ? "like" : "likes"}`}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors ${
        liked
          ? "bg-teal-600/20 text-teal-300"
          : "bg-gray-800 text-gray-400 hover:text-gray-200"
      } disabled:opacity-50`}
    >
      <span aria-hidden="true">{liked ? "♥" : "♡"}</span>
      <span>{count}</span>
    </button>
  );
}
