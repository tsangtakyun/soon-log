import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Image, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type TrendAngle = { emoji: string; name: string; percentage: number };
type NewsHeadline = string | { title?: string; source?: string; url?: string };
type Trend = {
  id: string;
  topic: string;
  icon: string | null;
  category?: string | null;
  heat_score: number | null;
  angles: TrendAngle[];
  created_at?: string | null;
  deadline_at?: string | null;
  deadline_timezone?: string | null;
  news_headlines?: NewsHeadline[] | null;
};
type FilterMode = 'hot' | 'newest' | 'news' | 'finance' | 'tech' | 'life' | 'sports' | 'gaming' | 'anime' | 'entertainment';

const filterOptions: Array<{ key: FilterMode; label: string; category?: string }> = [
  { key: 'hot', label: '熱門' },
  { key: 'newest', label: '最新' },
  { key: 'news', label: '新聞', category: 'news' },
  { key: 'finance', label: '財經', category: 'finance' },
  { key: 'tech', label: '科技', category: 'tech' },
  { key: 'life', label: '生活', category: 'life' },
  { key: 'sports', label: '體育', category: 'sports' },
  { key: 'gaming', label: '遊戲', category: 'gaming' },
  { key: 'anime', label: '動漫', category: 'anime' },
  { key: 'entertainment', label: '娛樂', category: 'entertainment' }
];

function isImageIcon(value: string | null | undefined) {
  return Boolean(value && (/^(https?:|data:image\/)/.test(value)));
}

function TrendIcon({ value, size = 40 }: { value?: string | null; size?: number }) {
  if (isImageIcon(value)) {
    return <Image source={{ uri: value || '' }} style={{ width: size, height: size, borderRadius: size * 0.22 }} resizeMode="cover" />;
  }

  return <Text style={[styles.trendIcon, { fontSize: size }]}>{value || '🔥'}</Text>;
}

function formatDeadline(value?: string | null) {
  if (!value) return '未設定截止時間';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未設定截止時間';
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const dateText = date.toLocaleDateString('zh-HK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeText = date.toLocaleTimeString('zh-HK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  });
  return `${dateText} ${timeText} 截止 · 你嘅時區 ${localTimeZone}`;
}

function getHeadlineTitle(headline: NewsHeadline) {
  if (typeof headline === 'string') return headline.trim();
  return (headline.title || headline.url || '').trim();
}

function normaliseHeadlines(headlines?: NewsHeadline[] | null) {
  if (!Array.isArray(headlines)) return [];
  return headlines.map(getHeadlineTitle).filter(Boolean).slice(0, 8);
}

function NewsTicker({ headlines }: { headlines?: NewsHeadline[] | null }) {
  const items = normaliseHeadlines(headlines);
  const [index, setIndex] = useState(0);
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (items.length <= 1) return undefined;
    const interval = setInterval(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true
        }),
        Animated.timing(translateY, {
          toValue: -8,
          duration: 220,
          useNativeDriver: true
        })
      ]).start(() => {
        setIndex((current) => (current + 1) % items.length);
        translateY.setValue(8);
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 260,
            useNativeDriver: true
          })
        ]).start();
      });
    }, 3200);

    return () => clearInterval(interval);
  }, [items.length, opacity, translateY]);

  if (items.length === 0) return null;

  return (
    <View style={styles.newsTicker}>
      <View style={styles.newsMeta}>
        <Feather name="radio" size={12} color={colors.primary} />
        <Text style={styles.newsMetaText}>新聞標題</Text>
      </View>
      <Animated.Text
        numberOfLines={1}
        style={[
          styles.newsText,
          {
            opacity,
            transform: [{ translateY }]
          }
        ]}
      >
        {items[index]}
      </Animated.Text>
    </View>
  );
}

