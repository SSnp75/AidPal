"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendMessage } from "../actions";
import type { Message } from "@/types/db";

type MessageRow = Pick<
  Message,
  "id" | "conversation_id" | "sender_id" | "body" | "created_at"
>;

const btnBase =
  "inline-flex items-center justify-center gap-1 rounded-lg px-4 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function Thread({
  conversationId,
  initialMessages,
  senderNames,
}: {
  conversationId: string;
  initialMessages: MessageRow[];
  senderNames: Record<string, string>;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ~7s poller: re-run the server component to re-read messages through RLS.
  // No Supabase Realtime / websockets — just router.refresh() on an interval,
  // paused while the tab is hidden, cleared on unmount.
  const refreshRef = useRef(() => router.refresh());
  refreshRef.current = () => router.refresh();
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) refreshRef.current();
    }, 7000);
    return () => clearInterval(id);
  }, []);

  const trimmed = body.trim();
  const canSend = !isPending && trimmed.length > 0;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSend) return;
    setError(null);
    startTransition(async () => {
      const r = await sendMessage({ conversationId, body });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {initialMessages.length === 0 ? (
        <p className="text-text-secondary">No messages yet. Say hello.</p>
      ) : (
        <ul aria-label="Messages" className="space-y-3">
          {initialMessages.map((m) => (
            <li
              key={m.id}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-text-secondary">
                  {senderNames[m.sender_id] ?? "Someone"}
                </span>
                <span className="text-xs text-text-secondary">
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-text-primary">{m.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label htmlFor="message-body" className="sr-only">
          Message
        </label>
        <textarea
          id="message-body"
          name="body"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          className="w-full rounded-2xl border border-border bg-card p-3 text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={!canSend}
            aria-disabled={!canSend}
            className={btnBase}
          >
            Send
          </button>
        </div>
        {error && (
          <p
            role="status"
            aria-live="polite"
            className="text-xs text-text-secondary"
          >
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
