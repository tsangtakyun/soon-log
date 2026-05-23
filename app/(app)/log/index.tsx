import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OnboardingBanner } from '@/components/OnboardingBanner';
import { TopicRoomCard, TopicRoomCardRoom } from '@/components/TopicRoomCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type ActiveTab = 'personal' | 'following' | 'explore';

type TopicClipRow = {
  id: string;
  video_url?: string | null;
  media_urls?: string[] | null;
  time_str?: string | null;
  date_str?: string | null;
  user_id: string;
  created_at?: string;
};

type TopicMemberRow = {
  user_id: string;
  profiles?: {
    username: string;
    avatar_url?: string | null;
    display_name?: string | null;
  } | null;
};

type TopicRoomRow = {
  id: string;
  name: string;
  topic: string;
  privacy: string;
  owner_id: string;
  created_at?: string;
  updated_at?: string | null;
  topic_room_members?: TopicMemberRow[] | null;
  topic_clips?: TopicClipRow[] | null;
};

const tabs: Array<{ key: ActiveTab; label: string }> = [
  { key: 'personal', label: '個人' },
  { key: 'following', label: '追蹤' },
  { key: 'explore', label: '探索' }
];

function normaliseRoom(row: TopicRoomRow): TopicRoomCardRoom {
  const clips = [...(row.topic_clips ?? [])].sort((a, b) => {
    return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  });
  const latest = clips[0];

  return {
    id: row.id,
    name: row.name,
    topic: row.topic,
    privacy: row.privacy,
    owner_id: row.owner_id,
    created_at: row.created_at,
    updated_at: latest?.created_at ?? row.updated_at ?? row.created_at ?? new Date().toISOString(),
    members: row.topic_room_members ?? [],
    member_count: row.topic_room_members?.length ?? 0,
    clip_count: clips.length,
    latest_clips: clips.slice(0, 3)
  };
}

