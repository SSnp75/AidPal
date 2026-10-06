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
        className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
      >
        {pending ? "…" : "Post"}
      </button>
      {state && !state.ok && (
        <p
          id={`comment-err-${postId}`}
          role="alert"
          className="text-xs text-red-400"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
