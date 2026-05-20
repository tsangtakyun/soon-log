import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { endOfDay, formatScheduleTime, sameDay, scheduleTypes, startOfDay, startOfWeek } from '@/lib/schedule';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Schedule } from '@/types';

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat('zh-HK', { weekday: 'short' }).format(date);
}

function monthDay(date: Date) {
  return new Intl.DateTimeFormat('zh-HK', { day: '2-digit' }).format(date);
}

function eventDate(event: Schedule) {
  return new Date(event.start_at);
}

function TodayCard({ item }: { item: Schedule }) {
  const config = scheduleTypes[item.type];
  return (
    <View style={[styles.todayCard, { borderLeftColor: config.color }]}>
      <Text style={styles.todayTime}>{formatScheduleTime(item.start_at)}</Text>
      <Text numberOfLines={2} style={styles.todayTitle}>{item.title}</Text>
      {item.location ? <Text numberOfLines={1} style={styles.location}>{item.location}</Text> : null}
    </View>
  );
}

function EventRow({ item }: { item: Schedule }) {
  const config = scheduleTypes[item.type];
  return (
    <View style={styles.eventRow}>
      <View style={[styles.timePill, { backgroundColor: `${config.color}18` }]}>
        <Text style={[styles.timePillText, { color: config.color }]}>{formatScheduleTime(item.start_at)}</Text>
      </View>
      <View style={styles.eventBody}>
        <Text style={styles.eventTitle}>{item.title}</Text>
        {item.location ? <Text style={styles.eventLocation}>{item.location}</Text> : null}
      </View>
      <Text style={[styles.typeBadge, { color: config.color, backgroundColor: `${config.color}14` }]}>{config.label}</Text>
    </View>
  );
}

export default function ScheduleScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<Schedule[]>([]);
  const [selectedDay, setSelectedDay] = useState(startOfDay(new Date()));

  const weekDays = useMemo(() => {
    const monday = startOfWeek(selectedDay);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }, [selectedDay]);

  const loadEvents = useCallback(async () => {
    const firstDay = startOfWeek(new Date());
    const lastDay = new Date(firstDay);
    lastDay.setDate(firstDay.getDate() + 6);

    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .gte('start_at', firstDay.toISOString())
      .lte('start_at', endOfDay(lastDay).toISOString())
      .order('start_at', { ascending: true });

    if (error) {
      console.error('Schedule fetch error:', JSON.stringify(error));
      setEvents([]);
      return;
    }
    setEvents((data ?? []) as Schedule[]);
  }, []);

  useEffect(() => {
    loadEvents();
    const channel = supabase
      .channel('schedule-centre')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => loadEvents())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadEvents]);

  const todayEvents = useMemo(() => events.filter((event) => sameDay(eventDate(event), new Date())), [events]);
  const selectedEvents = useMemo(() => events.filter((event) => sameDay(eventDate(event), selectedDay)), [events, selectedDay]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.kicker}>SCHEDULE</Text>
        <Text style={styles.title}>日程中心</Text>
        <Text style={styles.subtitle}>拍攝、會議、deadline 同發布節奏</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.todayStrip}>
        {todayEvents.length > 0 ? todayEvents.map((item) => <TodayCard key={item.id} item={item} />) : (
          <Text style={styles.emptyToday}>今日無行程</Text>
        )}
      </ScrollView>

      <View style={styles.weekCard}>
        <View style={styles.weekRow}>
          {weekDays.map((day) => {
            const active = sameDay(day, selectedDay);
            const hasEvents = events.some((event) => sameDay(eventDate(event), day));
            return (
              <Pressable key={dayKey(day)} onPress={() => setSelectedDay(day)} style={[styles.dayCell, active && styles.dayCellActive]}>
                <Text style={[styles.weekday, active && styles.dayTextActive]}>{dayLabel(day)}</Text>
                <Text style={[styles.dayNumber, active && styles.dayTextActive]}>{monthDay(day)}</Text>
                <View style={[styles.dayDot, hasEvents && styles.dayDotActive, active && styles.dayDotActiveSelected]} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={selectedEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EventRow item={item} />}
        ListEmptyComponent={<EmptyState title="呢日無行程" body="可以留白，或者加一個新安排。" />}
        contentContainerStyle={selectedEvents.length ? styles.list : styles.emptyList}
      />

      <Pressable onPress={() => router.push('/schedule/create')} style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
        <Text style={styles.fabText}>＋ 新增日程</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 14
  },
  kicker: {
    color: colors.purple,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  title: {
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
  todayStrip: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
    minHeight: 92
  },
  todayCard: {
    width: 174,
    borderRadius: 14,
    borderLeftWidth: 4,
    backgroundColor: colors.bgCard,
    padding: 12,
    gap: 4,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 }
  },
  todayTime: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  todayTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 20
  },
  location: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  emptyToday: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    paddingTop: 22
  },
  weekCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    padding: 10
  },
  weekRow: {
    flexDirection: 'row',
    gap: 4
  },
  dayCell: {
    flex: 1,
    minHeight: 68,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  dayCellActive: {
    backgroundColor: colors.text
  },
  weekday: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 11
  },
  dayNumber: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  dayTextActive: {
    color: colors.bgCard
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'transparent'
  },
  dayDotActive: {
    backgroundColor: colors.accent
  },
  dayDotActiveSelected: {
    backgroundColor: colors.gold
  },
  list: {
    padding: 16,
    paddingBottom: 120,
    gap: 10
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 120
  },
  eventRow: {
    minHeight: 72,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  timePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  timePillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  eventBody: {
    flex: 1
  },
  eventTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  eventLocation: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2
  },
  typeBadge: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontFamily: fonts.bodyBold,
    fontSize: 11
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 96,
    minHeight: 52,
    borderRadius: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.purple,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
  },
  fabText: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  pressed: {
    opacity: 0.72
  }
});
