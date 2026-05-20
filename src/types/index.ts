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

export type WorkStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
export type WorkPriority = 'low' | 'medium' | 'high';

export type WorkItem = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: WorkStatus;
  priority: WorkPriority;
  due_date: string | null;
  assignee_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  assignee?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
};

export type ScheduleType = 'shoot' | 'meeting' | 'deadline' | 'publish' | 'other';

export type Schedule = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
  type: ScheduleType;
  collaborators: string[];
  related_log_id: string | null;
  created_at: string;
  related_log?: Pick<Log, 'id' | 'title' | 'body'> | null;
};

export type MayanMessageRole = 'user' | 'assistant';

export type MayanMessage = {
  id: string;
  user_id: string;
  role: MayanMessageRole;
  content: string;
  created_at: string;
};
