"use client";

import { useState, useTransition } from "react";
import { setGroupMemberRole, transferGroupOwnership } from "@/app/groups/actions";

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

  const [confirmOwnerId, setConfirmOwnerId] = useState<string | null>(null);

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

  function makeOwner(userId: string) {
    setError(null);
    setConfirmOwnerId(null);
    startTransition(async () => {
      const r = await transferGroupOwnership({ groupId, newOwnerId: userId });
      if (!r.ok) setError(r.error);
      // On success the server revalidates the page; the new owner/role layout
      // re-renders (this owner becomes a member and loses this panel).
    });
  }

  return (
    <section className="rounded-2xl border border-side-border bg-side-card p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Members &amp; roles
      </h2>
      <ul className="flex flex-col gap-1.5">
        {members.map((m) => (
          <li key={m.user_id} className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
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
            </div>

            {/* Transfer ownership: owner-only panel, any non-owner member. */}
            {m.role !== "owner" &&
              (confirmOwnerId === m.user_id ? (
                <div className="flex items-center gap-2 rounded-lg bg-secondary px-2 py-1">
                  <span className="flex-1 text-xs text-text-secondary">
                    Make {m.name} the owner? You become a member.
                  </span>
                  <button
                    type="button"
                    onClick={() => makeOwner(m.user_id)}
                    disabled={isPending}
                    className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white hover:bg-accent-light disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOwnerId(null)}
                    disabled={isPending}
                    className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmOwnerId(m.user_id)}
                  disabled={isPending}
                  className="self-start text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary disabled:opacity-50"
                >
                  Make owner
                </button>
              ))}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-reaction-love">{error}</p>}
    </section>
  );
}
