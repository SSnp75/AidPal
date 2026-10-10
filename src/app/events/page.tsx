import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import ScopeBadge from "@/components/ScopeBadge";
import CreateEventForm from "@/components/CreateEventForm";
import MyEventsPanel from "@/components/MyEventsPanel";
import type { Event } from "@/types/db";

export default async function EventsPage() {
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

  // RLS returns exactly the readable set (own individual + readable group + public).
  const { data: eventsData } = await supabase
    .from("events")
    .select("*")
    .returns<Event[]>();

  const events = eventsData ?? [];

  // Upcoming-first comparator (design.md §8.1): future starts_at asc →
  // undated created_at desc → past starts_at desc. Deterministic.
  const now = Date.now();
  function bucket(e: Event): 0 | 1 | 2 {
    if (e.starts_at == null) return 1; // undated
    return Date.parse(e.starts_at) >= now ? 0 : 2; // future : past
  }
  events.sort((a, b) => {
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb; // A → B → C
    if (ba === 0) return Date.parse(a.starts_at!) - Date.parse(b.starts_at!); // future asc
    if (ba === 2) return Date.parse(b.starts_at!) - Date.parse(a.starts_at!); // past desc
    return Date.parse(b.created_at) - Date.parse(a.created_at); // undated: newest first
  });

  // Batch-fetch group names for group-scoped rows.
  const groupIds = Array.from(
    new Set(events.filter((e) => e.group_id).map((e) => e.group_id!))
  );
  const { data: groups } = groupIds.length
    ? await supabase
        .from("groups")
        .select("id,name")
        .in("id", groupIds)
        .returns<{ id: string; name: string }[]>()
    : { data: [] as { id: string; name: string }[] };

  const groupNames = new Map<string, string>();
  for (const g of groups ?? []) groupNames.set(g.id, g.name);

  // The viewer's own groups → populate the create form's group picker.
  const { data: myGroups } = await supabase
    .from("group_members")
    .select("groups(id,name)")
    .eq("user_id", user.id)
    .returns<{ groups: { id: string; name: string } | null }[]>();

  const viewerGroups = (myGroups ?? [])
    .map((row) => row.groups)
    .filter((g): g is { id: string; name: string } => g != null);

  function dateLabel(e: Event): string | null {
    if (!e.starts_at) return null;
    return new Date(e.starts_at).toLocaleString();
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">Events</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">
          Create an event
        </h2>
        <CreateEventForm groups={viewerGroups} />
      </section>

      <section className="mb-8">
        <MyEventsPanel />
      </section>

      <h2 className="mb-3 text-lg font-semibold text-text-primary">
        Available events
      </h2>
      {events.length === 0 ? (
        <p className="text-text-secondary">No events yet.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => {
            const when = dateLabel(e);
            const groupName = e.group_id
              ? groupNames.get(e.group_id)
              : undefined;
            return (
              <li
                key={e.id}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/events/${e.id}`}
                    className="font-medium text-text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {e.title}
                  </Link>
                  <ScopeBadge scope={e.scope} />
                </div>
                {when && (
                  <p className="mt-1 text-sm text-text-secondary">{when}</p>
                )}
                {e.group_id && (
                  <p className="mt-1 text-sm text-text-secondary">
                    In{" "}
                    <Link
                      href={`/groups/${e.group_id}`}
                      className="underline underline-offset-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {groupName ?? "a group"}
                    </Link>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
