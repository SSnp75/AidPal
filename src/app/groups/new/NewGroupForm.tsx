"use client";

import { useActionState } from "react";
import { createGroup } from "@/app/groups/actions";
import type { ActionResult } from "@/app/auth/actions";
import type { Country, GroupCategory } from "@/types/db";

const inputClass =
  "w-full rounded-lg border border-border bg-secondary px-3 py-2 text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const labelClass = "block text-sm text-text-secondary mb-1";
const errClass = "mt-1 text-sm text-reaction-love";

export default function NewGroupForm({
  countries,
  categories,
}: {
  countries: Country[];
  categories: GroupCategory[];
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(createGroup, null);

  const fieldErrors = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold text-accent mb-6">Create a Group</h1>

      <form action={formAction} className="space-y-4">
        {state && !state.ok && !state.fieldErrors && (
          <p role="alert" className="text-sm text-reaction-love">
            {state.error}
          </p>
        )}

        <div>
          <label htmlFor="name" className={labelClass}>
            Group name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={100}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className={inputClass}
          />
          {fieldErrors.name && (
            <p id="name-error" className={errClass}>
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="description" className={labelClass}>
            Description (optional)
          </label>
          <textarea
            id="description"
            name="description"
            maxLength={1000}
            rows={3}
            aria-describedby={fieldErrors.description ? "desc-error" : undefined}
            className={inputClass}
          />
          {fieldErrors.description && (
            <p id="desc-error" className={errClass}>
              {fieldErrors.description}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="category" className={labelClass}>
            Category <span className="text-reaction-love">*</span>
          </label>
          <select
            id="category"
            name="category"
            required
            defaultValue=""
            aria-describedby={fieldErrors.category ? "category-error" : undefined}
            className={inputClass}
          >
            <option value="" disabled>
              Select a category…
            </option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
          {fieldErrors.category && (
            <p id="category-error" className={errClass}>
              {fieldErrors.category}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="country-input" className={labelClass}>
            Country (optional)
          </label>
          <select
            id="country-input"
            name="country"
            defaultValue=""
            aria-describedby={fieldErrors.country ? "country-error" : undefined}
            className={inputClass}
          >
            <option value="">— No country (global / online) —</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag ? `${c.flag} ` : ""}
                {c.name}
              </option>
            ))}
          </select>
          {fieldErrors.country && (
            <p id="country-error" className={errClass}>
              {fieldErrors.country}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="city" className={labelClass}>
            City (optional)
          </label>
          <input
            id="city"
            name="city"
            type="text"
            maxLength={100}
            aria-describedby={fieldErrors.city ? "city-error" : undefined}
            className={inputClass}
          />
          {fieldErrors.city && (
            <p id="city-error" className={errClass}>
              {fieldErrors.city}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="scope" className={labelClass}>
            Scope
          </label>
          <select
            id="scope"
            name="scope"
            defaultValue="local"
            className={inputClass}
          >
            <option value="local">Local</option>
            <option value="national">National</option>
            <option value="global">Global</option>
          </select>
        </div>

        <div>
          <label htmlFor="tags" className={labelClass}>
            Tags (optional)
          </label>
          <input
            id="tags"
            name="tags"
            type="text"
            placeholder="beach-cleanup, tree-planting"
            aria-describedby="tags-help"
            className={inputClass}
          />
          <p id="tags-help" className="mt-1 text-xs text-text-secondary">
            Up to 10, comma-separated. Spaces become hyphens; lowercased.
          </p>
          {fieldErrors.tags && <p className={errClass}>{fieldErrors.tags}</p>}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="isPrivate"
            name="isPrivate"
            type="checkbox"
            className="h-4 w-4 rounded border-border bg-secondary text-accent focus-visible:ring-2 focus-visible:ring-accent"
          />
          <label htmlFor="isPrivate" className="text-sm text-text-secondary">
            Make this group private
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-4 py-2 font-medium text-white transition-colors hover:bg-accent-light disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create Group"}
        </button>
      </form>
    </div>
  );
}
