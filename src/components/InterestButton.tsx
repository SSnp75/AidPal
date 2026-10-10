"use client";

import { useState, useTransition } from "react";
import { markInterested, unmarkInterested } from "@/app/events/actions";

interface Props {
  eventId: string;
  initialInterested: boolean;
}

const btnBase =
  "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";

export default function InterestButton({
  eventId,
  initialInterested,
}: Props) {
  const [interested, setInterested] = useState(initialInterested);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (isPending) return;

    const prev = interested;
    // Optimistic flip.
    setInterested(!prev);

    startTransition(async () => {
      const r = prev
        ? await unmarkInterested({ eventId })
        : await markInterested({ eventId });
      if (r.ok) {
        setInterested(r.interested);
      } else {
        setInterested(prev);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-pressed={interested}
      className={`${btnBase} ${
        interested
          ? "border border-border bg-side-card text-text-secondary hover:text-text-primary"
          : "bg-accent text-white hover:opacity-90"
      }`}
    >
      {interested ? "Interested ✓" : "Interested"}
    </button>
  );
}
