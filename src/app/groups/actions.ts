"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  validateGroupName,
  validateGroupDescription,
  coerceIsPrivate,
  validatePostBody,
  validateCommentBody,
  isUUID,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  isGroupCategorySlug,
  isGroupScope,
  validateCity,
  validateCountryCode,
  validateTags,
  normalizeTag,
  extractTagsFromBody,
  MAX_TAGS,
} from "@/lib/validation";
import { isReactionType, isModerationStatus } from "@/lib/validation";
import { buildMediaKey } from "@/lib/storage-path";
import type { ActionResult } from "@/app/auth/actions";
import type { ReactionType, ActivityVerb, ModerationStatus } from "@/types/db";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ── logActivity (best-effort private activity log) ── */

/**
 * Record a private activity row for the acting user. Best-effort: any error
 * (returned or thrown) is logged and swallowed, never rethrown, so it can
 * never roll back or fail the primary action it instruments.
 */
export async function logActivity(
  supabase: SupabaseClient,
  userId: string,
  verb: ActivityVerb,
  opts: { targetType?: string; targetId?: string | null; groupId?: string | null } = {}
): Promise<void> {
  try {
    const { error } = await supabase.from("activities").insert({
      user_id: userId,
      verb,
      target_type: opts.targetType ?? null,
      target_id: opts.targetId ?? null,
      group_id: opts.groupId ?? null,
    });
    if (error) {
      console.error("[logActivity]", error.message);
    }
  } catch (err) {
    console.error("[logActivity]", err);
  }
}

/* ── createGroup ── */

export async function createGroup(
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

  const rawName = formData.get("name");
  const rawDesc = formData.get("description");
  const rawPrivate = formData.get("isPrivate");
  const rawCountry = formData.get("country");
  const rawCity = formData.get("city");
  const rawCategory = formData.get("category");
  const rawScope = formData.get("scope");
  const rawTags = formData.get("tags");

  const fieldErrors: Record<string, string> = {};
  const nameRes = validateGroupName(rawName);
  if (!nameRes.ok) fieldErrors.name = nameRes.error;
  const descRes = validateGroupDescription(rawDesc);
  if (!descRes.ok) fieldErrors.description = descRes.error;

  // Category is required for new groups.
  if (!isGroupCategorySlug(rawCategory)) {
    fieldErrors.category = "Choose a category.";
  }

  // Country is optional; validate shape, then verify it exists.
  let countryCode: string | null = null;
  const countryRes = validateCountryCode(rawCountry);
  if (!countryRes.ok) {
    fieldErrors.country = countryRes.error;
  } else if (countryRes.value) {
    const { data: hit } = await supabase
      .from("countries")
      .select("code")
      .eq("code", countryRes.value)
      .maybeSingle<{ code: string }>();
    if (!hit) fieldErrors.country = "Pick a country from the list.";
    else countryCode = hit.code;
  }

  const cityRes = validateCity(rawCity);
  if (!cityRes.ok) fieldErrors.city = cityRes.error;

  const tagsRes = validateTags(rawTags);
  if (!tagsRes.ok) fieldErrors.tags = tagsRes.error;

  const scope = isGroupScope(rawScope) ? rawScope : "local";

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors };
  }

  const { data, error } = await supabase.rpc("create_group", {
    _name: (rawName as string).trim(),
    _description: rawDesc ? (rawDesc as string).trim() || null : null,
    _is_private: coerceIsPrivate(rawPrivate),
    _country_code: countryCode,
    _city: cityRes.ok ? cityRes.value : null,
    _category_slug: rawCategory as string,
    _scope: scope,
    _tags: tagsRes.ok ? tagsRes.value : [],
  });

  if (error) {
    console.error("[createGroup]", error.message);
    return { ok: false, error: "Could not create group. Try again." };
  }

  await logActivity(supabase, user.id, "created_group", {
    targetType: "group",
    targetId: data,
    groupId: data,
  });

  redirect(`/groups/${data}`);
}

/* ── joinGroup ── */

