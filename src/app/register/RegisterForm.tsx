"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type ActionResult } from "@/app/auth/actions";

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(signUp, null);

  const confirmSent = state?.ok === true;
  const fieldErrors =
    state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold text-teal-400 mb-6">
        Create your account
      </h1>

      {confirmSent ? (
        <div
          role="alert"
          className="rounded border border-teal-700/40 bg-teal-950/30 p-4 text-teal-200"
        >
          Check your email to confirm your account. The confirmation link will
          sign you in and take you to your profile.
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          {state && !state.ok && !state.fieldErrors && (
            <p role="alert" className="text-red-400 text-sm">
              {state.error}
            </p>
          )}

          <div>
            <label
              htmlFor="displayName"
              className="block text-sm text-gray-300 mb-1"
            >
              Display name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              required
              maxLength={60}
              aria-describedby={
                fieldErrors.displayName ? "displayName-error" : undefined
              }
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            />
            {fieldErrors.displayName && (
              <p id="displayName-error" className="mt-1 text-sm text-red-400">
                {fieldErrors.displayName}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm text-gray-300 mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            />
            {fieldErrors.email && (
              <p id="email-error" className="mt-1 text-sm text-red-400">
                {fieldErrors.email}
              </p>
            )}
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
              minLength={8}
              aria-describedby={
                fieldErrors.password ? "password-error" : undefined
              }
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            />
            {fieldErrors.password && (
              <p id="password-error" className="mt-1 text-sm text-red-400">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-teal-600 px-4 py-2 text-white font-medium hover:bg-teal-500 disabled:opacity-50 transition-colors"
          >
            {pending ? "Creating…" : "Register"}
          </button>
        </form>
      )}

      <p className="mt-4 text-sm text-gray-400">
        Already have an account?{" "}
        <Link href="/login" className="text-teal-400 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
