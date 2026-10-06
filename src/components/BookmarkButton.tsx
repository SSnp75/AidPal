"use client";

import { useState, useTransition } from "react";
import { toggleBookmark } from "@/app/groups/actions";

interface Props {
  postId: string;
  initialBookmarked: boolean;
  /** true for placeholder/sample posts → render inert (no live actions). */
  disabled?: boolean;
}

const btnBase =
  "inline-flex items-center justify-center rounded-lg px-2 py-1.5 text-sm transition-colors disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function BookmarkButton({
  postId,
  initialBookmarked,
  disabled = false,
}: Props) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (disabled || isPending) return;

    const prev = bookmarked;
    // Optimistic flip.
    setBookmarked(!prev);

    startTransition(async () => {
      const r = await toggleBookmark({ postId });
      if (r.ok) {
        setBookmarked(r.bookmarked);
      } else {
        setBookmarked(prev);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isPending}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? "Saved — remove bookmark" : "Save post"}
      className={`${btnBase} ${
        bookmarked
          ? "text-accent"
          : "text-text-secondary hover:text-text-primary"
      }`}
    >
      <span aria-hidden="true">{bookmarked ? "🔖" : "🏷️"}</span>
    </button>
  );
}
