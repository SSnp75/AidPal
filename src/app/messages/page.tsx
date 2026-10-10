import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import Avatar from "@/components/dashboard/Avatar";
import type {
  Conversation,
  ConversationMember,
  Message,
  Profile,
  Group,
} from "@/types/db";

type ConversationRow = Pick<
  Conversation,
  "id" | "kind" | "group_id" | "created_at"
>;
type ConversationMemberRow = Pick<
  ConversationMember,
  "conversation_id" | "user_id"
>;
type ProfileLite = Pick<Profile, "id" | "display_name">;
type GroupLite = Pick<Group, "id" | "name">;
type LatestMessage = Pick<Message, "id" | "body" | "created_at">;

export default async function MessagesPage() {
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

  // Conversations the caller can see (RLS → can_access_conversation).
  const { data: conversationsData } = await supabase
    .from("conversations")
    .select("id, kind, group_id, created_at")
    .returns<ConversationRow[]>();
  const conversations = conversationsData ?? [];

  const dmConversationIds = conversations
    .filter((c) => c.kind === "dm")
    .map((c) => c.id);
  const groupIds = Array.from(
    new Set(
      conversations
        .filter((c) => c.kind === "group" && c.group_id)
        .map((c) => c.group_id as string)
    )
  );

  // Resolve DM other-member display names: members for my DM conversations …
  const { data: memberRows } = dmConversationIds.length
    ? await supabase
        .from("conversation_members")
        .select("conversation_id, user_id")
        .in("conversation_id", dmConversationIds)
        .returns<ConversationMemberRow[]>()
    : { data: [] as ConversationMemberRow[] };

  // The non-self member for each DM conversation (exactly-two-members invariant).
  const otherUserIdByConv = new Map<string, string>();
  for (const m of memberRows ?? []) {
    if (m.user_id !== user.id) otherUserIdByConv.set(m.conversation_id, m.user_id);
  }

  // … then one profiles lookup for those member ids.
  const otherUserIds = Array.from(new Set(otherUserIdByConv.values()));
  const { data: profileRows } = otherUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", otherUserIds)
        .returns<ProfileLite[]>()
    : { data: [] as ProfileLite[] };
  const profileById = new Map<string, ProfileLite>();
  for (const p of profileRows ?? []) profileById.set(p.id, p);

  // Group names via one lookup.
  const { data: groupRows } = groupIds.length
    ? await supabase
        .from("groups")
        .select("id, name")
        .in("id", groupIds)
        .returns<GroupLite[]>()
    : { data: [] as GroupLite[] };
  const groupById = new Map<string, GroupLite>();
  for (const g of groupRows ?? []) groupById.set(g.id, g);

  // Deterministic per-conversation latest message (NOT a single global cap).
  const latestEntries = await Promise.all(
    conversations.map(async (c) => {
      const { data } = await supabase
        .from("messages")
        .select("id, body, created_at")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<LatestMessage>();
      return [c.id, data ?? null] as const;
    })
  );
  const latestByConv = new Map<string, LatestMessage | null>(latestEntries);

  // Build rows with an effective last-activity timestamp, then exactly ONE sort.
  const rows = conversations.map((c) => {
    const latest = latestByConv.get(c.id) ?? null;
    const effectiveTs = Math.max(
      latest ? Date.parse(latest.created_at) : Date.parse(c.created_at),
      Date.parse(c.created_at)
    );
    return { c, latest, effectiveTs };
  });
  rows.sort(
    (a, b) =>
      b.effectiveTs - a.effectiveTs ||
      (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0)
  );

  const dmRows = rows.filter((r) => r.c.kind === "dm");
  const groupChatRows = rows.filter((r) => r.c.kind === "group");

  const titleFor = (c: ConversationRow): string => {
    if (c.kind === "group") {
      const g = c.group_id ? groupById.get(c.group_id) : undefined;
      return g ? `${g.name} chat` : "Group chat";
    }
    const otherId = otherUserIdByConv.get(c.id);
    return (otherId && profileById.get(otherId)?.display_name) || "Someone";
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">Messages</h1>

      {rows.length === 0 ? (
        <p className="text-text-secondary">
          No conversations yet. Message a friend from the Friends page, or open
          a group&apos;s chat.
        </p>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-text-primary mb-3">
              Direct messages
            </h2>
            {dmRows.length === 0 ? (
              <p className="text-text-secondary">No direct messages yet.</p>
            ) : (
              <ul className="space-y-3">
                {dmRows.map(({ c, latest }) => {
                  const title = titleFor(c);
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/messages/${c.id}`}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <Avatar name={title} />
                        <div className="min-w-0">
                          <span className="block text-text-primary">
                            {title}
                          </span>
                          <span className="block truncate text-sm text-text-secondary">
                            {latest ? latest.body : "No messages yet"}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">
              Group chats
            </h2>
            {groupChatRows.length === 0 ? (
              <p className="text-text-secondary">No group chats yet.</p>
            ) : (
              <ul className="space-y-3">
                {groupChatRows.map(({ c, latest }) => {
                  const title = titleFor(c);
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/messages/${c.id}`}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <Avatar name={title} />
                        <div className="min-w-0">
                          <span className="block text-text-primary">
                            {title}
                          </span>
                          <span className="block truncate text-sm text-text-secondary">
                            {latest ? latest.body : "No messages yet"}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
