"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type ActionResult } from "@/app/auth/actions";

export default function LoginForm({
  next,
  authError,
}: {
  next: string;
  authError: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(signIn, null);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold text-teal-400 mb-6">Log in</h1>

      {authError && (
        <p
          role="alert"
          className="mb-4 rounded border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-300"
        >
          We couldn&apos;t confirm your sign-in. Please try again.
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        {state && !state.ok && (
          <p role="alert" className="text-red-400 text-sm">
            {state.error}
          </p>
        )}

        <div>
          <label htmlFor="email" className="block text-sm text-gray-300 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm text-gray-300 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-teal-600 px-4 py-2 text-white font-medium hover:bg-teal-500 disabled:opacity-50 transition-colors"
        >
          {pending ? "Signing in…" : "Log in"}
        </button>
      </form>

      <p className="mt-4 text-sm text-gray-400">
        No account yet?{" "}
        <Link href="/register" className="text-teal-400 hover:underline">
          Register
        </Link>
      </p>
    </div>
  );
}