function TrendCard({ trend }: { trend: Trend }) {
  const angles = trend.angles ?? [];
  return (
    <Pressable
      onPress={() => router.push({
        pathname: '/(app)/home/trend/[id]',
        params: { id: trend.id, returnTo: '/(app)/predikt' }
      })}
      style={({ pressed }) => [styles.trendCard, pressed && styles.pressed]}
    >
      <View style={styles.trendHeader}>
        <View style={styles.trendTopic}>
          <TrendIcon value={trend.icon} />
          <Text style={styles.trendTitle}>{trend.topic}</Text>
        </View>
        <Text style={styles.heat}>🔥 {trend.heat_score ?? 0}</Text>
      </View>
      <View style={styles.deadlineRow}>
        <Feather name="clock" size={13} color={colors.textMuted} />
        <Text style={styles.deadlineText}>{formatDeadline(trend.deadline_at)}</Text>
      </View>
      <View style={styles.angles}>
        {angles.slice(0, 4).map((angle) => (
          <View key={`${trend.id}-${angle.name}`} style={styles.angleRow}>
            <TrendIcon value={angle.emoji} size={18} />
            <Text numberOfLines={1} style={styles.angleName}>{angle.name}</Text>
            <Text style={styles.anglePercent}>{angle.percentage}%</Text>
            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, angle.percentage))}%` }]} />
            </View>
          </View>
        ))}
      </View>
      <NewsTicker headlines={trend.news_headlines} />
    </Pressable>
  );
}

export default function PrediktScreen() {
  const params = useLocalSearchParams<{ focus?: string }>();
  const focusId = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const [trends, setTrends] = useState<Trend[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>('hot');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadTrends = useCallback(async () => {
    const { data, error } = await supabase
      .from('trends')
      .select('*')
      .eq('is_active', true);

    setTrends(error ? [] : (data ?? []) as Trend[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTrends();
    }, [loadTrends])
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadTrends();
    setRefreshing(false);
  }, [loadTrends]);

  const sortedTrends = useMemo(() => {
    const activeFilter = filterOptions.find((option) => option.key === filterMode);
    const filtered = activeFilter?.category
      ? trends.filter((trend) => trend.category === activeFilter.category)
      : trends;
    const next = [...filtered].sort((a, b) => {
      if (filterMode === 'newest') {
        return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      }
      return (b.heat_score ?? 0) - (a.heat_score ?? 0);
    });

    if (!focusId) return next;
    const focusIndex = next.findIndex((trend) => trend.id === focusId);
    if (focusIndex <= 0) return next;
    const [focused] = next.splice(focusIndex, 1);
    return [focused, ...next];
  }, [filterMode, focusId, trends]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>討論區</Text>
            <Text style={styles.subtitle}>🔥 創作者社群熱話</Text>
          </View>
          <Pressable
            onPress={() => setShowSortMenu(true)}
            style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}
          >
            <Feather name="sliders" size={16} color={colors.primary} />
            <Text style={styles.sortButtonText}>{filterOptions.find((option) => option.key === filterMode)?.label}</Text>
            <Feather name="chevron-down" size={14} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
      <Modal visible={showSortMenu} transparent animationType="fade" onRequestClose={() => setShowSortMenu(false)}>
        <Pressable style={styles.sortOverlay} onPress={() => setShowSortMenu(false)}>
          <View style={styles.sortMenu}>
            <Text style={styles.sortMenuTitle}>分類</Text>
            {filterOptions.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  setFilterMode(option.key);
                  setShowSortMenu(false);
                }}
                style={({ pressed }) => [
                  styles.sortMenuItem,
                  filterMode === option.key && styles.sortMenuItemActive,
                  pressed && styles.pressed
                ]}
              >
                <Text style={[styles.sortMenuText, filterMode === option.key && styles.sortMenuTextActive]}>{option.label}</Text>
                {filterMode === option.key ? <Feather name="check" size={16} color={colors.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
      <FlatList
        data={sortedTrends}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TrendCard trend={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        contentContainerStyle={sortedTrends.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>暫時未有熱話</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  header: {
    paddingTop: 64,
    paddingHorizontal: 16,
    paddingBottom: 18
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  headerCopy: {
    flex: 1
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 34
  },
  subtitle: {
    marginTop: 5,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14
  },
  sortButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 999,
    backgroundColor: colors.bgBodyCard,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  sortButtonText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  sortOverlay: {
    flex: 1,
    alignItems: 'flex-end',
    paddingTop: 104,
    paddingRight: 16,
    backgroundColor: 'rgba(0,0,0,0.08)'
  },
  sortMenu: {
    width: 160,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 14,
    backgroundColor: colors.bgBodyCard,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8
  },
  sortMenuTitle: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  sortMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  sortMenuItemActive: {
    backgroundColor: '#FBF4EE'
  },
  sortMenuText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  sortMenuTextActive: {
    color: colors.primary,
    fontFamily: fonts.bodyBold
  },
  sortBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14
  },
  sortPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  sortPillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  sortText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  sortTextActive: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 110
  },
  emptyList: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 110
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15
  },
  trendCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    padding: 16
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  trendTopic: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  trendIcon: {
    fontSize: 40
  },
  trendTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  heat: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  deadlineRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  deadlineText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  angles: {
    marginTop: 14,
    gap: 12
  },
  angleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  angleEmoji: {
    fontSize: 16
  },
  angleName: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14
  },
  anglePercent: {
    width: 38,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    textAlign: 'right'
  },
  progress: {
    width: 62,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.bodyBorder,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary
  },
  newsTicker: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.bodyBorder,
    paddingTop: 12,
    overflow: 'hidden'
  },
  newsMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4
  },
  newsMetaText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 11
  },
  newsText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18
  },
  pressed: {
    opacity: 0.72
  }
});
