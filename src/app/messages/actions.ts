"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { isUUID, validateMessageBody } from "@/lib/validation";
import type { ActionResult } from "@/app/auth/actions";

/* ── startOrGetDm (design §5.1) ── */

/**
 * Open (or create) the one-to-one DM conversation with `friendUserId` and
 * return its id for navigation. Delegates authorization to the
 * `start_or_get_dm` SECURITY DEFINER RPC, which raises 42501 unless the pair
 * are accepted friends. No activity logged (FR-18).
 */
export async function startOrGetDm({
  friendUserId,
}: {
  friendUserId: string;
}): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to message." };
  }

  if (!isUUID(friendUserId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (friendUserId.toLowerCase() === user.id.toLowerCase()) {
    return { ok: false, error: "You can't message yourself." };
  }

  const { data, error } = await supabase
    .rpc("start_or_get_dm", { _friend: friendUserId })
    .returns<string>();

  if (error) {
    console.error("[startOrGetDm]", error.message);
    if (error.code === "42501") {
      return { ok: false, error: "You can message accepted friends only." };
    }
    return { ok: false, error: "Could not open conversation. Try again." };
  }
  if (!data) {
    return { ok: false, error: "Not found or not allowed." };
  }

  return { ok: true, conversationId: data as string };
}

/* ── getOrCreateGroupConversation (design §5.2) ── */

/**
 * Open (or create) the group's single conversation and return its id for
 * navigation. Delegates authorization to the
 * `get_or_create_group_conversation` SECURITY DEFINER RPC, which raises 42501
 * unless the caller is a member of the group. No activity logged (FR-18).
 */
export async function getOrCreateGroupConversation({
  groupId,
}: {
  groupId: string;
}): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to message." };
  }

  if (!isUUID(groupId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const { data, error } = await supabase
    .rpc("get_or_create_group_conversation", { _group: groupId })
    .returns<string>();

  if (error) {
    console.error("[getOrCreateGroupConversation]", error.message);
    if (error.code === "42501") {
      return { ok: false, error: "Join this group to chat." };
    }
    return { ok: false, error: "Could not open conversation. Try again." };
  }
  if (!data) {
    return { ok: false, error: "Not found or not allowed." };
  }

  return { ok: true, conversationId: data as string };
}

/* ── sendMessage (design §5.3) ── */

/**
 * Insert a message into `conversationId` on behalf of the current user. The
 * `messages_insert` RLS with-check (sender_id = auth.uid() AND
 * can_access_conversation(conversation_id)) is the sole authority:
 *   - a with-check failure raises Postgres 42501, and
 *   - a `using`-filtered insert that returns no row surfaces the same denial.
 * BOTH branches map to "Not found or not allowed." No activity logged (FR-18).
 */
export async function sendMessage({
  conversationId,
  body,
}: {
  conversationId: string;
  body: string;
}): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to send messages." };
  }

  if (!isUUID(conversationId)) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const bodyRes = validateMessageBody(body);
  if (!bodyRes.ok) return { ok: false, error: bodyRes.error };

  const trimmed = body.trim();

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: trimmed,
    })
    .select("id")
    .returns<{ id: string }[]>();

  if (error) {
    console.error("[sendMessage]", error.message);
    if (error.code === "42501") {
      return { ok: false, error: "Not found or not allowed." };
    }
    return { ok: false, error: "Could not send message. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  revalidatePath(`/messages/${conversationId}`);
  return { ok: true };
}
