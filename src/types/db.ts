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
