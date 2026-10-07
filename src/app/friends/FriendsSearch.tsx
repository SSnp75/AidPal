"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FriendsSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/friends?q=${encodeURIComponent(q)}` : "/friends");
  }

  return (
    <form onSubmit={onSubmit} className="mb-4 flex items-center gap-2" role="search">
      <label htmlFor="friends-search" className="sr-only">
        Search people by name
      </label>
      <input
        id="friends-search"
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search people by name"
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <button
        type="submit"
        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Search
      </button>
    </form>
  );
}
