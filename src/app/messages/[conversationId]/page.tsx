import { notFound, redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { isUUID } from "@/lib/validation";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import Thread from "./Thread";
import type {
  Conversation,
  ConversationMember,
  Message,
  Profile,
  Group,
} from "@/types/db";

type ConversationRow = Pick<Conversation, "id" | "kind" | "group_id">;
type MessageRow = Pick<
  Message,
  "id" | "conversation_id" | "sender_id" | "body" | "created_at"
>;
type ConversationMemberRow = Pick<ConversationMember, "user_id">;
type ProfileLite = Pick<Profile, "id" | "display_name">;
type GroupLite = Pick<Group, "id" | "name">;

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <SupabaseNotConfigured />
      </div>
    );
  }

  const { conversationId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (!isUUID(conversationId)) notFound();

  // RLS gates reads: an inaccessible or missing conversation returns null → 404.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, kind, group_id")
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (!conversation) notFound();

  // Messages for this thread, oldest first.
  const { data: messageData } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500)
    .returns<MessageRow[]>();
  const messages = messageData ?? [];

  // Resolve sender display names via one profiles lookup.
  const senderIds = Array.from(new Set(messages.map((m) => m.sender_id)));
  const { data: senderProfiles } = senderIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", senderIds)
        .returns<ProfileLite[]>()
    : { data: [] as ProfileLite[] };
  const senderNames: Record<string, string> = {};
  for (const p of senderProfiles ?? []) {
    senderNames[p.id] = p.display_name;
  }

  // Header title.
  let title = "Conversation";
  if (conversation.kind === "group") {
    const { data: group } = conversation.group_id
      ? await supabase
          .from("groups")
          .select("id, name")
          .eq("id", conversation.group_id)
          .maybeSingle<GroupLite>()
      : { data: null as GroupLite | null };
    title = group ? `${group.name} chat` : "Group chat";
  } else {
    // DM: the single non-self member row (exactly-two-members invariant).
    const { data: otherMember } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .neq("user_id", user.id)
      .maybeSingle<ConversationMemberRow>();
    if (otherMember) {
      const { data: otherProfile } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", otherMember.user_id)
        .maybeSingle<ProfileLite>();
      title = otherProfile?.display_name ?? "Someone";
    } else {
      title = "Someone";
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">{title}</h1>
      <Thread
        conversationId={conversationId}
        initialMessages={messages}
        senderNames={senderNames}
      />
    </div>
  );
}
