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
} from "@/lib/validation";
import { isReactionType } from "@/lib/validation";
import { buildMediaKey } from "@/lib/storage-path";
import type { ActionResult } from "@/app/auth/actions";
import type { ReactionType, ActivityVerb } from "@/types/db";
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

  revalidatePath(`/groups/${groupId}`);
  return { ok: true };
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

  // Refresh server-rendered surfaces (same pattern as addComment).
  revalidatePath("/");
  const { data: post } = await supabase
    .from("posts")
    .select("group_id")
    .eq("id", postId)
    .maybeSingle();
  if (post) revalidatePath(`/groups/${(post as { group_id: string }).group_id}`);

  if (didReact && post)
    await logActivity(supabase, user.id, "reacted", {
      targetType: "post",
      targetId: postId,
      groupId: (post as { group_id: string }).group_id,
    });

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
