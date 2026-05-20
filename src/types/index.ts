export type Region = 'HK' | 'TW' | 'SG' | 'OTHER';
export type Role = 'creator' | 'fan';

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  region: Region | null;
  role: Role;
  created_at: string;
  last_seen_at: string | null;
};

export type Log = {
  id: string;
  user_id: string;
  title: string | null;
  body: string;
  production_notes: string | null;
  media_urls: string[];
  video_url: string | null;
  platform: string | null;
  tags: string[];
  is_published: boolean;
  created_at: string;
  updated_at: string;
  profile?: Profile | null;
  like_count?: number;
  comment_count?: number;
  liked_by_me?: boolean;
};

export type Comment = {
  id: string;
  log_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile?: Profile | null;
};
