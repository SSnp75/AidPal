import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import Avatar from "@/components/dashboard/Avatar";
import AddFriendButton from "./AddFriendButton";
import RequestActions from "./RequestActions";
import CancelRequestButton from "./CancelRequestButton";
import RemoveFriendButton from "./RemoveFriendButton";
import FriendsSearch from "./FriendsSearch";
import type { Friendship, Profile } from "@/types/db";

type FriendshipRow = Pick<
  Friendship,
  "user_low" | "user_high" | "requester_id" | "status"
>;
type ProfileLite = Pick<Profile, "id" | "display_name" | "avatar_url">;

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
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

  const rawQ = (await searchParams).q;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ)?.trim() ?? "";

  // Read all my friendship rows (RLS limits to my own; the .or keeps it explicit).
  const { data: rowsData } = await supabase
    .from("friendships")
    .select("user_low, user_high, requester_id, status")
    .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
    .returns<FriendshipRow[]>();

  const rows = rowsData ?? [];

  const otherParty = (r: FriendshipRow) =>
    r.user_low === user.id ? r.user_high : r.user_low;

  const accepted = rows.filter((r) => r.status === "accepted");
  const incoming = rows.filter(
    (r) => r.status === "pending" && r.requester_id !== user.id
  );
  const outgoing = rows.filter(
    (r) => r.status === "pending" && r.requester_id === user.id
  );

  // Resolve counterpart profiles in one query.
  const relatedIds = Array.from(new Set(rows.map(otherParty)));
  const { data: relatedProfiles } = relatedIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", relatedIds)
        .returns<ProfileLite[]>()
    : { data: [] as ProfileLite[] };

  const profileById = new Map<string, ProfileLite>();
  for (const p of relatedProfiles ?? []) profileById.set(p.id, p);
  const nameOf = (id: string) => profileById.get(id)?.display_name ?? "Someone";

  // Find people: public profiles excluding self and anyone already related.
  const excludeIds = new Set<string>([user.id, ...relatedIds]);
  let findQuery = supabase
    .from("profiles")
    .select("id, display_name, avatar_url");
  if (q) findQuery = findQuery.ilike("display_name", `%${q}%`);
  const { data: candidatesData } = await findQuery
    .order("display_name")
    .limit(20)
    .returns<ProfileLite[]>();
  const candidates = (candidatesData ?? []).filter((p) => !excludeIds.has(p.id));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">Friends</h1>

      {/* Friends */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          Friends
        </h2>
        {accepted.length === 0 ? (
          <p className="text-text-secondary">No friends yet.</p>
        ) : (
          <ul className="space-y-3">
            {accepted.map((r) => {
              const id = otherParty(r);
              const name = nameOf(id);
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={name} />
                    <span className="text-text-primary">{name}</span>
                  </div>
                  <RemoveFriendButton userId={id} name={name} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Incoming requests */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          Incoming requests
        </h2>
        {incoming.length === 0 ? (
          <p className="text-text-secondary">No incoming requests.</p>
        ) : (
          <ul className="space-y-3">
            {incoming.map((r) => {
              const id = otherParty(r);
              const name = nameOf(id);
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={name} />
                    <span className="text-text-primary">{name}</span>
                  </div>
                  <RequestActions requesterId={id} name={name} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Outgoing requests */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          Outgoing requests
        </h2>
        {outgoing.length === 0 ? (
          <p className="text-text-secondary">No pending requests.</p>
        ) : (
          <ul className="space-y-3">
            {outgoing.map((r) => {
              const id = otherParty(r);
              const name = nameOf(id);
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={name} />
                    <span className="text-text-primary">{name}</span>
                  </div>
                  <CancelRequestButton addresseeId={id} name={name} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Find people */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          Find people
        </h2>
        <FriendsSearch initialQuery={q} />
        {candidates.length === 0 ? (
          <p className="text-text-secondary">
            {q ? "No one matches that search." : "No one to add right now."}
          </p>
        ) : (
          <ul className="space-y-3">
            {candidates.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={p.display_name} />
                  <span className="text-text-primary">{p.display_name}</span>
                </div>
                <AddFriendButton userId={p.id} name={p.display_name} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
