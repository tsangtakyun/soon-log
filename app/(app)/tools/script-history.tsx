import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { EmptyState } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type ScriptRecord = {
  id: string;
  title?: string | null;
  content?: string | null;
  ai_draft?: string | null;
  qc_final?: string | null;
  topic?: string | null;
  brand?: string | null;
  industry?: string | null;
  created_at?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-HK', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export default function ScriptHistoryScreen() {
  const { user } = useAuth();
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadScripts = useCallback(async (showLoader = true) => {
    if (!user) return;
    if (showLoader) setLoading(true);

    try {
      const { data, error } = await supabase
        .from('scripts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setScripts((data ?? []) as ScriptRecord[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '載入失敗';
      Alert.alert('歷史記錄載入失敗', message);
      setScripts([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  async function copyScript(script: ScriptRecord) {
    const content = script.content || script.qc_final || script.ai_draft || '';
    if (!content) return;
    await Clipboard.setStringAsync(content);
    Alert.alert('已複製', '劇本已複製到剪貼板。');
  }

  function confirmDeleteScript(script: ScriptRecord) {
    Alert.alert(
      '刪除劇本？',
      `「${script.title || script.topic || '未命名劇本'}」會由歷史記錄移除。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: () => {
            void deleteScript(script);
          }
        }
      ]
    );
  }

  async function deleteScript(script: ScriptRecord) {
    if (!user) return;
    setDeletingId(script.id);
    try {
      const { error } = await supabase
        .from('scripts')
        .delete()
        .eq('id', script.id)
        .eq('user_id', user.id);

      if (error) throw error;
      setScripts((current) => current.filter((item) => item.id !== script.id));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('刪除失敗', message);
    } finally {
      setDeletingId(null);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadScripts(false);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={styles.screen}>
      <BackHeader title="劇本歷史" />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={scripts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={scripts.length === 0 ? styles.emptyContent : styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              title="未有劇本"
              body="生成並儲存劇本後，會在這裡顯示。"
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.cardTitle}>{item.title || item.topic || '未命名劇本'}</Text>
                  <Text style={styles.cardMeta}>
                    {[item.brand, item.industry, formatDate(item.created_at)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => copyScript(item)} style={styles.iconButton}>
                    <Feather name="copy" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmDeleteScript(item)}
                    disabled={deletingId === item.id}
                    style={[styles.iconButton, styles.deleteButton, deletingId === item.id && styles.disabledButton]}
                  >
                    {deletingId === item.id ? (
                      <ActivityIndicator size="small" color="#991b1b" />
                    ) : (
                      <Feather name="trash-2" size={16} color="#991b1b" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
              {item.content || item.qc_final || item.ai_draft ? (
                <Text numberOfLines={5} style={styles.content}>{item.content || item.qc_final || item.ai_draft}</Text>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F4EF'
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  cardTitleWrap: {
    flex: 1
  },
  cardTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  cardMeta: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  deleteButton: {
    backgroundColor: '#fee2e2'
  },
  disabledButton: {
    opacity: 0.62
  },
  content: {
    marginTop: 12,
    color: '#374151',
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21
  }
});
