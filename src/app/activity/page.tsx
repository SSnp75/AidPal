import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import { timeAgo } from "@/lib/feed";
import type { Activity } from "@/types/db";

export default async function ActivityPage() {
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

  const { data: actsData } = await supabase
    .from("activities")
    .select("id, verb, target_type, target_id, group_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Activity[]>();

  const acts = actsData ?? [];

  const groupIds = Array.from(
    new Set(acts.filter((a) => a.group_id).map((a) => a.group_id!))
  );

  const { data: groups } = groupIds.length
    ? await supabase
        .from("groups")
        .select("id, name")
        .in("id", groupIds)
        .returns<{ id: string; name: string }[]>()
    : { data: [] as { id: string; name: string }[] };

  const groupNames = new Map<string, string>();
  for (const g of groups ?? []) groupNames.set(g.id, g.name);

  function stamp(iso: string) {
    const t = timeAgo(iso);
    if (!t) return "";
    return t === "just now" ? t : `${t} ago`;
  }

  function groupRef(a: Activity) {
    const id = a.group_id;
    if (!id) return null;
    const name = groupNames.get(id);
    if (name) {
      return (
        <Link
          href={`/groups/${id}`}
          className="text-text-secondary underline underline-offset-2 transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {name}
        </Link>
      );
    }
    return <span className="text-text-primary">a group</span>;
  }

  function line(a: Activity) {
    const ref = groupRef(a);
    switch (a.verb) {
      case "created_post":
        return <>You posted in {ref ?? "a group"}</>;
      case "commented":
        return <>You commented on a post in {ref ?? "a group"}</>;
      case "reacted":
        return <>You reacted to a post in {ref ?? "a group"}</>;
      case "joined_group":
        return <>You joined {ref ?? "a group"}</>;
      case "created_group":
        return <>You created the group {ref ?? "a group"}</>;
      case "bookmarked":
        return <>You saved a post</>;
      default:
        return <>You did something</>;
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">
        My Activity
      </h1>

      {acts.length === 0 ? (
        <p className="text-text-secondary">No activity yet.</p>
      ) : (
        <ul className="space-y-3">
          {acts.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <p className="text-text-primary">{line(a)}</p>
              <p className="mt-1 text-xs text-text-secondary">
                {stamp(a.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
