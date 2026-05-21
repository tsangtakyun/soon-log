import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';

export function useUnreadComments(profile: Profile | null) {
  const [count, setCount] = useState(0);
  const profileId = profile?.id ?? null;
  const lastSeenAt = profile?.last_seen_at ?? null;

  const refresh = useCallback(async () => {
    if (!profileId) {
      setCount(0);
      return;
    }

    const { data: logs, error: logsError } = await supabase
      .from('logs')
      .select('id')
      .eq('user_id', profileId);

    if (logsError) throw logsError;

    const logIds = logs?.map((log) => log.id) ?? [];
    if (logIds.length === 0) {
      setCount(0);
      return;
    }

    let query = supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .in('log_id', logIds)
      .neq('user_id', profileId);

    if (lastSeenAt) {
      query = query.gt('created_at', lastSeenAt);
    }

    const { count: unreadCount, error } = await query;
    if (error) throw error;
    setCount(unreadCount ?? 0);
  }, [lastSeenAt, profileId]);

  useEffect(() => {
    refresh().catch(() => setCount(0));
  }, [refresh]);

  useEffect(() => {
    if (!profileId) return;

    const channel = supabase
      .channel(`profile-unread-comments-${profileId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'comments'
      }, () => {
        refresh().catch(() => undefined);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId, refresh]);

  return { count, refresh };
}
