"use client";

import { useActionState, useRef } from "react";
import { addComment } from "@/app/groups/actions";
import type { ActionResult } from "@/app/auth/actions";

interface Props {
  postId: string;
}

export default function CommentForm({ postId }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (_prev, formData) => {
    const result = await addComment(null, formData);
    if (result.ok) {
      formRef.current?.reset();
    }
    return result;
  }, null);

  return (
    <form ref={formRef} action={formAction} className="flex gap-2 mt-2">
      <input type="hidden" name="postId" value={postId} />
      <label htmlFor={`comment-${postId}`} className="sr-only">
        Add a comment
      </label>
      <input
        id={`comment-${postId}`}
        name="body"
        type="text"
        required
        maxLength={1000}
        placeholder="Write a comment…"
        aria-describedby={
          state && !state.ok ? `comment-err-${postId}` : undefined
        }
        className="flex-1 rounded-full border border-border bg-secondary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-light disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {pending ? "…" : "Post"}
      </button>
      {state && !state.ok && (
        <p
          id={`comment-err-${postId}`}
          role="alert"
          className="text-xs text-reaction-love"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
