"use client";

import { useActionState, useRef } from "react";
import { createPost } from "@/app/groups/actions";
import type { ActionResult } from "@/app/auth/actions";

interface Props {
  groupId: string;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024;

export default function MediaUploadForm({ groupId }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (_prev, formData) => {
    const result = await createPost(null, formData);
    if (result.ok) {
      formRef.current?.reset();
    }
    return result;
  }, null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("Images only (JPEG, PNG, WebP, GIF).");
      e.target.value = "";
    } else if (file.size > MAX_SIZE) {
      alert("Image must be 5 MB or smaller.");
      e.target.value = "";
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3"
    >
      <h2 className="text-sm font-semibold text-text-primary">New Post</h2>
      <input type="hidden" name="groupId" value={groupId} />

      {state && !state.ok && (
        <p role="alert" className="text-sm text-reaction-love">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="post-body" className="sr-only">
          Post text
        </label>
        <textarea
          id="post-body"
          name="body"
          maxLength={2000}
          rows={3}
          placeholder="What's happening?"
          className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>

      <div>
        <label htmlFor="post-image" className="block text-sm text-text-secondary mb-1">
          Image (optional)
        </label>
        <input
          id="post-image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          className="text-sm text-text-secondary file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-text-primary hover:file:bg-accent-light hover:file:text-white"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-5 py-2 text-sm text-white font-medium hover:bg-accent-light disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        {pending ? "Posting…" : "Post"}
      </button>
    </form>
  );
}
