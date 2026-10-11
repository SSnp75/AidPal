import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import NewGroupForm from "./NewGroupForm";
import type { Country, GroupCategory } from "@/types/db";

export default async function NewGroupPage() {
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

  if (!user) redirect("/login?next=/groups/new");

  const [{ data: countries }, { data: categories }] = await Promise.all([
    supabase
      .from("countries")
      .select("code,name,flag")
      .order("name")
      .returns<Country[]>(),
    supabase
      .from("group_categories")
      .select("slug,label")
      .order("label")
      .returns<GroupCategory[]>(),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <NewGroupForm countries={countries ?? []} categories={categories ?? []} />
    </div>
  );
}
