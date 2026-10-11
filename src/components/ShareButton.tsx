"use client";

import { useState } from "react";

interface Props {
  /** Owning group id; the share link targets this group. */
  groupId: string | null;
  /** true for placeholder/sample posts → render inert (no live actions). */
  disabled?: boolean;
}

const btnBase =
  "inline-flex items-center justify-center rounded px-1 py-0.5 text-[14px] leading-none text-text-secondary transition-colors hover:text-text-primary disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function ShareButton({ groupId, disabled = false }: Props) {
  const [copied, setCopied] = useState(false);
  const inert = disabled || !groupId;

  async function onClick() {
    if (inert) return;
    // window/navigator touched only inside the handler so SSR is safe.
    const url = `${window.location.origin}/groups/${groupId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable or denied — never throw.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={inert}
        aria-label="Copy link to this group"
        className={btnBase}
      >
        <span aria-hidden="true">🔗</span>
      </button>
      <span role="status" className="text-[10px] text-text-secondary">
        {copied ? "Copied!" : ""}
      </span>
    </>
  );
}
