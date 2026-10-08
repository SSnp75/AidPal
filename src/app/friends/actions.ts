"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { isUUID } from "@/lib/validation";
import { pair } from "@/lib/friend-pair";
import { logActivity } from "@/app/groups/actions";
import type { ActionResult } from "@/app/auth/actions";

/* ── sendFriendRequest (FR-F4, design §4.1) ── */

/**
 * Send a friend request to `addresseeId`, or — if that user already has a
 * pending request to me (reciprocal, EC-3) — accept it instead of inserting a
 * duplicate. Idempotent for already-accepted and own-outgoing-pending rows
 * (EC-1). The DB `primary key (user_low, user_high)` is the backstop.
 */
export async function sendFriendRequest(
  addresseeId: string
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to manage friends." };
  }

  if (!isUUID(addresseeId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (addresseeId.toLowerCase() === user.id.toLowerCase()) {
    return { ok: false, error: "You can't friend yourself." };
  }

  const { user_low, user_high } = pair(user.id, addresseeId);
  const normalizedAddressee = addresseeId.toLowerCase();

  // Read the existing row for this pair, if any.
  const { data: existing } = await supabase
    .from("friendships")
    .select("status, requester_id")
    .eq("user_low", user_low)
    .eq("user_high", user_high)
    .maybeSingle<{ status: "pending" | "accepted"; requester_id: string }>();

  if (!existing) {
    // No row → insert a fresh pending request.
    const { error } = await supabase.from("friendships").insert({
      user_low,
      user_high,
      requester_id: user.id,
      status: "pending",
    });
    if (error) {
      console.error("[sendFriendRequest] insert", error.message);
      return { ok: false, error: "Could not send request. Try again." };
    }
    await logActivity(supabase, user.id, "sent_friend_request", {
      targetType: "profile",
      targetId: normalizedAddressee,
    });
    revalidatePath("/friends");
    return { ok: true };
  }

  if (existing.status === "accepted") {
    // Already friends — idempotent (EC-1).
    return { ok: true };
  }

  // existing.status === "pending"
  if (existing.requester_id === user.id) {
    // My own outgoing request already exists — idempotent (EC-1).
    return { ok: true };
  }

  // Reciprocal case (EC-3): the other party already requested me. Accept it
  // instead of inserting a duplicate — same filters as acceptFriendRequest.
  const { data, error } = await supabase
    .from("friendships")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("user_low", user_low)
    .eq("user_high", user_high)
    .eq("status", "pending")
    .eq("requester_id", normalizedAddressee)
    .select("user_low")
    .returns<{ user_low: string }[]>();

  if (error) {
    console.error("[sendFriendRequest] reciprocal accept", error.message);
    return { ok: false, error: "Could not accept. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  await logActivity(supabase, user.id, "accepted_friend", {
    targetType: "profile",
    targetId: normalizedAddressee,
  });
  revalidatePath("/friends");
  return { ok: true };
}

/* ── acceptFriendRequest (FR-F5, design §4.2) ── */

/**
 * Accept a pending request where `requesterId` is the other party (the one
 * who requested me). Only the addressee can accept — enforced by the
 * `friendships_update` policy plus the `requester_id` filter.
 */
export async function acceptFriendRequest(
  requesterId: string
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to manage friends." };
  }

  if (!isUUID(requesterId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (requesterId.toLowerCase() === user.id.toLowerCase()) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const { user_low, user_high } = pair(user.id, requesterId);
  const normalizedRequester = requesterId.toLowerCase();

  const { data, error } = await supabase
    .from("friendships")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("user_low", user_low)
    .eq("user_high", user_high)
    .eq("status", "pending")
    .eq("requester_id", normalizedRequester)
    .select("user_low")
    .returns<{ user_low: string }[]>();

  if (error) {
    console.error("[acceptFriendRequest]", error.message);
    return { ok: false, error: "Could not accept. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  await logActivity(supabase, user.id, "accepted_friend", {
    targetType: "profile",
    targetId: normalizedRequester,
  });
  revalidatePath("/friends");
  return { ok: true };
}

/* ── declineFriendRequest (FR-F6 addressee-side, design §4.3) ── */

/**
 * Decline (delete) a pending request where `requesterId` is the other party.
 * No activity logged. Freeing the pending row leaves the pair re-requestable.
 */
export async function declineFriendRequest(
  requesterId: string
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to manage friends." };
  }

  if (!isUUID(requesterId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (requesterId.toLowerCase() === user.id.toLowerCase()) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const { user_low, user_high } = pair(user.id, requesterId);

  const { data, error } = await supabase
    .from("friendships")
    .delete()
    .eq("user_low", user_low)
    .eq("user_high", user_high)
    .eq("status", "pending")
    .eq("requester_id", requesterId.toLowerCase())
    .select("user_low")
    .returns<{ user_low: string }[]>();

  if (error) {
    console.error("[declineFriendRequest]", error.message);
    return { ok: false, error: "Could not decline. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  revalidatePath("/friends");
  return { ok: true };
}

/* ── cancelFriendRequest (FR-F6 requester-side, design §4.4) ── */

/**
 * Cancel (delete) my own outgoing pending request to `addresseeId`. Enforced
 * by `requester_id = user.id`. No activity logged.
 */
export async function cancelFriendRequest(
  addresseeId: string
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to manage friends." };
  }

  if (!isUUID(addresseeId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (addresseeId.toLowerCase() === user.id.toLowerCase()) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const { user_low, user_high } = pair(user.id, addresseeId);

  const { data, error } = await supabase
    .from("friendships")
    .delete()
    .eq("user_low", user_low)
    .eq("user_high", user_high)
    .eq("status", "pending")
    .eq("requester_id", user.id)
    .select("user_low")
    .returns<{ user_low: string }[]>();

  if (error) {
    console.error("[cancelFriendRequest]", error.message);
    return { ok: false, error: "Could not cancel. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  revalidatePath("/friends");
  return { ok: true };
}

/* ── removeFriend (FR-F7, design §4.5) ── */

/**
 * Remove an accepted friendship with `otherUserId`. Either party may delete.
 * Freeing the row leaves the pair re-requestable (EC-8). No activity logged.
 */
export async function removeFriend(
  otherUserId: string
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in to manage friends." };
  }

  if (!isUUID(otherUserId)) {
    return { ok: false, error: "Not found or not allowed." };
  }
  if (otherUserId.toLowerCase() === user.id.toLowerCase()) {
    return { ok: false, error: "Not found or not allowed." };
  }

  const { user_low, user_high } = pair(user.id, otherUserId);

  const { data, error } = await supabase
    .from("friendships")
    .delete()
    .eq("user_low", user_low)
    .eq("user_high", user_high)
    .eq("status", "accepted")
    .select("user_low")
    .returns<{ user_low: string }[]>();

  if (error) {
    console.error("[removeFriend]", error.message);
    return { ok: false, error: "Could not remove friend. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or not allowed." };
  }

  revalidatePath("/friends");
  return { ok: true };
}