export async function joinGroup({
  groupId,
}: {
  groupId: string;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to join groups." };
  }

  const { error } = await supabase.from("group_members").upsert(
    { group_id: groupId, user_id: user.id, role: "member" },
    { onConflict: "group_id,user_id", ignoreDuplicates: true }
  );

  if (error) {
    console.error("[joinGroup]", error.message);
    if (error.code === "42501") {
      return { ok: false, error: "This group is private." };
    }
    return { ok: false, error: "Could not join group. Try again." };
  }

  await logActivity(supabase, user.id, "joined_group", {
    targetType: "group",
    targetId: groupId,
    groupId: groupId,
  });

  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}

/* ── leaveGroup ── */

/**
 * Remove the caller's own membership from a group. Routes through the
 * SECURITY DEFINER `leave_group` RPC so the owner-guard is enforced
 * server-side: the group owner cannot leave their own group ('42501').
 * Idempotent — leaving when not a member is a no-op success.
 */
export async function leaveGroup({
  groupId,
}: {
  groupId: string;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to leave groups." };
  }

  const { error } = await supabase.rpc("leave_group", { _group: groupId });
  if (error) {
    console.error("[leaveGroup]", error.message);
    if (error.code === "42501") {
      return { ok: false, error: "The owner can't leave their own group." };
    }
    return { ok: false, error: "Could not leave group. Try again." };
  }

  // No "left_group" activity verb exists in the activities CHECK, so skip
  // activity logging here to avoid a CHECK violation.
  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/");
  return { ok: true };
}

/* ── createPost ── */

export async function createPost(
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
  if (!user) {
    return { ok: false, error: "Sign in to post." };
  }

  const groupId = formData.get("groupId") as string;
  if (!isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const body = ((formData.get("body") as string) ?? "").trim() || null;
  const image = formData.get("image") as File | null;
  const hasImage = image && image.size > 0;

  // Validate body
  if (body) {
    const bodyRes = validatePostBody(body);
    if (!bodyRes.ok)
      return { ok: false, error: bodyRes.error };
  }

  // At least body or image
  if (!body && !hasImage) {
    return { ok: false, error: "Add text or an image." };
  }

  // Step 0: Membership check before upload
  const { data: membership } = await supabase.rpc("is_group_member", {
    gid: groupId,
  });

  if (!membership) {
    return { ok: false, error: "You must join this group to post." };
  }

  let storagePath: string | null = null;
  let mimeType: string | null = null;

  // Steps 1-2: Upload if image present
  if (hasImage) {
    const file = image as File;
    // Server-side MIME/size check
    if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
      return {
        ok: false,
        error: "Images only (JPEG, PNG, WebP, GIF), up to 5 MB.",
      };
    }
    if (file.size > MAX_FILE_SIZE) {
      return {
        ok: false,
        error: "Images only (JPEG, PNG, WebP, GIF), up to 5 MB.",
      };
    }

    mimeType = file.type;
    const fileId = crypto.randomUUID();
    // We need a post_id for the key, but we haven't created the post yet.
    // Create the post first (text-only), then upload, then insert media.
    const tempPostId = crypto.randomUUID();
    storagePath = buildMediaKey(groupId, tempPostId, fileId, mimeType);

    // Step 3: Insert post first
    const { data: postRow, error: postError } = await supabase
      .from("posts")
      .insert({
        id: tempPostId,
        group_id: groupId,
        author_id: user.id,
        body,
      })
      .select("id")
      .single();

    if (postError) {
      console.error("[createPost] post insert", postError.message);
      return { ok: false, error: "Could not create post. Try again." };
    }

    // Step 2: Upload
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(storagePath, arrayBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[createPost] upload", uploadError.message);
      // Compensating delete of the post row
      await supabase.from("posts").delete().eq("id", postRow.id);
      return { ok: false, error: "Upload failed. Try again." };
    }

    // Step 4: Insert media row
    const { error: mediaError } = await supabase.from("media").insert({
      post_id: postRow.id,
      storage_path: storagePath,
      mime_type: mimeType,
      uploader_id: user.id,
    });

    if (mediaError) {
      console.error("[createPost] media insert", mediaError.message);
      // Compensating deletes
      await supabase.storage.from("media").remove([storagePath]);
      await supabase.from("posts").delete().eq("id", postRow.id);
      return { ok: false, error: "Could not create post. Try again." };
    }

    await logActivity(supabase, user.id, "created_post", {
      targetType: "post",
      targetId: postRow.id,
      groupId: groupId,
    });
  } else {
    // Text-only post
    const { data: textPost, error: postError } = await supabase
      .from("posts")
      .insert({
        group_id: groupId,
        author_id: user.id,
        body,
      })
      .select("id")
      .single<{ id: string }>();

    if (postError) {
      console.error("[createPost] text post", postError.message);
      return { ok: false, error: "Could not create post. Try again." };
    }

    await logActivity(supabase, user.id, "created_post", {
      targetType: "post",
      targetId: textPost.id,
      groupId: groupId,
    });
  }

  // Auto-tag the group from sigil-prefixed words in the body (#x @x $x %x &x).
  // Each becomes a group tag, respecting the per-group cap. Best-effort:
  // failures here never fail the post (it's already created).
  if (body) {
    await applyAutoTags(supabase, groupId, body);
  }

  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}

