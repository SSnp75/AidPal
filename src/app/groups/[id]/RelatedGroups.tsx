"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  addRelatedGroup,
  removeRelatedGroup,
  setRelationsOpen,
} from "@/app/groups/actions";

interface RelatedItem {
  id: string;
  name: string;
}

interface Props {
  groupId: string;
  related: RelatedItem[];
  /** Groups to suggest when the search box is empty (created / member / recent). */
  suggestions: RelatedItem[];
  /** Can the current viewer add/remove relations for this group? */
  canRelate: boolean;
  /** Is the viewer the group owner (can toggle open/restricted)? */
  isOwner: boolean;
  relationsOpen: boolean;
}

export default function RelatedGroups({
  groupId,
  related,
  suggestions,
  canRelate,
  isOwner,
  relationsOpen,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RelatedItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(relationsOpen);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const relatedIds = new Set(related.map((r) => r.id));

  async function runSearch(q: string) {
    setQuery(q);
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    let data: RelatedItem[] | null = null;
    try {
      const supabase = createBrowserClient();
      // RLS limits to groups the viewer can see.
      const res = await supabase
        .from("groups")
        .select("id, name")
        .ilike("name", `%${term.replace(/[%_,]/g, " ")}%`)
        .limit(10)
        .returns<RelatedItem[]>();
      data = res.data;
    } catch {
      data = null;
    }
    setResults(
      (data ?? []).filter((g) => g.id !== groupId && !relatedIds.has(g.id))
    );
    setSearching(false);
  }

  function onAdd(otherGroupId: string) {
    setError(null);
    startTransition(async () => {
      const r = await addRelatedGroup({ groupId, otherGroupId });
      if (!r.ok) setError(r.error);
      else {
        setQuery("");
        setResults([]);
      }
    });
  }

  function onRemove(otherGroupId: string) {
    setError(null);
    startTransition(async () => {
      const r = await removeRelatedGroup({ groupId, otherGroupId });
      if (!r.ok) setError(r.error);
    });
  }

  function onToggleOpen() {
    const next = !open;
    setOpen(next);
    startTransition(async () => {
      const r = await setRelationsOpen({ groupId, open: next });
      if (!r.ok) {
        setOpen(!next);
        setError(r.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-side-border bg-side-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Related groups
        </h2>
        {isOwner && (
          <button
            type="button"
            onClick={onToggleOpen}
            disabled={isPending}
            className="text-[11px] text-text-secondary underline underline-offset-2 hover:text-text-primary disabled:opacity-50"
            title="Who can add related groups"
          >
            {open ? "Open to members" : "Owner only"}
          </button>
        )}
      </div>

      {related.length === 0 ? (
        <p className="text-xs text-text-secondary/70">No related groups yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {related.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2">
              <Link
                href={`/groups/${g.id}`}
                className="truncate text-sm font-bold text-text-primary hover:text-accent"
                title={g.name}
              >
                {g.name}
              </Link>
              {canRelate && (
                <button
                  type="button"
                  onClick={() => onRemove(g.id)}
                  disabled={isPending}
                  aria-label={`Remove relation to ${g.name}`}
                  className="shrink-0 text-xs text-text-secondary hover:text-reaction-love disabled:opacity-50"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canRelate && (
        <div className="mt-3">
          <label htmlFor="relate-search" className="sr-only">
            Search groups to relate
          </label>
          <input
            id="relate-search"
            type="text"
            value={query}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Add a related group…"
            className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          {searching && (
            <p className="mt-1 text-xs text-text-secondary">Searching…</p>
          )}

          {/* Search results when typing; suggestions when the box is empty. */}
          {(() => {
            const list =
              query.trim().length >= 2
                ? results
                : suggestions.filter((g) => !relatedIds.has(g.id));
            if (list.length === 0) return null;
            return (
              <>
                {query.trim().length < 2 && (
                  <p className="mt-2 mb-1 text-[11px] uppercase tracking-wide text-text-secondary/70">
                    Suggested
                  </p>
                )}
                <ul className="mt-1 flex flex-col gap-1">
                  {list.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => onAdd(g.id)}
                        disabled={isPending}
                        className="w-full truncate rounded px-2 py-1 text-left text-sm text-text-primary hover:bg-card disabled:opacity-50"
                      >
                        + {g.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            );
          })()}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-reaction-love">{error}</p>}
    </section>
  );
}
