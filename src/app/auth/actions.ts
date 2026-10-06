"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  validateEmail,
  validatePassword,
  validateDisplayName,
  safeNextPath,
} from "@/lib/validation";
import { ensureProfile } from "@/app/profile/actions";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function signUp(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");
  const rawName = formData.get("displayName");

  const fieldErrors: Record<string, string> = {};
  const emailResult = validateEmail(rawEmail);
  if (!emailResult.ok) fieldErrors.email = emailResult.error;
  const passResult = validatePassword(rawPassword);
  if (!passResult.ok) fieldErrors.password = passResult.error;
  const nameResult = validateDisplayName(rawName);
  if (!nameResult.ok) fieldErrors.displayName = nameResult.error;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors };
  }

  const email = (rawEmail as string).trim().toLowerCase();
  const password = rawPassword as string;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getOrigin()}/auth/callback`,
    },
  });

  if (error) {
    console.error("[signUp]", error.message);
    // Non-enumerating message
    return {
      ok: true, // Treated as ok to avoid leaking whether account exists
    };
  }

  // Branch: does the project require email confirmation?
  if (data.session) {
    // Confirmation disabled — session exists immediately
    try {
      await ensureProfile();
    } catch (e) {
      console.error("[signUp] ensureProfile failed", e);
    }
    redirect("/profile/edit");
  }

  // Confirmation required — no session yet
  return { ok: true };
}

export async function signIn(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");
  const next = formData.get("next");

  if (
    typeof rawEmail !== "string" ||
    !rawEmail.trim() ||
    typeof rawPassword !== "string" ||
    !rawPassword
  ) {
    return { ok: false, error: "Invalid email or password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: rawEmail.trim().toLowerCase(),
    password: rawPassword,
  });

  if (error) {
    console.error("[signIn]", error.message);
    return { ok: false, error: "Invalid email or password." };
  }

  try {
    await ensureProfile();
  } catch (e) {
    console.error("[signIn] ensureProfile failed", e);
  }

  redirect(safeNextPath(typeof next === "string" ? next : null));
}

export async function signOut(): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured. See README.md." };
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

function getOrigin(): string {
  // In server actions we don't have a clean request origin.
  // Fall back to localhost for dev; in prod this is set via env.
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
