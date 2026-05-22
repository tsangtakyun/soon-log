import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  topic: string;
  privacy: 'private' | 'open';
  created_at: string;
  updated_at?: string | null;
  invite_code?: string | null;
  member_count?: number | null;
  last_clip_at?: string | null;
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
  return (
    <Pressable onPress={() => router.push(`/log/room/${room.id}`)} style={({ pressed }) => [styles.roomCard, pressed && styles.pressed]}>
      <View style={styles.roomHeader}>
        <Text style={styles.privacyBadge}>{room.privacy === 'open' ? '🌐 Open Studio' : '🔒 私密'}</Text>
      </View>
      <Text numberOfLines={1} style={styles.roomName}>{room.name}</Text>
      <Text numberOfLines={2} style={styles.roomTopic}>{room.topic}</Text>
      <View style={styles.roomMeta}>
        <Text style={styles.memberCount}>{room.member_count ?? 0} 位成員</Text>
        <Text style={styles.lastActivity}>{formatActivity(room.last_clip_at ?? room.updated_at ?? room.created_at)}</Text>
      </View>
    </Pressable>
  );
}

export default function StudioLogScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [todayLogs, setTodayLogs] = useState<Log[]>([]);
  const [rooms, setRooms] = useState<TopicRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRooms = useCallback(async () => {
    if (!user) return;
    const { data: memberships, error: membershipError } = await supabase
      .from('topic_room_members')
      .select('room_id')
      .eq('user_id', user.id);

    if (membershipError) {
      console.error('Room membership fetch error:', JSON.stringify(membershipError));
      setRooms([]);
      return;
    }

    const roomIds = [...new Set((memberships ?? []).map((row) => row.room_id).filter(Boolean))];
    if (roomIds.length === 0) {
      setRooms([]);
      return;
    }

    const [{ data: roomData, error: roomsError }, { data: members }, { data: clips }] = await Promise.all([
      supabase
        .from('topic_rooms')
        .select('*')
        .in('id', roomIds),
      supabase
        .from('topic_room_members')
        .select('room_id')
        .in('room_id', roomIds),
      supabase
        .from('topic_clips')
        .select('room_id, created_at')
        .in('room_id', roomIds)
    ]);

    if (roomsError) {
      console.error('Topic rooms fetch error:', JSON.stringify(roomsError));
      setRooms([]);
      return;
    }

    const roomRows = (roomData ?? []) as TopicRoom[];
    const memberCounts = new Map<string, number>();
    (members ?? []).forEach((member) => {
      memberCounts.set(member.room_id, (memberCounts.get(member.room_id) ?? 0) + 1);
    });
    const lastClips = new Map<string, string>();
    (clips ?? []).forEach((clip) => {
      const current = lastClips.get(clip.room_id);
      if (!current || new Date(clip.created_at).getTime() > new Date(current).getTime()) {
        lastClips.set(clip.room_id, clip.created_at);
      }
    });

    const enriched = roomRows
      .map((room) => ({
        ...room,
        member_count: memberCounts.get(room.id) ?? 0,
        last_clip_at: lastClips.get(room.id) ?? null
      }))
      .sort((a, b) => {
        const aTime = new Date(a.last_clip_at ?? a.created_at).getTime();
        const bTime = new Date(b.last_clip_at ?? b.created_at).getTime();
        return bTime - aTime;
      });

    setRooms(enriched);
  }, [user]);

  const loadData = useCallback(async () => {
    if (!user) return;
    const now = new Date();
    const { data: logs, error: logsError } = await supabase
      .from('logs')
      .select('*, profile:profiles!logs_user_id_fkey(*)')
      .eq('user_id', user.id)
      .gte('created_at', startOfDay(now).toISOString())
      .lte('created_at', endOfDay(now).toISOString())
      .order('created_at', { ascending: false });

    if (logsError) {
      console.error('Today logs fetch error:', JSON.stringify(logsError));
      setTodayLogs([]);
    } else {
      setTodayLogs((logs ?? []) as Log[]);
    }

    await loadRooms();
    setLoading(false);
  }, [loadRooms, user]);

  useEffect(() => {
    loadData();
    const roomsChannel = supabase
      .channel('studio-topic-rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_rooms' }, () => loadRooms())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_room_members' }, () => loadRooms())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_clips' }, () => loadRooms())
      .subscribe();

    return () => {
      supabase.removeChannel(roomsChannel);
    };
  }, [loadData, loadRooms]);

  const joinByInviteCode = () => {
    if (!user) return;
    Alert.prompt(
      '輸入邀請碼',
      '貼上隊友分享俾你嘅 Topic Room 邀請碼',
      async (value) => {
        const inviteCode = value.trim();
        if (!inviteCode) return;
        const { data: room, error: roomError } = await supabase
          .from('topic_rooms')
          .select('id')
          .eq('invite_code', inviteCode)
          .maybeSingle();

        if (roomError || !room) {
          Alert.alert('找不到房間', '請確認邀請碼是否正確');
          return;
        }

        const { error: joinError } = await supabase
          .from('topic_room_members')
          .upsert({ room_id: room.id, user_id: user.id, role: 'member' }, { onConflict: 'room_id,user_id' });

        if (joinError) {
          Alert.alert('加入失敗', joinError.message);
          return;
        }
        router.push(`/log/room/${room.id}`);
      },
      'plain-text'
    );
  };

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
            <Pressable onPress={() => router.push('/topic-room/create')} hitSlop={8}>
              <Text style={styles.addButton}>+ 新建</Text>
            </Pressable>
          </View>
          <Pressable onPress={joinByInviteCode} hitSlop={8} style={styles.inviteButton}>
            <Text style={styles.inviteButtonText}>輸入邀請碼</Text>
          </Pressable>

          {rooms.length === 0 ? (
            <View style={styles.emptyRooms}>
              <Text style={styles.emptyRoomsTitle}>你仲未有 Topic Room</Text>
              <Text style={styles.emptyRoomsBody}>建立一個同隊友一齊記錄創作過程</Text>
              <Pressable onPress={() => router.push('/topic-room/create')} style={({ pressed }) => [styles.createRoomButton, pressed && styles.pressed]}>
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
  inviteButton: {
    alignSelf: 'flex-end',
    marginRight: 16,
    marginTop: 8,
    minHeight: 28,
    justifyContent: 'center'
  },
  inviteButtonText: {
    color: colors.primary,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
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
    padding: 16,
    gap: 8
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10
  },
  roomName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  privacyBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.bgBodyCard,
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  roomTopic: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20
  },
  roomMeta: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
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
