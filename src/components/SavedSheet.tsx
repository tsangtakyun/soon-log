import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type SavedTab = 'trend' | 'discussion';
type SavedItem = {
  item_id: string;
  item_type: SavedTab;
  saved_at: string;
  preview_text: string;
  trend_icon: string | null;
  score: number | null;
};

const tabs: { key: SavedTab; label: string }[] = [
  { key: 'trend', label: 'Trends 話題' },
  { key: 'discussion', label: '討論意見' }
];

export function SavedSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SavedTab>('trend');
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const sheetHeight = useMemo(() => Math.round(Dimensions.get('window').height * 0.7), []);

  const loadSaved = useCallback(async () => {
    if (!visible || !user) return;
    setLoading(true);

    const { data: savedRows, error } = await supabase
      .from('saved_items')
      .select('item_id, item_type, saved_at')
      .eq('user_id', user.id)
      .eq('item_type', activeTab)
      .order('saved_at', { ascending: false });

    if (error) {
      console.log('Saved items fetch error:', JSON.stringify(error));
      setItems([]);
      setLoading(false);
      return;
    }

    const rows = (savedRows ?? []) as Array<{ item_id: string; item_type: SavedTab; saved_at: string }>;
    const ids = rows.map((row) => row.item_id);
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    if (activeTab === 'trend') {
      const { data: trends } = await supabase
        .from('trends')
        .select('id, topic, icon, heat_score')
        .in('id', ids);
      const trendMap = new Map((trends ?? []).map((trend) => [trend.id, trend]));
      setItems(rows.map((row) => {
        const trend = trendMap.get(row.item_id);
        return {
          ...row,
          preview_text: trend?.topic ?? 'Untitled trend',
          trend_icon: trend?.icon ?? '🔥',
          score: trend?.heat_score ?? 0
        };
      }));
    } else {
      const { data: discussions } = await supabase
        .from('trend_discussions')
        .select('id, body, like_count')
        .in('id', ids);
      const discussionMap = new Map((discussions ?? []).map((discussion) => [discussion.id, discussion]));
      setItems(rows.map((row) => {
        const discussion = discussionMap.get(row.item_id);
        return {
          ...row,
          preview_text: discussion?.body ?? '已刪除嘅討論',
          trend_icon: null,
          score: discussion?.like_count ?? 0
        };
      }));
    }

    setLoading(false);
  }, [activeTab, user, visible]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const openTrend = (id: string) => {
    onClose();
    router.push(`/(app)/home/trend/${id}`);
  };

  const renderItem = ({ item }: { item: SavedItem }) => {
    if (activeTab === 'trend') {
      return (
        <Pressable onPress={() => openTrend(item.item_id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <Text style={styles.trendIcon}>{item.trend_icon ?? '🔥'}</Text>
          <Text numberOfLines={1} style={styles.trendText}>{item.preview_text}</Text>
          <Text style={styles.score}>🔥 {item.score ?? 0}</Text>
        </Pressable>
      );
    }

    return (
      <Pressable onPress={onClose} style={({ pressed }) => [styles.discussionRow, pressed && styles.pressed]}>
        <Text numberOfLines={2} style={styles.discussionText}>{item.preview_text}</Text>
        <Text style={styles.discussionScore}>♡ {item.score ?? 0}</Text>
      </Pressable>
    );
  };

  const empty = activeTab === 'trend'
    ? { emoji: '📌', title: "You haven't saved any trends yet.", body: 'Save topics from the Trends tab' }
    : { emoji: '💬', title: '仲未收藏任何討論意見', body: '去 Trends 頁收藏 creator 嘅 insight' };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { height: sheetHeight, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Saved Posts</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>

          <View style={styles.segment}>
            {tabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)} style={[styles.segmentButton, active && styles.segmentButtonActive]}>
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {loading ? (
            <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => `${item.item_type}-${item.item_id}`}
              renderItem={renderItem}
              ListEmptyComponent={(
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>{empty.emoji}</Text>
                  <Text style={styles.emptyTitle}>{empty.title}</Text>
                  <Text style={styles.emptyBody}>{empty.body}</Text>
                </View>
              )}
              contentContainerStyle={items.length === 0 ? styles.emptyList : undefined}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.bgBody,
    paddingHorizontal: 16,
    paddingTop: 18
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  close: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 28
  },
  segment: {
    marginTop: 18,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: colors.bgBodyMuted,
    padding: 4,
    flexDirection: 'row',
    gap: 4
  },
  segmentButton: {
    flex: 1,
    borderRadius: 7,
    paddingVertical: 9,
    alignItems: 'center'
  },
  segmentButtonActive: {
    backgroundColor: colors.primary
  },
  segmentText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  segmentTextActive: {
    color: colors.textOnDark
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  trendIcon: {
    fontSize: 24
  },
  trendText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  score: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  discussionRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 12,
    gap: 6
  },
  discussionText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20
  },
  discussionScore: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  emptyList: {
    flexGrow: 1
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  emptyEmoji: {
    fontSize: 44
  },
  emptyTitle: {
    marginTop: 12,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    textAlign: 'center'
  },
  emptyBody: {
    marginTop: 6,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center'
  },
  pressed: {
    opacity: 0.72
  }
});
