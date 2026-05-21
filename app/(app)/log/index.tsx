import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogCard } from '@/components/LogCard';
import { useAuth } from '@/hooks/useAuth';
import { endOfDay, startOfDay } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Log } from '@/types';

type TopicRoom = {
  id: string;
  name: string;
  is_private?: boolean | null;
  member_count?: number | null;
  last_activity_at?: string | null;
  members?: { avatar_url?: string | null; username?: string | null }[] | null;
};

function formatActivity(value?: string | null) {
  if (!value) return '未有活動';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 日前`;
}

function EmptyTodayLog() {
  return (
    <Pressable onPress={() => router.push('/create')} style={({ pressed }) => [styles.emptyLogCard, pressed && styles.pressed]}>
      <Text style={styles.emptyLogText}>🎬 記錄今日創作</Text>
    </Pressable>
  );
}

function RoomCard({ room }: { room: TopicRoom }) {
  const members = room.members ?? [];
  return (
    <Pressable onPress={() => router.push(`/log/room/${room.id}`)} style={({ pressed }) => [styles.roomCard, pressed && styles.pressed]}>
      <View style={styles.roomHeader}>
        <Text numberOfLines={1} style={styles.roomName}>{room.name}</Text>
        <Text style={styles.privacyBadge}>{room.is_private ? '🔒 私密' : '🌐 Open Studio'}</Text>
      </View>
      <View style={styles.memberLine}>
        <View style={styles.memberAvatars}>
          {members.slice(0, 4).map((member, index) => member.avatar_url ? (
            <Image key={`${member.avatar_url}-${index}`} source={{ uri: member.avatar_url }} style={[styles.memberAvatar, { marginLeft: index === 0 ? 0 : -10 }]} />
          ) : (
            <View key={`${member.username}-${index}`} style={[styles.memberAvatarFallback, { marginLeft: index === 0 ? 0 : -10 }]}>
              <Text style={styles.memberInitial}>{(member.username || 'S').slice(0, 1).toUpperCase()}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.memberCount}>{room.member_count ?? members.length} members</Text>
      </View>
      <Text style={styles.lastActivity}>{formatActivity(room.last_activity_at)}</Text>
    </Pressable>
  );
}

export default function StudioLogScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [todayLogs, setTodayLogs] = useState<Log[]>([]);
  const [rooms, setRooms] = useState<TopicRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    const now = new Date();
    const [{ data: logs, error: logsError }, { data: roomData, error: roomsError }] = await Promise.all([
      supabase
        .from('logs')
        .select('*, profile:profiles!logs_user_id_fkey(*)')
        .eq('user_id', user.id)
        .gte('created_at', startOfDay(now).toISOString())
        .lte('created_at', endOfDay(now).toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('topic_rooms')
        .select('*')
        .order('last_activity_at', { ascending: false })
    ]);

    if (logsError) {
      console.error('Today logs fetch error:', JSON.stringify(logsError));
      setTodayLogs([]);
    } else {
      setTodayLogs((logs ?? []) as Log[]);
    }

    if (roomsError) {
      setRooms([]);
    } else {
      setRooms((roomData ?? []) as TopicRoom[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <View style={styles.screen}>
      <View style={[styles.hero, { paddingTop: insets.top + 22 }]}>
        <Text style={styles.heroTitle}>⌛ Studio</Text>
        <Text style={styles.heroSubtitle}>你嘅創作空間</Text>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 118 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>今日 Log</Text>
            <Pressable onPress={() => router.push('/create')} hitSlop={8}>
              <Text style={styles.addButton}>+ 新增</Text>
            </Pressable>
          </View>

          {todayLogs.length === 0 ? (
            <EmptyTodayLog />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.todayStrip}>
              {todayLogs.map((log) => (
                <View key={log.id} style={styles.logCardWrap}>
                  <LogCard log={log} />
                </View>
              ))}
            </ScrollView>
          )}

          <View style={[styles.sectionHeader, styles.roomsHeader]}>
            <Text style={styles.sectionTitle}>Topic Rooms</Text>
            <Pressable onPress={() => undefined} hitSlop={8}>
              <Text style={styles.addButton}>+ 新建</Text>
            </Pressable>
          </View>

          {rooms.length === 0 ? (
            <View style={styles.emptyRooms}>
              <Text style={styles.emptyRoomsTitle}>你仲未有 Topic Room</Text>
              <Text style={styles.emptyRoomsBody}>建立一個同隊友一齊記錄創作過程</Text>
              <Pressable onPress={() => undefined} style={({ pressed }) => [styles.createRoomButton, pressed && styles.pressed]}>
                <Text style={styles.createRoomText}>+ 建立 Topic Room</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.roomList}>
              {rooms.map((room) => <RoomCard key={room.id} room={room} />)}
            </View>
          )}
        </ScrollView>
      )}

      <Pressable onPress={() => router.push('/create')} style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 94 }, pressed && styles.pressed]}>
        <Text style={styles.fabText}>🎬</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  hero: {
    backgroundColor: colors.bgHero,
    paddingHorizontal: 16,
    paddingBottom: 28
  },
  heroTitle: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 28
  },
  heroSubtitle: {
    marginTop: 6,
    color: colors.textOnDarkMuted,
    fontFamily: fonts.body,
    fontSize: 14
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  body: {
    flex: 1
  },
  bodyContent: {
    paddingTop: 20
  },
  sectionHeader: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  addButton: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  emptyLogCard: {
    marginHorizontal: 16,
    marginTop: 12,
    minHeight: 126,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.bodyBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgBodyCard
  },
  emptyLogText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  todayStrip: {
    paddingVertical: 8,
    paddingRight: 16
  },
  logCardWrap: {
    width: 280
  },
  roomsHeader: {
    marginTop: 26
  },
  emptyRooms: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: colors.bgBodyMuted,
    padding: 22,
    alignItems: 'center'
  },
  emptyRoomsTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  emptyRoomsBody: {
    marginTop: 6,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center'
  },
  createRoomButton: {
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  createRoomText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  roomList: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12
  },
  roomCard: {
    borderRadius: 16,
    backgroundColor: colors.bgBodyMuted,
    padding: 16
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  roomName: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  privacyBadge: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  memberLine: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  memberAvatars: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.bgBodyMuted,
    backgroundColor: colors.bodyBorder
  },
  memberAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.bgBodyMuted,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  memberInitial: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 11
  },
  memberCount: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  lastActivity: {
    marginTop: 10,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  fab: {
    position: 'absolute',
    right: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
  },
  fabText: {
    color: colors.textOnDark,
    fontSize: 24
  },
  pressed: {
    opacity: 0.72
  }
});
