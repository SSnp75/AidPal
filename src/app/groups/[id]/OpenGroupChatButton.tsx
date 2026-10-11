"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateGroupConversation } from "@/app/messages/actions";

const btnClass =
  "flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-side-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-default disabled:opacity-60";

export default function OpenGroupChatButton({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const r = await getOrCreateGroupConversation({ groupId });
      if (r.ok) {
        router.push(`/messages/${r.conversationId}`);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-disabled={isPending}
        className={btnClass}
      >
        Open group chat
      </button>
      {error && (
        <p role="status" aria-live="polite" className="mt-1 text-xs text-text-secondary">
          {error}
        </p>
      )}
    </div>
  );
}
