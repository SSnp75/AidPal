"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  validateDisplayName,
  validateBio,
  validateAvatarUrl,
} from "@/lib/validation";
import type { ActionResult } from "@/app/auth/actions";

/**
 * Idempotent profile creation — called at login-time (signIn / callback).
 * Inserts with a fallback display_name derived from the email; does nothing
 * if the row already exists.
 */
export async function ensureProfile(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const fallbackName =
    (user.email?.split("@")[0] ?? "").slice(0, 60) || "New user";

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      display_name: fallbackName,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (error) {
    console.error("[ensureProfile]", error.message);
    throw error;
  }
}

export async function upsertProfile(
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

  const rawName = formData.get("displayName");
  const rawBio = formData.get("bio");
  const rawAvatar = formData.get("avatarUrl");

  const fieldErrors: Record<string, string> = {};
  const nameRes = validateDisplayName(rawName);
  if (!nameRes.ok) fieldErrors.displayName = nameRes.error;
  const bioRes = validateBio(rawBio);
  if (!bioRes.ok) fieldErrors.bio = bioRes.error;
  const avatarRes = validateAvatarUrl(rawAvatar);
  if (!avatarRes.ok) fieldErrors.avatarUrl = avatarRes.error;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors };
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      display_name: (rawName as string).trim(),
      bio: rawBio ? (rawBio as string).trim() || null : null,
      avatar_url: rawAvatar ? (rawAvatar as string).trim() || null : null,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error("[upsertProfile]", error.message);
    return { ok: false, error: "Could not save profile. Try again." };
  }

  redirect("/profile");
}
