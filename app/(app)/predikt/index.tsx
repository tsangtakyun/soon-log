import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type TrendAngle = { emoji: string; name: string; percentage: number };
type Trend = {
  id: string;
  topic: string;
  icon: string | null;
  heat_score: number | null;
  angles: TrendAngle[];
  created_at?: string | null;
};
type SortMode = 'heat' | 'newest' | 'az';

const sortOptions: Array<{ key: SortMode; label: string }> = [
  { key: 'heat', label: '熱度' },
  { key: 'newest', label: '最新' },
  { key: 'az', label: 'A-Z' }
];

function TrendCard({ trend }: { trend: Trend }) {
  const angles = trend.angles ?? [];
  return (
    <Pressable onPress={() => router.push('/(app)/home/trend/' + trend.id)} style={({ pressed }) => [styles.trendCard, pressed && styles.pressed]}>
      <View style={styles.trendHeader}>
        <View style={styles.trendTopic}>
          <Text style={styles.trendIcon}>{trend.icon || '🔥'}</Text>
          <Text style={styles.trendTitle}>{trend.topic}</Text>
        </View>
        <Text style={styles.heat}>🔥 {trend.heat_score ?? 0}</Text>
      </View>
      <View style={styles.angles}>
        {angles.slice(0, 4).map((angle) => (
          <View key={`${trend.id}-${angle.name}`} style={styles.angleRow}>
            <Text style={styles.angleEmoji}>{angle.emoji}</Text>
            <Text numberOfLines={1} style={styles.angleName}>{angle.name}</Text>
            <Text style={styles.anglePercent}>{angle.percentage}%</Text>
            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, angle.percentage))}%` }]} />
            </View>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

export default function PrediktScreen() {
  const params = useLocalSearchParams<{ focus?: string }>();
  const focusId = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const [trends, setTrends] = useState<Trend[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('heat');
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
    const next = [...trends].sort((a, b) => {
      if (sortMode === 'newest') {
        return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      }
      if (sortMode === 'az') {
        return a.topic.localeCompare(b.topic);
      }
      return (b.heat_score ?? 0) - (a.heat_score ?? 0);
    });

    if (!focusId) return next;
    const focusIndex = next.findIndex((trend) => trend.id === focusId);
    if (focusIndex <= 0) return next;
    const [focused] = next.splice(focusIndex, 1);
    return [focused, ...next];
  }, [focusId, sortMode, trends]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>討論區</Text>
        <Text style={styles.subtitle}>🔥 創作者社群熱話</Text>
      </View>
      <View style={styles.sortBar}>
        {sortOptions.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => setSortMode(option.key)}
            style={({ pressed }) => [
              styles.sortPill,
              sortMode === option.key && styles.sortPillActive,
              pressed && styles.pressed
            ]}
          >
            <Text style={[styles.sortText, sortMode === option.key && styles.sortTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
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
  pressed: {
    opacity: 0.72
  }
});
