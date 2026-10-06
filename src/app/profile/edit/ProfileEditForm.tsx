"use client";

import { useActionState } from "react";
import { upsertProfile } from "@/app/profile/actions";
import type { ActionResult } from "@/app/auth/actions";

interface Props {
  initial: { displayName: string; bio: string; avatarUrl: string };
}

export default function ProfileEditForm({ initial }: Props) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(upsertProfile, null);

  const fieldErrors =
    state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold text-teal-400 mb-6">Edit Profile</h1>

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
            defaultValue={initial.displayName}
            aria-describedby={
              fieldErrors.displayName ? "dn-error" : undefined
            }
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          />
          {fieldErrors.displayName && (
            <p id="dn-error" className="mt-1 text-sm text-red-400">
              {fieldErrors.displayName}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="bio" className="block text-sm text-gray-300 mb-1">
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            maxLength={500}
            rows={3}
            defaultValue={initial.bio}
            aria-describedby={fieldErrors.bio ? "bio-error" : undefined}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          />
          {fieldErrors.bio && (
            <p id="bio-error" className="mt-1 text-sm text-red-400">
              {fieldErrors.bio}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="avatarUrl"
            className="block text-sm text-gray-300 mb-1"
          >
            Avatar URL (optional)
          </label>
          <input
            id="avatarUrl"
            name="avatarUrl"
            type="url"
            maxLength={2048}
            defaultValue={initial.avatarUrl}
            placeholder="https://example.com/photo.jpg"
            aria-describedby={
              fieldErrors.avatarUrl ? "avatar-error" : undefined
            }
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          />
          {fieldErrors.avatarUrl && (
            <p id="avatar-error" className="mt-1 text-sm text-red-400">
              {fieldErrors.avatarUrl}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-teal-600 px-4 py-2 text-white font-medium hover:bg-teal-500 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : "Save Profile"}
        </button>
      </form>
    </div>
  );
}
