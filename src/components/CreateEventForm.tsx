"use client";

import { useActionState, useRef, useState } from "react";
import { createEvent } from "@/app/events/actions";
import type { ActionResult } from "@/app/auth/actions";
import type { EventScope } from "@/types/db";

interface Props {
  /** Groups the viewer belongs to — populates the group picker. */
  groups: { id: string; name: string }[];
  /** Pre-bind a group (used by the group-detail Create Event entry). */
  presetGroupId?: string;
  /** Pre-select a scope (e.g. "group" from the group-detail entry). */
  presetScope?: EventScope;
}

const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const labelClass = "block text-sm font-medium text-text-primary mb-1";
const errClass = "mt-1 text-xs text-text-secondary";

export default function CreateEventForm({
  groups,
  presetGroupId,
  presetScope,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [scope, setScope] = useState<EventScope>(presetScope ?? "individual");

  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (_prev, formData) => {
    // createEvent redirects on success; a returned result means an error.
    return await createEvent(null, formData);
  }, null);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded-2xl border border-border bg-card p-5"
    >
      <div>
        <label htmlFor="event-title" className={labelClass}>
          Title
        </label>
        <input
          id="event-title"
          name="title"
          type="text"
          required
          maxLength={120}
          aria-describedby={fieldErrors?.title ? "event-title-err" : undefined}
          className={inputClass}
        />
        {fieldErrors?.title && (
          <p id="event-title-err" role="alert" className={errClass}>
            {fieldErrors.title}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="event-description" className={labelClass}>
          Description
        </label>
        <textarea
          id="event-description"
          name="description"
          rows={3}
          maxLength={2000}
          aria-describedby={
            fieldErrors?.description ? "event-description-err" : undefined
          }
          className={inputClass}
        />
        {fieldErrors?.description && (
          <p id="event-description-err" role="alert" className={errClass}>
            {fieldErrors.description}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="event-location" className={labelClass}>
          Location
        </label>
        <input
          id="event-location"
          name="location"
          type="text"
          maxLength={200}
          aria-describedby={
            fieldErrors?.location ? "event-location-err" : undefined
          }
          className={inputClass}
        />
        {fieldErrors?.location && (
          <p id="event-location-err" role="alert" className={errClass}>
            {fieldErrors.location}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="event-starts-at" className={labelClass}>
            Starts
          </label>
          <input
            id="event-starts-at"
            name="startsAt"
            type="datetime-local"
            aria-describedby={
              fieldErrors?.startsAt ? "event-starts-at-err" : undefined
            }
            className={inputClass}
          />
          {fieldErrors?.startsAt && (
            <p id="event-starts-at-err" role="alert" className={errClass}>
              {fieldErrors.startsAt}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="event-ends-at" className={labelClass}>
            Ends
          </label>
          <input
            id="event-ends-at"
            name="endsAt"
            type="datetime-local"
            aria-describedby={
              fieldErrors?.endsAt ? "event-ends-at-err" : undefined
            }
            className={inputClass}
          />
          {fieldErrors?.endsAt && (
            <p id="event-ends-at-err" role="alert" className={errClass}>
              {fieldErrors.endsAt}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="event-scope" className={labelClass}>
          Scope
        </label>
        <select
          id="event-scope"
          name="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as EventScope)}
          className={inputClass}
        >
          <option value="individual">Individual</option>
          <option value="group">Group</option>
          <option value="public">Public</option>
        </select>
      </div>

      {scope === "group" && (
        <div>
          <label htmlFor="event-group" className={labelClass}>
            Group
          </label>
          {presetGroupId ? (
            <input type="hidden" name="groupId" value={presetGroupId} />
          ) : (
            <select
              id="event-group"
              name="groupId"
              required
              defaultValue=""
              className={inputClass}
            >
              <option value="" disabled>
                Select a group…
              </option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          {presetGroupId && (
            <p className={errClass}>
              This event will be created for the current group.
            </p>
          )}
        </div>
      )}

      {state && !state.ok && (
        <p role="alert" className="text-sm text-text-secondary">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        {pending ? "Creating…" : "Create Event"}
      </button>
    </form>
  );
}
