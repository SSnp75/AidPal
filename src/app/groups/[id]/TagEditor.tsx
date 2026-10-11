"use client";

import { useState, useTransition } from "react";
import { addGroupTag, removeGroupTag } from "@/app/groups/actions";

interface Props {
  groupId: string;
  initialTags: string[];
  /** Only members may edit; others see read-only chips. */
  canEdit: boolean;
}

export default function TagEditor({ groupId, initialTags, canEdit }: Props) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const raw = input.trim();
    if (!raw) return;
    setError(null);
    startTransition(async () => {
      const r = await addGroupTag({ groupId, tag: raw });
      if (r.ok) {
        // Re-read is handled by revalidate; optimistically add a normalized guess.
        const norm = raw
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");
        if (norm && !tags.includes(norm)) setTags((t) => [...t, norm]);
        setInput("");
      } else {
        setError(r.error);
      }
    });
  }

  function onRemove(tag: string) {
    setError(null);
    const prev = tags;
    setTags((t) => t.filter((x) => x !== tag));
    startTransition(async () => {
      const r = await removeGroupTag({ groupId, tag });
      if (!r.ok) {
        setTags(prev);
        setError(r.error);
      }
    });
  }

  if (!canEdit && tags.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-accent"
        >
          #{tag}
          {canEdit && (
            <button
              type="button"
              onClick={() => onRemove(tag)}
              disabled={isPending}
              aria-label={`Remove tag ${tag}`}
              className="text-text-secondary hover:text-reaction-love disabled:opacity-50"
            >
              ✕
            </button>
          )}
        </span>
      ))}

      {canEdit && (
        <form onSubmit={onAdd} className="inline-flex items-center gap-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="add tag…"
            maxLength={30}
            className="w-24 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <button
            type="submit"
            disabled={isPending || !input.trim()}
            className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-accent-light disabled:opacity-50"
          >
            +
          </button>
        </form>
      )}

      {error && <span className="text-xs text-reaction-love">{error}</span>}
    </div>
  );
}
