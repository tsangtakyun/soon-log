import { useCallback, useEffect, useState } from 'react';
import { EggBootstrap, loadEggBootstrap, rememberEggWorkspace } from '@/lib/eggApi';

export function useEggBootstrap() {
  const [data, setData] = useState<EggBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async (workspaceId?: string) => {
    try {
      setLoading(true);
      setError('');
      if (workspaceId) await rememberEggWorkspace(workspaceId);
      setData(await loadEggBootstrap(workspaceId));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loading, error, refresh };
}