function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <Feather name={icon} size={40} color="#d1d5db" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function StudioLogScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('explore');
  const [personalRooms, setPersonalRooms] = useState<TopicRoomCardRoom[]>([]);
  const [followingRooms, setFollowingRooms] = useState<TopicRoomCardRoom[]>([]);
  const [exploreRooms, setExploreRooms] = useState<TopicRoomCardRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRoomsByIds = useCallback(async (roomIds: string[]) => {
    const uniqueIds = [...new Set(roomIds.filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    const { data, error } = await supabase
      .from('topic_rooms')
      .select(`
        *,
        topic_room_members(
          user_id,
          profiles(username, avatar_url, display_name)
        ),
        topic_clips(
          id, video_url, media_urls, time_str, date_str,
          user_id, created_at
        )
      `)
      .in('id', uniqueIds);

    if (error) throw error;
    return ((data ?? []) as unknown as TopicRoomRow[])
      .map(normaliseRoom)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, []);

  const fetchPersonalRooms = useCallback(async () => {
    if (!user) {
      setPersonalRooms([]);
      return;
    }

    const { data: memberships, error } = await supabase
      .from('topic_room_members')
      .select('room_id')
      .eq('user_id', user.id);

    if (error) throw error;
    const roomIds = (memberships ?? []).map((membership) => membership.room_id);
    const rooms = await fetchRoomsByIds(roomIds);
    setPersonalRooms(rooms);
  }, [fetchRoomsByIds, user]);

  const fetchExploreRooms = useCallback(async () => {
    const { data, error } = await supabase
      .from('topic_rooms')
      .select(`
        *,
        topic_room_members(
          user_id,
          profiles(username, avatar_url, display_name)
        ),
        topic_clips(
          id, video_url, media_urls, time_str, date_str,
          user_id, created_at
        )
      `)
      .eq('privacy', 'open')
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    setExploreRooms(((data ?? []) as unknown as TopicRoomRow[]).map(normaliseRoom));
  }, []);

  const fetchFollowingRooms = useCallback(async () => {
    if (!user) {
      setFollowingRooms([]);
      return;
    }

    const { data: following, error: followingError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    if (followingError) throw followingError;
    const followingIds = (following ?? []).map((row) => row.following_id);
    if (followingIds.length === 0) {
      setFollowingRooms([]);
      return;
    }

    const { data, error } = await supabase
      .from('topic_rooms')
      .select(`
        *,
        topic_room_members(
          user_id,
          profiles(username, avatar_url, display_name)
        ),
        topic_clips(
          id, video_url, media_urls, time_str, date_str,
          user_id, created_at
        )
      `)
      .eq('privacy', 'open')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    const followingSet = new Set(followingIds);
    const rooms = ((data ?? []) as unknown as TopicRoomRow[])
      .filter((room) => followingSet.has(room.owner_id) || (room.topic_room_members ?? []).some((member) => followingSet.has(member.user_id)))
      .map(normaliseRoom)
      .slice(0, 20);

    setFollowingRooms(rooms);
  }, [user]);

  const loadAll = useCallback(async () => {
    if (!user) {
      setPersonalRooms([]);
      setFollowingRooms([]);
      await fetchExploreRooms();
      setLoading(false);
      return;
    }

    await Promise.all([
      fetchPersonalRooms(),
      fetchFollowingRooms(),
      fetchExploreRooms()
    ]);
    setLoading(false);
  }, [fetchExploreRooms, fetchFollowingRooms, fetchPersonalRooms, user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  useEffect(() => {
    loadAll().catch(() => setLoading(false));
    const channel = supabase
      .channel('eggs-topic-room-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_rooms' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_room_members' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_clips' }, () => loadAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAll]);

  const currentRooms = useMemo(() => {
    if (activeTab === 'personal') return personalRooms;
    if (activeTab === 'following') return followingRooms;
    return exploreRooms;
  }, [activeTab, exploreRooms, followingRooms, personalRooms]);

  const renderEmpty = () => {
    if (activeTab === 'personal') {
      return (
        <View>
          <OnboardingBanner
            userId={user?.id}
            onCreateRoom={() => router.push('/(app)/log/create-room')}
            onStartCamera={() => router.push('/(app)/log/camera')}
          />
          <EmptyState
            icon="video"
            title="你仲未有 Topic Room"
            body="建立一個製作項目，記錄由構思到完成嘅過程。"
            actionLabel="+ 新建 Topic Room"
            onAction={() => router.push('/(app)/log/create-room')}
          />
        </View>
      );
    }

    if (activeTab === 'following') {
      return (
        <EmptyState
          icon="users"
          title="仲未追蹤任何 creator"
          body="追蹤創作者之後，呢度會見到佢哋公開嘅製作過程。"
          actionLabel="去發掘 →"
          onAction={() => router.push('/(app)/home/discover')}
        />
      );
    }

    return (
      <EmptyState
        icon="compass"
        title="仲未有公開嘅製作中"
        body="成為第一個分享製作過程嘅 creator！"
        actionLabel="+ 新建 Topic Room"
        onAction={() => router.push('/(app)/log/create-room')}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.heroZone}>
        <View style={{ paddingTop: insets.top + 20 }}>
          <Text style={styles.heroTitle}>EGGS</Text>
          <Text style={styles.heroSubtitle}>創作者嘅製作過程</Text>
        </View>
        <TouchableOpacity
          style={[styles.cameraBtn, { top: insets.top + 20 }]}
          onPress={() => router.push('/(app)/log/camera')}
        >
          <Feather name="video" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabSwitcher}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={currentRooms}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 104 }]}
          ListHeaderComponent={activeTab === 'personal' && currentRooms.length > 0 ? (
            <Pressable onPress={() => router.push('/(app)/log/create-room')} style={({ pressed }) => [styles.createRoomTop, pressed && styles.pressed]}>
              <Feather name="plus" size={16} color={colors.primary} />
              <Text style={styles.createRoomTopText}>新建 Topic Room</Text>
            </Pressable>
          ) : null}
          ListEmptyComponent={renderEmpty}
          renderItem={({ item }) => (
            <TopicRoomCard
              room={item}
              onPress={() => router.push(`/(app)/log/room/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  heroZone: {
    position: 'relative',
    backgroundColor: colors.bgHero,
    paddingHorizontal: 20,
    paddingBottom: 24
  },
  heroTitle: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 32,
    fontWeight: '800'
  },
  heroSubtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: fonts.body,
    fontSize: 13
  },
  cameraBtn: {
    position: 'absolute',
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabSwitcher: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: colors.bgBody
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary
  },
  tabText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15
  },
  tabTextActive: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontWeight: '600'
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  listContent: {
    paddingTop: 14
  },
  createRoomTop: {
    alignSelf: 'flex-end',
    marginRight: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bgBodyCard
  },
  createRoomTopText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  emptyState: {
    marginHorizontal: 16,
    marginTop: 28,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyCard,
    alignItems: 'center'
  },
  emptyTitle: {
    marginTop: 12,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    textAlign: 'center'
  },
  emptyBody: {
    marginTop: 6,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  emptyAction: {
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  emptyActionText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  pressed: {
    opacity: 0.72
  }
});
