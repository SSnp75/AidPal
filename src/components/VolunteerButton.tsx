"use client";

import { useState, useTransition } from "react";
import {
  volunteerForEvent,
  withdrawVolunteer,
} from "@/app/events/actions";

interface Props {
  eventId: string;
  initialVolunteering: boolean;
}

const btnBase =
  "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";

export default function VolunteerButton({
  eventId,
  initialVolunteering,
}: Props) {
  const [volunteering, setVolunteering] = useState(initialVolunteering);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (isPending) return;

    const prev = volunteering;
    // Optimistic flip.
    setVolunteering(!prev);

    startTransition(async () => {
      const r = prev
        ? await withdrawVolunteer({ eventId })
        : await volunteerForEvent({ eventId });
      if (r.ok) {
        setVolunteering(r.volunteering);
      } else {
        setVolunteering(prev);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-pressed={volunteering}
      className={`${btnBase} ${
        volunteering
          ? "border border-border bg-side-card text-text-secondary hover:text-text-primary"
          : "bg-accent text-white hover:opacity-90"
      }`}
    >
      {volunteering ? "Withdraw" : "Volunteer"}
    </button>
  );
}
