import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import ScopeBadge from "@/components/ScopeBadge";
import { formatEventDate } from "@/lib/eventDisplay";
import type { Event } from "@/types/db";

type MyEventRow = Pick<
  Event,
  "id" | "title" | "scope" | "starts_at" | "group_id"
>;

const SELECT_COLS = "id,title,scope,starts_at,group_id";

/**
 * Reusable server component showing the current user's events across ALL
 * scopes and groups: My Events (creator), Interested, and Volunteering. No
 * props — it resolves its own Supabase client and user, so it can be dropped
 * into any authenticated page. Degrades to null when Supabase is unset or the
 * viewer is signed out (host pages render their own fallback / redirect).
 *
 * RLS caveat (accepted): an individual-scope event a user is ONLY interested
 * in (not creator / assignee / volunteer) is not readable via can_read_event,
 * so it is cleanly omitted here — the events read drops it and it is never
 * rendered as a broken link.
 */
export default async function MyEventsPanel() {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // My Events — a single query, no pre-fetch needed.
  const { data: mineData } = await supabase
    .from("events")
    .select(SELECT_COLS)
    .eq("creator_id", user.id)
    .returns<MyEventRow[]>();
  const mine = mineData ?? [];

  // Interested + Volunteering ids (one query each, in parallel).
  const [interestIdsRes, volunteerIdsRes] = await Promise.all([
    supabase
      .from("event_interests")
      .select("event_id")
      .eq("user_id", user.id)
      .returns<{ event_id: string }[]>(),
    supabase
      .from("event_volunteers")
      .select("event_id")
      .eq("user_id", user.id)
      .returns<{ event_id: string }[]>(),
  ]);
  const interestIds = (interestIdsRes.data ?? []).map((r) => r.event_id);
  const volunteerIds = (volunteerIdsRes.data ?? []).map((r) => r.event_id);

  // Load the events for each id list with a single in() query each; an empty
  // id list skips the query entirely to avoid an `in ()` edge case.
  const [interestedRes, volunteeringRes] = await Promise.all([
    interestIds.length
      ? supabase
          .from("events")
          .select(SELECT_COLS)
          .in("id", interestIds)
          .returns<MyEventRow[]>()
      : Promise.resolve({ data: [] as MyEventRow[] }),
    volunteerIds.length
      ? supabase
          .from("events")
          .select(SELECT_COLS)
          .in("id", volunteerIds)
          .returns<MyEventRow[]>()
      : Promise.resolve({ data: [] as MyEventRow[] }),
  ]);
  const interested = interestedRes.data ?? [];
  const volunteering = volunteeringRes.data ?? [];

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <EventList title="My Events" events={mine} />
      <EventList title="Interested" events={interested} />
      <EventList title="Volunteering" events={volunteering} />
    </div>
  );
}

function EventList({
  title,
  events,
}: {
  title: string;
  events: MyEventRow[];
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-text-primary">{title}</h3>
      {events.length === 0 ? (
        <p className="text-sm text-text-secondary">None yet.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => {
            const when = formatEventDate(e.starts_at);
            return (
              <li key={e.id}>
                <Link
                  href={`/events/${e.id}`}
                  className="flex flex-wrap items-center gap-2 rounded-lg px-1 py-0.5 text-sm text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="font-medium">{e.title}</span>
                  <ScopeBadge scope={e.scope} />
                  {when && (
                    <span className="text-text-secondary">{when}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