/**
 * Extract #/@/$/%/& tags from a post body and add any new ones to the group,
 * up to MAX_TAGS. Uses the add_group_tag RPC so membership/RLS is enforced
 * identically to manual tag editing. Never throws — tagging is best-effort.
 */
async function applyAutoTags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  body: string
): Promise<void> {
  const extracted = extractTagsFromBody(body);
  if (extracted.length === 0) return;

  const { data: existing } = await supabase
    .from("group_tags")
    .select("tag")
    .eq("group_id", groupId)
    .returns<{ tag: string }[]>();

  const current = new Set((existing ?? []).map((t) => t.tag));
  let slots = MAX_TAGS - current.size;
  if (slots <= 0) return;

  for (const tag of extracted) {
    if (slots <= 0) break;
    if (current.has(tag)) continue;
    const { error } = await supabase.rpc("add_group_tag", {
      _group: groupId,
      _tag: tag,
    });
    if (error) {
      console.error("[applyAutoTags]", error.message);
      continue;
    }
    current.add(tag);
    slots -= 1;
  }
}

/* ── addComment ── */

export async function addComment(
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
  if (!user) {
    return { ok: false, error: "Sign in to comment." };
  }

  const postId = formData.get("postId") as string;
  const rawBody = formData.get("body") as string;

  if (!isUUID(postId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const bodyRes = validateCommentBody(rawBody);
  if (!bodyRes.ok) return { ok: false, error: bodyRes.error };

  const { error } = await supabase.from("comments").insert({
    post_id: postId,
    author_id: user.id,
    body: rawBody.trim(),
  });

  if (error) {
    console.error("[addComment]", error.message);
    return { ok: false, error: "You can't comment here." };
  }

  // Find the group_id via the post to revalidate
  const { data: post } = await supabase
    .from("posts")
    .select("group_id")
    .eq("id", postId)
    .single();

  if (post) {
    revalidatePath(`/groups/${post.group_id}`);
    await logActivity(supabase, user.id, "commented", {
      targetType: "post",
      targetId: postId,
      groupId: post.group_id,
    });
  }
  return { ok: true };
}

/* ── setReaction ── */

export type SetReactionResult =
  | {
      ok: true;
      counts: { like: number; love: number; dislike: number };
      mine: ReactionType | null;
    }
  | { ok: false; error: string };

/**
 * Upsert/toggle the current user's single reaction on a post.
 *   - no existing row        → insert the given type
 *   - existing, other type   → update the row to the new type
 *   - existing, same type    → delete the row (toggle off)
 * Returns post-write per-type counts and the viewer's reaction (or null).
 */
export async function setReaction({
  postId,
  type,
}: {
  postId: string;
  type: ReactionType;
}): Promise<SetReactionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to react to posts." };
  }

  if (!isUUID(postId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (!isReactionType(type)) {
    return { ok: false, error: "Invalid reaction." };
  }

  // Read the viewer's current reaction on this post.
  const { data: existing } = await supabase
    .from("reactions")
    .select("type")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  const current = (existing as { type: ReactionType } | null)?.type ?? null;

  let didReact = false;

  if (current === null) {
    // Insert. A failing `with check` raises Postgres 42501 → non-null error.
    const { error } = await supabase
      .from("reactions")
      .insert({ post_id: postId, user_id: user.id, type });
    if (error) {
      console.error("[setReaction] insert", error.message);
      return { ok: false, error: "Could not update reaction. Try again." };
    }
    didReact = true;
  } else if (current !== type) {
    // Switch type. A denied UPDATE `using` filters to 0 rows WITHOUT error,
    // so request the affected rows and assert a match.
    const { data: updated, error } = await supabase
      .from("reactions")
      .update({ type })
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .select("post_id");
    if (error) {
      console.error("[setReaction] update", error.message);
      return { ok: false, error: "Could not update reaction. Try again." };
    }
    if (!updated || updated.length === 0) {
      return { ok: false, error: "Not found or not allowed." };
    }
    didReact = true;
  } else {
    // Toggle off (same type). A denied DELETE `using` also filters to 0 rows
    // without error, so assert a match the same way.
    const { data: deleted, error } = await supabase
      .from("reactions")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .select("post_id");
    if (error) {
      console.error("[setReaction] delete", error.message);
      return { ok: false, error: "Could not update reaction. Try again." };
    }
    if (!deleted || deleted.length === 0) {
      return { ok: false, error: "Not found or not allowed." };
    }
  }

  // Re-read post-write state. `reactions_select` is post-level
  // (can_read_post), so a viewer who can read the post sees every row on it —
  // this single query yields complete per-type counts plus `mine`.
  const { data: rows, error: readError } = await supabase
    .from("reactions")
    .select("type, user_id")
    .eq("post_id", postId)
    .returns<{ type: ReactionType; user_id: string }[]>();

  if (readError) {
    console.error("[setReaction] re-read", readError.message);
    return { ok: false, error: "Could not update reaction. Try again." };
  }

  const counts = { like: 0, love: 0, dislike: 0 };
  let mine: ReactionType | null = null;
  for (const row of rows ?? []) {
    counts[row.type] += 1;
    if (row.user_id === user.id) mine = row.type;
  }

  // No revalidatePath here: the ReactionBar updates optimistically and
  // reconciles against the returned counts/mine, so a full server re-render
  // on every click is unnecessary and makes the button feel slow. We still
  // log activity best-effort (needs the post's group_id).
  if (didReact) {
    const { data: post } = await supabase
      .from("posts")
      .select("group_id")
      .eq("id", postId)
      .maybeSingle();
    if (post)
      await logActivity(supabase, user.id, "reacted", {
        targetType: "post",
        targetId: postId,
        groupId: (post as { group_id: string }).group_id,
      });
  }

  return { ok: true, counts, mine };
}

/* ── toggleBookmark ── */

export type ToggleBookmarkResult =
  | { ok: true; bookmarked: boolean }
  | { ok: false; error: string };

/**
 * Toggle the current user's bookmark on a post.
 *   - no existing row → insert (bookmarked:true)
 *   - existing row    → zero-row-aware delete (bookmarked:false)
 * Mirrors the setReaction control flow (read via maybeSingle, write, assert
 * affected rows). RLS gates visibility via can_read_post.
 */
export async function toggleBookmark({
  postId,
}: {
  postId: string;
}): Promise<ToggleBookmarkResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to save posts." };
  }

  if (!isUUID(postId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  // Read the viewer's current bookmark on this post.
  const { data: existing } = await supabase
    .from("bookmarks")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    // Insert. A failing `with check` raises Postgres 42501 → non-null error.
    const { error } = await supabase
      .from("bookmarks")
      .insert({ post_id: postId, user_id: user.id });
    if (error) {
      console.error("[toggleBookmark] insert", error.message);
      return { ok: false, error: "Could not update bookmark. Try again." };
    }
    await logActivity(supabase, user.id, "bookmarked", {
      targetType: "post",
      targetId: postId,
    });
    revalidatePath("/saved");
    return { ok: true, bookmarked: true };
  }

  // Toggle off. A denied DELETE `using` filters to 0 rows WITHOUT error,
  // so request the affected rows and assert a match.
  const { data: deleted, error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .select("post_id")
    .returns<{ post_id: string }[]>();
  if (error) {
    console.error("[toggleBookmark] delete", error.message);
    return { ok: false, error: "Could not update bookmark. Try again." };
  }
  if (!deleted || deleted.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  revalidatePath("/saved");
  return { ok: true, bookmarked: false };
}


/* ── Group relations ── */

function relationPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function addRelatedGroup({
  groupId,
  otherGroupId,
}: {
  groupId: string;
  otherGroupId: string;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(groupId) || !isUUID(otherGroupId) || groupId === otherGroupId) {
    return { ok: false, error: "Pick a different group to relate." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to relate groups." };

  const [low, high] = relationPair(groupId, otherGroupId);
  const { data, error } = await supabase
    .from("group_relations")
    .insert({ group_low: low, group_high: high, created_by: user.id })
    .select("group_low")
    .maybeSingle<{ group_low: string }>();

  if (error) {
    console.error("[addRelatedGroup]", error.message);
    return { ok: false, error: "Could not relate that group." };
  }
  if (!data) {
    // Zero-row insert = RLS blocked (not allowed / already exists).
    return { ok: false, error: "You can't relate that group." };
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${otherGroupId}`);
  return { ok: true };
}

export async function removeRelatedGroup({
  groupId,
  otherGroupId,
}: {
  groupId: string;
  otherGroupId: string;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(groupId) || !isUUID(otherGroupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to edit relations." };

  const [low, high] = relationPair(groupId, otherGroupId);
  const { error } = await supabase
    .from("group_relations")
    .delete()
    .eq("group_low", low)
    .eq("group_high", high);

  if (error) {
    console.error("[removeRelatedGroup]", error.message);
    return { ok: false, error: "Could not remove that relation." };
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${otherGroupId}`);
  return { ok: true };
}

export async function setRelationsOpen({
  groupId,
  open,
}: {
  groupId: string;
  open: boolean;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to change this setting." };

  // Only the owner may change the setting; RLS on groups already restricts
  // UPDATE to the owner, so a zero-row update means "not the owner".
  const { data, error } = await supabase
    .from("groups")
    .update({ relations_open: open })
    .eq("id", groupId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    console.error("[setRelationsOpen]", error?.message ?? "not owner");
    return { ok: false, error: "Only the group owner can change this." };
  }

  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}


/* ── Group tags (any member can edit) ── */

export async function addGroupTag({
  groupId,
  tag,
}: {
  groupId: string;
  tag: string;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to edit tags." };

  const normalized = normalizeTag(typeof tag === "string" ? tag : "");
  if (!normalized) {
    return { ok: false, error: "Enter a valid tag." };
  }

  // Enforce the per-group cap before adding.
  const { data: existing } = await supabase
    .from("group_tags")
    .select("tag")
    .eq("group_id", groupId)
    .returns<{ tag: string }[]>();
  if ((existing ?? []).some((t) => t.tag === normalized)) {
    return { ok: true }; // already present — no-op
  }
  if ((existing ?? []).length >= MAX_TAGS) {
    return { ok: false, error: `A group can have at most ${MAX_TAGS} tags.` };
  }

  const { error } = await supabase.rpc("add_group_tag", {
    _group: groupId,
    _tag: normalized,
  });
  if (error) {
    console.error("[addGroupTag]", error.message);
    return { ok: false, error: "Could not add that tag." };
  }

  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}

export async function removeGroupTag({
  groupId,
  tag,
}: {
  groupId: string;
  tag: string;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to edit tags." };

  const { error } = await supabase.rpc("remove_group_tag", {
    _group: groupId,
    _tag: tag,
  });
  if (error) {
    console.error("[removeGroupTag]", error.message);
    return { ok: false, error: "Could not remove that tag." };
  }

  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}

/* ── Group member roles (owner-only promote/demote) ── */

export async function setGroupMemberRole({
  groupId,
  userId,
  role,
}: {
  groupId: string;
  userId: string;
  role: "moderator" | "member";
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(groupId) || !isUUID(userId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (role !== "moderator" && role !== "member") {
    return { ok: false, error: "Invalid role." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to manage roles." };

  const { data, error } = await supabase.rpc("set_group_member_role", {
    _group: groupId,
    _user: userId,
    _role: role,
  });
  if (error || data !== true) {
    console.error("[setGroupMemberRole]", error?.message ?? "no change");
    return { ok: false, error: "Only the group owner can change roles." };
  }

  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}

/* ── Moderation: delete / suspend groups, posts, comments ──
 *
 * All six wrap SECURITY DEFINER RPCs that enforce the authorization matrix
 * server-side (delete-group owner-only; status setters owner/moderator;
 * delete post/comment author-or-owner). Each maps the Postgres error code via
 * the single ladder: 42501 → action-specific permission message; 22023 →
 * "Invalid status."; P0002 → "Not found or not allowed."; else generic.
 */

export async function deleteGroup({
  groupId,
}: {
  groupId: string;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to manage groups." };

  const { error } = await supabase.rpc("delete_group", { _group: groupId });
  if (error) {
    console.error("[deleteGroup]", error.message);
    if (error.code === "42501")
      return { ok: false, error: "Only the group owner can delete this group." };
    if (error.code === "22023") return { ok: false, error: "Invalid status." };
    if (error.code === "P0002") return { ok: false, error: "Not found or not allowed." };
    return { ok: false, error: "Something went wrong. Try again." };
  }

  revalidatePath("/groups");
  revalidatePath("/");
  redirect("/groups");
}

export async function setGroupStatus({
  groupId,
  status,
}: {
  groupId: string;
  status: ModerationStatus;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (!isModerationStatus(status)) {
    return { ok: false, error: "Invalid status." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to manage groups." };

  const { error } = await supabase.rpc("set_group_status", {
    _group: groupId,
    _status: status,
  });
  if (error) {
    console.error("[setGroupStatus]", error.message);
    if (error.code === "42501")
      return { ok: false, error: "Only owners or moderators can suspend this group." };
    if (error.code === "22023") return { ok: false, error: "Invalid status." };
    if (error.code === "P0002") return { ok: false, error: "Not found or not allowed." };
    return { ok: false, error: "Something went wrong. Try again." };
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function deletePost({
  postId,
  groupId,
}: {
  postId: string;
  groupId: string;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(postId) || !isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to manage posts." };

  const { error } = await supabase.rpc("delete_post", { _post: postId });
  if (error) {
    console.error("[deletePost]", error.message);
    if (error.code === "42501")
      return { ok: false, error: "You can only delete your own posts (owners can delete any)." };
    if (error.code === "22023") return { ok: false, error: "Invalid status." };
    if (error.code === "P0002") return { ok: false, error: "Not found or not allowed." };
    return { ok: false, error: "Something went wrong. Try again." };
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/");
  return { ok: true };
}

export async function setPostStatus({
  postId,
  groupId,
  status,
}: {
  postId: string;
  groupId: string;
  status: ModerationStatus;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(postId) || !isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (!isModerationStatus(status)) {
    return { ok: false, error: "Invalid status." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to manage posts." };

  const { error } = await supabase.rpc("set_post_status", {
    _post: postId,
    _status: status,
  });
  if (error) {
    console.error("[setPostStatus]", error.message);
    if (error.code === "42501")
      return { ok: false, error: "Only owners or moderators can suspend posts." };
    if (error.code === "22023") return { ok: false, error: "Invalid status." };
    if (error.code === "P0002") return { ok: false, error: "Not found or not allowed." };
    return { ok: false, error: "Something went wrong. Try again." };
  }

  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}

export async function deleteComment({
  commentId,
  groupId,
}: {
  commentId: string;
  groupId: string;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(commentId) || !isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to manage comments." };

  const { error } = await supabase.rpc("delete_comment", { _comment: commentId });
  if (error) {
    console.error("[deleteComment]", error.message);
    if (error.code === "42501")
      return { ok: false, error: "You can only delete your own comments (owners can delete any)." };
    if (error.code === "22023") return { ok: false, error: "Invalid status." };
    if (error.code === "P0002") return { ok: false, error: "Not found or not allowed." };
    return { ok: false, error: "Something went wrong. Try again." };
  }

  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}

export async function setCommentStatus({
  commentId,
  groupId,
  status,
}: {
  commentId: string;
  groupId: string;
  status: ModerationStatus;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }
  if (!isUUID(commentId) || !isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (!isModerationStatus(status)) {
    return { ok: false, error: "Invalid status." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to manage comments." };

  const { error } = await supabase.rpc("set_comment_status", {
    _comment: commentId,
    _status: status,
  });
  if (error) {
    console.error("[setCommentStatus]", error.message);
    if (error.code === "42501")
      return { ok: false, error: "Only owners or moderators can suspend comments." };
    if (error.code === "22023") return { ok: false, error: "Invalid status." };
    if (error.code === "P0002") return { ok: false, error: "Not found or not allowed." };
    return { ok: false, error: "Something went wrong. Try again." };
  }

  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
}
