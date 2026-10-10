/** Hand-written row types for the thin-slice tables. */

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  owner_id: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
}

export interface Post {
  id: string;
  group_id: string;
  author_id: string;
  body: string | null;
  created_at: string;
}

export interface Media {
  id: string;
  post_id: string;
  storage_path: string;
  mime_type: string;
  uploader_id: string;
  created_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export type ReactionType = "like" | "love" | "dislike";

export interface Reaction {
  post_id: string;
  user_id: string;
  type: ReactionType;
  created_at: string;
}

export type ActivityVerb =
  | "created_post"
  | "commented"
  | "reacted"
  | "joined_group"
  | "created_group"
  | "bookmarked"
  | "sent_friend_request"
  | "accepted_friend"
  | "created_event"
  | "volunteered_for_event";

export type EventScope = "individual" | "group" | "public";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface Event {
  id: string;
  creator_id: string;
  group_id: string | null;
  scope: EventScope;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface EventTask {
  id: string;
  event_id: string;
  title: string;
  status: TaskStatus;
  assignee_id: string | null;
  created_by: string;
  created_at: string;
}

export interface EventVolunteer {
  event_id: string;
  user_id: string;
  role: string | null;
  created_at: string;
}

export interface EventInterest {
  event_id: string;
  user_id: string;
  created_at: string;
}

export interface Friendship {
  user_low: string;
  user_high: string;
  requester_id: string;
  status: "pending" | "accepted";
  created_at: string;
  responded_at: string | null;
}

export interface Bookmark {
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface Activity {
  id: string;
  user_id: string;
  verb: ActivityVerb;
  target_type: string | null;
  target_id: string | null;
  group_id: string | null;
  created_at: string;
}
