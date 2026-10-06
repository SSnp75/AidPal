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
} from "@/lib/validation";
import { buildMediaKey } from "@/lib/storage-path";
import type { ActionResult } from "@/app/auth/actions";

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

  const fieldErrors: Record<string, string> = {};
  const nameRes = validateGroupName(rawName);
  if (!nameRes.ok) fieldErrors.name = nameRes.error;
  const descRes = validateGroupDescription(rawDesc);
  if (!descRes.ok) fieldErrors.description = descRes.error;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors };
  }

  const { data, error } = await supabase.rpc("create_group", {
    _name: (rawName as string).trim(),
    _description: rawDesc ? (rawDesc as string).trim() || null : null,
    _is_private: coerceIsPrivate(rawPrivate),
  });

  if (error) {
    console.error("[createGroup]", error.message);
    return { ok: false, error: "Could not create group. Try again." };
  }

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
  } else {
    // Text-only post
    const { error: postError } = await supabase.from("posts").insert({
      group_id: groupId,
      author_id: user.id,
      body,
    });

    if (postError) {
      console.error("[createPost] text post", postError.message);
      return { ok: false, error: "Could not create post. Try again." };
    }
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

  if (post) revalidatePath(`/groups/${post.group_id}`);
  return { ok: true };
}

/* ── toggleLike ── */

export async function toggleLike({
  postId,
  liked,
}: {
  postId: string;
  liked: boolean;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to like posts." };
  }

  if (!isUUID(postId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  if (liked) {
    const { error } = await supabase
      .from("likes")
      .upsert(
        { post_id: postId, user_id: user.id },
        { onConflict: "post_id,user_id", ignoreDuplicates: true }
      );
    if (error) {
      console.error("[toggleLike] insert", error.message);
      return { ok: false, error: "Could not update like. Try again." };
    }
  } else {
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);
    if (error) {
      console.error("[toggleLike] delete", error.message);
      return { ok: false, error: "Could not update like. Try again." };
    }
  }

  // Fresh count
  const { count } = await supabase
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId);

  return { ok: true, count: count ?? 0 };
}
