"use client";

import { useActionState } from "react";
import { createGroup } from "@/app/groups/actions";
import type { ActionResult } from "@/app/auth/actions";

export default function NewGroupForm() {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(createGroup, null);

  const fieldErrors =
    state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold text-teal-400 mb-6">Create a Group</h1>

      <form action={formAction} className="space-y-4">
        {state && !state.ok && !state.fieldErrors && (
          <p role="alert" className="text-red-400 text-sm">
            {state.error}
          </p>
        )}

        <div>
          <label htmlFor="name" className="block text-sm text-gray-300 mb-1">
            Group name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={100}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          />
          {fieldErrors.name && (
            <p id="name-error" className="mt-1 text-sm text-red-400">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm text-gray-300 mb-1"
          >
            Description (optional)
          </label>
          <textarea
            id="description"
            name="description"
            maxLength={1000}
            rows={3}
            aria-describedby={fieldErrors.description ? "desc-error" : undefined}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          />
          {fieldErrors.description && (
            <p id="desc-error" className="mt-1 text-sm text-red-400">
              {fieldErrors.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="isPrivate"
            name="isPrivate"
            type="checkbox"
            className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-500"
          />
          <label htmlFor="isPrivate" className="text-sm text-gray-300">
            Make this group private
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-teal-600 px-4 py-2 text-white font-medium hover:bg-teal-500 disabled:opacity-50 transition-colors"
        >
          {pending ? "Creating…" : "Create Group"}
        </button>
      </form>
    </div>
  );
}
