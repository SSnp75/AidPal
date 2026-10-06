"use client";

import { useState, useTransition } from "react";
import { setReaction } from "@/app/groups/actions";
import type { ReactionType } from "@/types/db";

type Counts = { like: number; love: number; dislike: number };

interface Props {
  postId: string;
  initialCounts: Counts;
  initialMine: ReactionType | null;
  /** true for placeholder/sample posts → render inert (no live actions). */
  disabled?: boolean;
}

const REACTIONS: { type: ReactionType; glyph: string; label: string; noun: string }[] = [
  { type: "like", glyph: "👍", label: "Like", noun: "like" },
  { type: "love", glyph: "❤️", label: "Love", noun: "love" },
  { type: "dislike", glyph: "👎", label: "Dislike", noun: "dislike" },
];

const activeToken: Record<ReactionType, string> = {
  like: "text-reaction-like bg-reaction-bg",
  love: "text-reaction-love bg-reaction-bg",
  dislike: "text-reaction-dislike bg-reaction-bg",
};

const btnBase =
  "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function labelFor(type: ReactionType, counts: Counts): string {
  const n = counts[type];
  const noun = REACTIONS.find((r) => r.type === type)!.noun;
  const word =
    n === 1
      ? noun
      : type === "dislike"
        ? "dislikes"
        : type === "love"
          ? "loves"
          : "likes";
  const label = REACTIONS.find((r) => r.type === type)!.label;
  return `${label}, ${n} ${word}`;
}

export default function ReactionBar({
  postId,
  initialCounts,
  initialMine,
  disabled = false,
}: Props) {
  const [counts, setCounts] = useState<Counts>(initialCounts);
  const [mine, setMine] = useState<ReactionType | null>(initialMine);
  const [isPending, startTransition] = useTransition();

  function onPick(type: ReactionType) {
    if (disabled || isPending) return;

    const prevCounts = counts;
    const prevMine = mine;

    // Optimistic next state.
    const next: Counts = { ...counts };
    let nextMine: ReactionType | null;
    if (mine === type) {
      // clear
      next[type] -= 1;
      nextMine = null;
    } else if (mine === null) {
      // add
      next[type] += 1;
      nextMine = type;
    } else {
      // switch
      next[mine] -= 1;
      next[type] += 1;
      nextMine = type;
    }
    setCounts(next);
    setMine(nextMine);

    startTransition(async () => {
      const r = await setReaction({ postId, type });
      if (r.ok) {
        setCounts(r.counts);
        setMine(r.mine);
      } else {
        setCounts(prevCounts);
        setMine(prevMine);
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      {REACTIONS.map(({ type, glyph }) => {
        const isActive = mine === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onPick(type)}
            disabled={disabled || isPending}
            aria-pressed={isActive}
            aria-label={labelFor(type, counts)}
            className={`${btnBase} ${
              isActive ? activeToken[type] : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <span aria-hidden="true">{glyph}</span>
            <span>{counts[type]}</span>
          </button>
        );
      })}
    </div>
  );
}
