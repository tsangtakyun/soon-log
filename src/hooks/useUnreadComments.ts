import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';

export function useUnreadComments(profile: Profile | null) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!profile) {
      setCount(0);
      return;
    }

    const { data: logs, error: logsError } = await supabase
      .from('logs')
      .select('id')
      .eq('user_id', profile.id);

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
      .neq('user_id', profile.id);

    if (profile.last_seen_at) {
      query = query.gt('created_at', profile.last_seen_at);
    }

    const { count: unreadCount, error } = await query;
    if (error) throw error;
    setCount(unreadCount ?? 0);
  }, [profile]);

  useEffect(() => {
    refresh().catch(() => setCount(0));
  }, [refresh]);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel(`profile-unread-comments-${profile.id}`)
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
  }, [profile, refresh]);

  return { count, refresh };
}
