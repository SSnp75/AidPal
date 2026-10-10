"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  validateEventTitle,
  validateEventDescription,
  validateEventLocation,
  validateEventTaskTitle,
  isUUID,
  isEventScope,
  isTaskStatus,
} from "@/lib/validation";
import { logActivity } from "@/app/groups/actions";
import type { ActionResult } from "@/app/auth/actions";
import type { TaskStatus } from "@/types/db";

/* ── createEvent ──
 * Form action: redirects to /login when unauthenticated and to the new
 * event on success (mirrors createGroup). Trims text before insert so the
 * stored value equals the value the validator measured. */

export async function createEvent(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawScope = formData.get("scope");
  const rawTitle = formData.get("title");
  const rawDescription = formData.get("description");
  const rawLocation = formData.get("location");
  const rawStartsAt = formData.get("startsAt");
  const rawEndsAt = formData.get("endsAt");
  const rawGroupId = formData.get("groupId");

  if (!isEventScope(rawScope)) {
    return { ok: false, error: "Choose a valid scope." };
  }
  const scope = rawScope;

  const fieldErrors: Record<string, string> = {};

  const titleRes = validateEventTitle(rawTitle);
  if (!titleRes.ok) fieldErrors.title = titleRes.error;
  const descRes = validateEventDescription(rawDescription);
  if (!descRes.ok) fieldErrors.description = descRes.error;
  const locRes = validateEventLocation(rawLocation);
  if (!locRes.ok) fieldErrors.location = locRes.error;

  // Dates: empty → null; unparseable → field error; ends_at < starts_at → field error.
  let startsAt: string | null = null;
  let endsAt: string | null = null;

  if (typeof rawStartsAt === "string" && rawStartsAt.trim() !== "") {
    const ms = Date.parse(rawStartsAt);
    if (Number.isNaN(ms)) {
      fieldErrors.startsAt = "Enter a valid start date and time.";
    } else {
      startsAt = new Date(ms).toISOString();
    }
  }
  if (typeof rawEndsAt === "string" && rawEndsAt.trim() !== "") {
    const ms = Date.parse(rawEndsAt);
    if (Number.isNaN(ms)) {
      fieldErrors.endsAt = "Enter a valid end date and time.";
    } else {
      endsAt = new Date(ms).toISOString();
    }
  }
  if (startsAt && endsAt && endsAt < startsAt) {
    fieldErrors.endsAt = "End must be after start.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors };
  }

  // Scope/group coupling: group scope requires a valid group id + membership
  // (friendly pre-check; RLS `with check` is the backstop). Otherwise null.
  let groupId: string | null = null;
  if (scope === "group") {
    if (!isUUID(rawGroupId)) {
      return { ok: false, error: "You must be a member of this group." };
    }
    const { data: membership } = await supabase.rpc("is_group_member", {
      gid: rawGroupId as string,
    });
    if (!membership) {
      return { ok: false, error: "You must be a member of this group." };
    }
    groupId = rawGroupId as string;
  }

  const title = (rawTitle as string).trim();
  const description =
    typeof rawDescription === "string" ? rawDescription.trim() || null : null;
  const location =
    typeof rawLocation === "string" ? rawLocation.trim() || null : null;

  const { data, error } = await supabase
    .from("events")
    .insert({
      creator_id: user.id,
      scope,
      group_id: groupId,
      title,
      description,
      location,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    console.error("[createEvent]", error.message);
    return { ok: false, error: "Could not create event. Try again." };
  }

  await logActivity(supabase, user.id, "created_event", {
    targetType: "event",
    targetId: data.id,
    groupId: scope === "group" ? groupId : null,
  });

  revalidatePath("/events");
  redirect("/events/" + data.id);
}

/* ── updateEvent ──
 * Interactive JSON action. Empty-patch guard returns before issuing the
 * UPDATE. Zero-row-aware UPDATE gated by can_manage_event via RLS. */

export async function updateEvent({
  eventId,
  title,
  description,
  location,
  startsAt,
  endsAt,
}: {
  eventId: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(eventId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to edit events." };
  }

  const patch: {
    title?: string;
    description?: string | null;
    location?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
  } = {};

  if (title !== undefined) {
    const titleRes = validateEventTitle(title);
    if (!titleRes.ok) return { ok: false, error: titleRes.error };
    patch.title = title.trim();
  }
  if (description !== undefined) {
    const descRes = validateEventDescription(description);
    if (!descRes.ok) return { ok: false, error: descRes.error };
    patch.description =
      typeof description === "string" ? description.trim() || null : null;
  }
  if (location !== undefined) {
    const locRes = validateEventLocation(location);
    if (!locRes.ok) return { ok: false, error: locRes.error };
    patch.location =
      typeof location === "string" ? location.trim() || null : null;
  }
  if (startsAt !== undefined) {
    if (startsAt === null || startsAt === "") {
      patch.starts_at = null;
    } else {
      const ms = Date.parse(startsAt);
      if (Number.isNaN(ms)) {
        return { ok: false, error: "Enter a valid start date and time." };
      }
      patch.starts_at = new Date(ms).toISOString();
    }
  }
  if (endsAt !== undefined) {
    if (endsAt === null || endsAt === "") {
      patch.ends_at = null;
    } else {
      const ms = Date.parse(endsAt);
      if (Number.isNaN(ms)) {
        return { ok: false, error: "Enter a valid end date and time." };
      }
      patch.ends_at = new Date(ms).toISOString();
    }
  }
  if (
    patch.starts_at != null &&
    patch.ends_at != null &&
    patch.ends_at < patch.starts_at
  ) {
    return { ok: false, error: "End must be after start." };
  }

  // Empty-patch guard — do NOT issue the UPDATE.
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  const { data, error } = await supabase
    .from("events")
    .update(patch)
    .eq("id", eventId)
    .select("id")
    .returns<{ id: string }[]>();

  if (error) {
    console.error("[updateEvent]", error.message);
    return { ok: false, error: "Could not update event. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  revalidatePath("/events");
  revalidatePath("/events/" + eventId);
  return { ok: true };
}

/* ── deleteEvent ── */

export async function deleteEvent({
  eventId,
}: {
  eventId: string;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(eventId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to edit events." };
  }

  const { data, error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .select("id")
    .returns<{ id: string }[]>();

  if (error) {
    console.error("[deleteEvent]", error.message);
    return { ok: false, error: "Could not delete event. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  revalidatePath("/events");
  revalidatePath("/events/" + eventId);
  return { ok: true };
}

/* ── addTask ──
 * INSERT gated by event_tasks_insert `with check`; a non-manager insert
 * raises Postgres 42501 → non-null error. */

export async function addTask({
  eventId,
  title,
  assigneeId,
}: {
  eventId: string;
  title: string;
  assigneeId?: string | null;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(eventId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to edit events." };
  }

  const titleRes = validateEventTaskTitle(title);
  if (!titleRes.ok) return { ok: false, error: titleRes.error };

  if (assigneeId != null && !isUUID(assigneeId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const { error } = await supabase.from("event_tasks").insert({
    event_id: eventId,
    title: title.trim(),
    status: "todo",
    assignee_id: assigneeId ?? null,
    created_by: user.id,
  });

  if (error) {
    console.error("[addTask]", error.message);
    return { ok: false, error: "Not found or not allowed." };
  }

  revalidatePath("/events/" + eventId);
  return { ok: true };
}

/* ── updateTaskStatus ──
 * Zero-row-aware UPDATE of status gated by can_manage_event via RLS. */

export async function updateTaskStatus({
  taskId,
  status,
}: {
  taskId: string;
  status: TaskStatus;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(taskId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (!isTaskStatus(status)) {
    return { ok: false, error: "Invalid status." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to edit events." };
  }

  const { data, error } = await supabase
    .from("event_tasks")
    .update({ status })
    .eq("id", taskId)
    .select("event_id")
    .returns<{ event_id: string }[]>();

  if (error) {
    console.error("[updateTaskStatus]", error.message);
    return { ok: false, error: "Could not update task. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  revalidatePath("/events/" + data[0].event_id);
  return { ok: true };
}

/* ── assignTask ──
 * Zero-row-aware UPDATE of assignee_id (manager-gated). This is the mechanism
 * that grants an individual-scope event's assignee read access. */

export async function assignTask({
  taskId,
  assigneeId,
}: {
  taskId: string;
  assigneeId: string | null;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(taskId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (assigneeId !== null && !isUUID(assigneeId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to edit events." };
  }

  const { data, error } = await supabase
    .from("event_tasks")
    .update({ assignee_id: assigneeId })
    .eq("id", taskId)
    .select("event_id")
    .returns<{ event_id: string }[]>();

  if (error) {
    console.error("[assignTask]", error.message);
    return { ok: false, error: "Could not assign task. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  revalidatePath("/events/" + data[0].event_id);
  return { ok: true };
}

/* ── deleteTask ──
 * Zero-row-aware DELETE manager-gated. */

export async function deleteTask({
  taskId,
}: {
  taskId: string;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(taskId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to edit events." };
  }

  const { data, error } = await supabase
    .from("event_tasks")
    .delete()
    .eq("id", taskId)
    .select("event_id")
    .returns<{ event_id: string }[]>();

  if (error) {
    console.error("[deleteTask]", error.message);
    return { ok: false, error: "Could not delete task. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  revalidatePath("/events/" + data[0].event_id);
  return { ok: true };
}

/* ── volunteerForEvent ──
 * Idempotent self-insert mirroring joinGroup's upsert. Read-before-insert
 * (maybeSingle) detects first-time so logActivity fires exactly once. */

export type VolunteerResult =
  | { ok: true; volunteering: boolean }
  | { ok: false; error: string };

export async function volunteerForEvent({
  eventId,
}: {
  eventId: string;
}): Promise<VolunteerResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(eventId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to volunteer." };
  }

  // Read-before-insert to decide first-time (so logActivity fires once).
  const { data: existing } = await supabase
    .from("event_volunteers")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("event_volunteers").upsert(
    { event_id: eventId, user_id: user.id },
    { onConflict: "event_id,user_id", ignoreDuplicates: true }
  );

  if (error) {
    console.error("[volunteerForEvent]", error.message);
    if (error.code === "42501") {
      return { ok: false, error: "Not found or not allowed." };
    }
    return { ok: false, error: "Could not volunteer. Try again." };
  }

  if (!existing) {
    await logActivity(supabase, user.id, "volunteered_for_event", {
      targetType: "event",
      targetId: eventId,
    });
  }

  revalidatePath("/events/" + eventId);
  revalidatePath("/activity");
  return { ok: true, volunteering: true };
}

/* ── withdrawVolunteer ──
 * Zero-row-aware DELETE of the caller's own row. No activity logged. */

export async function withdrawVolunteer({
  eventId,
}: {
  eventId: string;
}): Promise<VolunteerResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(eventId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to volunteer." };
  }

  const { data, error } = await supabase
    .from("event_volunteers")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .select("event_id")
    .returns<{ event_id: string }[]>();

  if (error) {
    console.error("[withdrawVolunteer]", error.message);
    return { ok: false, error: "Could not withdraw. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  revalidatePath("/events/" + eventId);
  return { ok: true, volunteering: false };
}

/* ── markInterested / unmarkInterested ──
 * Per-user "Interested" flag, independent of volunteering and NOT logged to
 * the activity feed (no activities.verb change — see design §2.3). Guard/auth/
 * zero-row shape mirrors the volunteer pair, but the revalidation set diverges:
 * both actions revalidate /events AND /events/{id} (so MyEventsPanel refreshes)
 * and never /activity. */

export type InterestResult =
  | { ok: true; interested: boolean }
  | { ok: false; error: string };

export async function markInterested({
  eventId,
}: {
  eventId: string;
}): Promise<InterestResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(eventId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to mark interest." };
  }

  // Direct self-scoped upsert — the RLS insert policy is
  // (user_id = auth.uid() AND can_read_event(event_id)), so the caller's
  // own JWT satisfies the with-check; no RPC needed. See schema
  // event_interests_insert. (Fall back to toggle_event_interest RPC ONLY
  // if a readable-event mark is rejected with Postgres 42501 — see design §2.2.)
  const { error } = await supabase.from("event_interests").upsert(
    { event_id: eventId, user_id: user.id },
    { onConflict: "event_id,user_id", ignoreDuplicates: true }
  );

  if (error) {
    console.error("[markInterested]", error.message);
    if (error.code === "42501") {
      return { ok: false, error: "Not found or not allowed." };
    }
    return { ok: false, error: "Could not update interest. Try again." };
  }

  revalidatePath("/events");
  revalidatePath("/events/" + eventId);
  return { ok: true, interested: true };
}

export async function unmarkInterested({
  eventId,
}: {
  eventId: string;
}): Promise<InterestResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(eventId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to mark interest." };
  }

  const { error } = await supabase
    .from("event_interests")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[unmarkInterested]", error.message);
    return { ok: false, error: "Could not update interest. Try again." };
  }

  // Zero rows diverges from withdrawVolunteer: unmarking when not interested
  // is a no-op that returns success (the DELETE is self-scoped, so no rows
  // means "already not interested," not a permission failure).
  revalidatePath("/events");
  revalidatePath("/events/" + eventId);
  return { ok: true, interested: false };
}
