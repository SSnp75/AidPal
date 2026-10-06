import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import type { Profile } from "@/types/db";
import ProfileEditForm from "./ProfileEditForm";

export default async function ProfileEditPage() {
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

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <ProfileEditForm
        initial={{
          displayName: profile?.display_name ?? "",
          bio: profile?.bio ?? "",
          avatarUrl: profile?.avatar_url ?? "",
        }}
      />
    </div>
  );
}
