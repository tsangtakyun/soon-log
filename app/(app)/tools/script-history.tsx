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
                <TouchableOpacity onPress={() => copyScript(item)} style={styles.copyButton}>
                  <Feather name="copy" size={16} color={colors.primary} />
                </TouchableOpacity>
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
  copyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    marginTop: 12,
    color: '#374151',
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21
  }
});
