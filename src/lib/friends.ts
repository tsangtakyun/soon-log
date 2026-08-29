import { supabase } from '@/lib/supabase';

export type FriendProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  region: string | null;
};

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export async function loadFriendProfiles(userId: string) {
  const { data: rows, error: followError } = await supabase
    .from('follows')
    .select('following_id, created_at')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });

  if (followError) throw followError;

  const ids = (rows ?? []).map((row) => row.following_id).filter(Boolean);
  if (ids.length === 0) return [];

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, region')
    .in('id', ids);

  if (error) throw error;

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile as FriendProfile]));
  return ids.flatMap((id) => profileMap.get(id) ? [profileMap.get(id) as FriendProfile] : []);
}

export async function loadCollaboratorProfiles(userId: string) {
  const [followingResult, followerResult] = await Promise.all([
    supabase
      .from('follows')
      .select('following_id, created_at')
      .eq('follower_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('follows')
      .select('follower_id, created_at')
      .eq('following_id', userId)
      .order('created_at', { ascending: false })
  ]);

  if (followingResult.error) throw followingResult.error;
  if (followerResult.error) throw followerResult.error;

  const ids = [
    ...((followingResult.data ?? []).map((row) => row.following_id)),
    ...((followerResult.data ?? []).map((row) => row.follower_id))
  ].filter((id): id is string => Boolean(id) && id !== userId);
  const uniqueIds = Array.from(new Set(ids));

  if (uniqueIds.length === 0) return [];

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, region')
    .in('id', uniqueIds);

  if (error) throw error;

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile as FriendProfile]));
  return uniqueIds.flatMap((id) => profileMap.get(id) ? [profileMap.get(id) as FriendProfile] : []);
}

export async function addFriendByUsername(userId: string, rawUsername: string) {
  const username = normalizeUsername(rawUsername);
  if (!username) throw new Error('請輸入 username');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, region')
    .eq('username', username)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile?.id) throw new Error(`搵唔到 @${username}`);
  if (profile.id === userId) throw new Error('唔需要加自己做好友');

  const { data: existing, error: existingError } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)
    .eq('following_id', profile.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return { profile: profile as FriendProfile, alreadyFriend: true };

  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: userId, following_id: profile.id });

  if (error) throw error;
  return { profile: profile as FriendProfile, alreadyFriend: false };
}
