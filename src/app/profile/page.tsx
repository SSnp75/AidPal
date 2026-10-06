import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import Link from "next/link";
import type { Profile } from "@/types/db";

export default async function ProfilePage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <SupabaseNotConfigured />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) redirect("/profile/edit");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold text-teal-400 mb-6">Your Profile</h1>

        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 space-y-4">
          {profile.avatar_url && (
            <img
              src={profile.avatar_url}
              alt={`${profile.display_name}'s avatar`}
              className="w-20 h-20 rounded-full object-cover border border-gray-700"
            />
          )}

          <div>
            <span className="block text-xs text-gray-500">Display name</span>
            <span className="text-lg text-white">{profile.display_name}</span>
          </div>

          {profile.bio && (
            <div>
              <span className="block text-xs text-gray-500">Bio</span>
              <p className="text-gray-300">{profile.bio}</p>
            </div>
          )}

          <Link
            href="/profile/edit"
            className="inline-block rounded bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-500 transition-colors"
          >
            Edit Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
