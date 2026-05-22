import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LogCard } from '@/components/LogCard';
import { EmptyState, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useFeed } from '@/hooks/useFeed';
import { endOfDay, formatScheduleTime, scheduleTypes, startOfDay } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Schedule } from '@/types';

function TodayScheduleStrip({ schedules }: { schedules: Schedule[] }) {
  const router = useRouter();
  if (schedules.length === 0) return null;

  return (
    <View style={styles.scheduleWrap}>
      <Text style={styles.scheduleHeading}>今日日程</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scheduleStrip}>
        {schedules.map((item) => {
          const config = scheduleTypes[item.type];
          return (
            <Pressable key={item.id} onPress={() => router.push('/schedule')} style={styles.scheduleCard}>
              <Text style={styles.scheduleEmoji}>{config.short}</Text>
              <Text numberOfLines={1} style={styles.scheduleTitle}>{item.title}</Text>
              <Text style={styles.scheduleTime}>{formatScheduleTime(item.start_at)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function FeedScreen() {
  const { user } = useAuth();
  const { logs, loading, refreshing, refresh, loadMore } = useFeed(user?.id);
  const [todaySchedules, setTodaySchedules] = useState<Schedule[]>([]);

  const loadTodaySchedules = useCallback(async () => {
    if (!user) {
      setTodaySchedules([]);
      return;
    }
    const now = new Date();
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .gte('start_at', startOfDay(now).toISOString())
      .lte('start_at', endOfDay(now).toISOString())
      .order('start_at', { ascending: true });

    if (error) {
      return;
    }
    setTodaySchedules((data ?? []) as Schedule[]);
  }, [user]);

  useEffect(() => {
    loadTodaySchedules();
    const channel = supabase
      .channel('feed-today-schedules')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => loadTodaySchedules())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTodaySchedules]);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.doodle}>✦</Text>
          <Text style={styles.brand}>SOON LOG</Text>
        </View>
        <Text style={styles.subtitle}>今日靈感、幕後筆記同創作者日常</Text>
      </View>
      <TodayScheduleStrip schedules={todaySchedules} />
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <LogCard log={item} />}
          refreshing={refreshing}
          onRefresh={refresh}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListEmptyComponent={<EmptyState title="暫時未有紀錄" body="第一篇 SOON-LOG 很快就會出現。" />}
          style={styles.list}
          contentContainerStyle={logs.length === 0 ? styles.emptyList : styles.listContent}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 58,
    paddingBottom: 18,
    backgroundColor: colors.bg
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  doodle: {
    color: colors.gold,
    fontFamily: fonts.bodyBold,
    fontSize: 22
  },
  brand: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 38,
    lineHeight: 42
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    marginTop: 4
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center'
  },
  list: {
    backgroundColor: colors.bg
  },
  listContent: {
    paddingBottom: 24
  },
  scheduleWrap: {
    paddingBottom: 12
  },
  scheduleHeading: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    paddingHorizontal: 16,
    marginBottom: 8
  },
  scheduleStrip: {
    paddingHorizontal: 16,
    gap: 10
  },
  scheduleCard: {
    width: 146,
    minHeight: 74,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    padding: 12,
    gap: 4,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 }
  },
  scheduleEmoji: {
    fontSize: 18
  },
  scheduleTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  scheduleTime: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  }
});
