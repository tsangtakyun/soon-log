import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Log } from '@/types';

const PAGE_SIZE = 20;

async function enrichLogs(logs: Log[], userId?: string | null): Promise<Log[]> {
  const ids = logs.map((log) => log.id);
  if (ids.length === 0) return logs;

  const [{ data: likes }, { data: comments }, liked] = await Promise.all([
    supabase.from('likes').select('log_id').in('log_id', ids),
    supabase.from('comments').select('log_id').in('log_id', ids),
    userId
      ? supabase.from('likes').select('log_id').eq('user_id', userId).in('log_id', ids)
      : Promise.resolve({ data: [] as { log_id: string }[] })
  ]);

  return logs.map((log) => ({
    ...log,
    like_count: likes?.filter((row) => row.log_id === log.id).length ?? 0,
    comment_count: comments?.filter((row) => row.log_id === log.id).length ?? 0,
    liked_by_me: liked.data?.some((row) => row.log_id === log.id) ?? false
  }));
}

export function useFeed(userId?: string | null) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(async (nextPage = 0, replace = true) => {
    if (replace) setRefreshing(true);
    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('logs')
      .select('*, profile:profiles!logs_user_id_fkey(*)')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const enriched = await enrichLogs((data ?? []) as Log[], userId);
    setLogs((current) => replace ? enriched : [...current, ...enriched]);
    setHasMore((data?.length ?? 0) === PAGE_SIZE);
    setPage(nextPage);
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  const refresh = useCallback(() => fetchPage(0, true), [fetchPage]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchPage(page + 1, false).catch(() => undefined);
    }
  }, [fetchPage, hasMore, loading, page]);

  useEffect(() => {
    refresh().catch(() => {
      setLoading(false);
      setRefreshing(false);
    });
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel('public-feed-logs')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'logs',
        filter: 'is_published=eq.true'
      }, async (payload) => {
        const inserted = payload.new as Log;
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', inserted.user_id)
          .maybeSingle();
        setLogs((current) => [
          { ...inserted, profile: data, like_count: 0, comment_count: 0, liked_by_me: false },
          ...current.filter((log) => log.id !== inserted.id)
        ]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { logs, loading, refreshing, refresh, loadMore, setLogs };
}
