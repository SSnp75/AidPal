import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import CreateEventForm from "@/components/CreateEventForm";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <SupabaseNotConfigured />
      </div>
    );
  }

  const { groupId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // The viewer's own groups → populate the create form's group picker.
  const { data: myGroups } = await supabase
    .from("group_members")
    .select("groups(id,name)")
    .eq("user_id", user.id)
    .returns<{ groups: { id: string; name: string } | null }[]>();

  const viewerGroups = (myGroups ?? [])
    .map((row) => row.groups)
    .filter((g): g is { id: string; name: string } => g != null);

  // Pre-bind a group only when the viewer actually belongs to it.
  const presetGroupId =
    groupId && viewerGroups.some((g) => g.id === groupId) ? groupId : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">
        Create an event
      </h1>
      <CreateEventForm
        groups={viewerGroups}
        presetGroupId={presetGroupId}
        presetScope={presetGroupId ? "group" : undefined}
      />
    </div>
  );
}
