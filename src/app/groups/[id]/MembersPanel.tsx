"use client";

import { useState, useTransition } from "react";
import { setGroupMemberRole } from "@/app/groups/actions";

interface Member {
  user_id: string;
  role: string;
  name: string;
}

export default function MembersPanel({
  groupId,
  initialMembers,
}: {
  groupId: string;
  initialMembers: Member[];
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeRole(userId: string, role: "moderator" | "member") {
    setError(null);
    const prev = members;
    setMembers((ms) =>
      ms.map((m) => (m.user_id === userId ? { ...m, role } : m))
    );
    startTransition(async () => {
      const r = await setGroupMemberRole({ groupId, userId, role });
      if (!r.ok) {
        setMembers(prev);
        setError(r.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-side-border bg-side-card p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Members &amp; roles
      </h2>
      <ul className="flex flex-col gap-1.5">
        {members.map((m) => (
          <li
            key={m.user_id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="truncate text-text-primary" title={m.name}>
              {m.name}
              <span className="ml-1 text-xs text-text-secondary">
                ({m.role})
              </span>
            </span>
            {m.role === "owner" ? null : m.role === "moderator" ? (
              <button
                type="button"
                onClick={() => changeRole(m.user_id, "member")}
                disabled={isPending}
                className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                Demote
              </button>
            ) : (
              <button
                type="button"
                onClick={() => changeRole(m.user_id, "moderator")}
                disabled={isPending}
                className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white hover:bg-accent-light disabled:opacity-50"
              >
                Make moderator
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-reaction-love">{error}</p>}
    </section>
  );
}
