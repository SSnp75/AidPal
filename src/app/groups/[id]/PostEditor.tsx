"use client";

import { useState, useTransition } from "react";
import PostBody from "@/components/PostBody";
import { editPost } from "@/app/groups/actions";

/**
 * Inline post-body editor for owners/moderators. Renders the post body
 * normally with a small "Edit" affordance; when editing, swaps the body for a
 * full-width textarea (in place, not a cramped popover) with Save/Cancel.
 * Non-moderators just see the body (no edit control).
 */
export default function PostEditor({
  postId,
  groupId,
  body,
  edited,
  canModerate,
}: {
  postId: string;
  groupId: string;
  body: string;
  edited: boolean;
  canModerate: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await editPost({ postId, groupId, body: draft });
      if (r.ok) setEditing(false);
      else setError(r.error);
    });
  }

  if (editing) {
    return (
      <div className="mb-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          rows={4}
          autoFocus
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[15px] text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={isPending || !draft.trim()}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-light disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(body);
              setError(null);
            }}
            disabled={isPending}
            className="rounded-full border border-border px-4 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
          >
            Cancel
          </button>
          {error && <span className="text-xs text-reaction-love">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-1.5">
      <PostBody
        text={body}
        className="text-[15px] text-text-primary whitespace-pre-wrap leading-snug"
      />
      <span className="mt-0.5 flex items-center gap-2 text-[11px] text-text-secondary">
        {edited && <span className="italic">(edited)</span>}
        {canModerate && (
          <button
            type="button"
            onClick={() => {
              setDraft(body);
              setEditing(true);
            }}
            className="underline underline-offset-2 hover:text-text-primary"
          >
            ✎ Edit
          </button>
        )}
      </span>
    </div>
  );
}
