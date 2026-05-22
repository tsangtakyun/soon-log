import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ClipPlayer from '@/components/ClipPlayer';
import { MenuDrawer } from '@/components/MenuDrawer';
import { LogCard } from '@/components/LogCard';
import { RegionFilter } from '@/components/RegionFilter';
import { SavedSheet } from '@/components/SavedSheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Log, WorkItem } from '@/types';

type ContentTab = 'Following' | 'Trends' | 'All' | 'IG';
type TrendAngle = { emoji: string; name: string; percentage: number };
type Trend = {
  id: string;
  topic: string;
  icon: string | null;
  heat_score: number | null;
  angles: TrendAngle[];
};
type OpenStudio = {
  id: string;
  name: string;
  topic: string;
  created_at: string;
  member_count: number;
  clip_count: number;
  last_clip_at: string | null;
  latest_clip: {
    id: string;
    video_url: string | null;
    media_urls: string[];
    caption: string | null;
    time_str: string | null;
    date_str: string | null;
    caption_align: 'left' | 'center' | 'right' | null;
    text_size: 'small' | 'medium' | 'large' | null;
    background_color: 'cream' | 'black' | null;
  } | null;
};
type HomeProfile = {
  avatar_url: string | null;
  username: string | null;
  display_name: string | null;
};
type StarProps = {
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
};

const starColors = ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#a855f7', '#ffffff'];
const tabs: ContentTab[] = ['Following', 'Trends', 'All', 'IG'];
const tabLabels: Record<ContentTab, string> = {
  Following: '追蹤',
  Trends: '熱話',
  All: '全部',
  IG: 'IG'
};

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat('zh-HK', { month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function AnimatedStar({ x, y, size, color, delay }: StarProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000 + Math.random() * 1000,
          delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.2,
          duration: 1000 + Math.random() * 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -3,
          duration: 2000 + Math.random() * 2000,
          delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 3,
          duration: 2000 + Math.random() * 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }],
      }}
    />
  );
}

function StarNoise({ heroHeight, screenWidth }: { heroHeight: number; screenWidth: number }) {
  const stars = useMemo(() => Array.from({ length: 25 }, (_, index) => ({
    id: index,
    x: Math.random() * screenWidth,
    y: Math.random() * heroHeight,
    size: 2 + Math.random() * 2,
    color: starColors[Math.floor(Math.random() * starColors.length)],
    delay: Math.random() * 2000,
  })), [heroHeight, screenWidth]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map(({ id, ...star }) => <AnimatedStar key={id} {...star} />)}
    </View>
  );
}

function EmptySocialState({ buttonLabel }: { buttonLabel: string }) {
  return (
    <View style={styles.emptySocial}>
      <Text style={styles.emptyEmoji}>📊</Text>
      <Text style={styles.emptyTitle}>Connect to see your data.</Text>
      <Text style={styles.emptyBody}>See your followers, views, and which content is working.</Text>
      <Pressable
        onPress={() => Alert.alert('Coming soon — social platform connections')}
        style={({ pressed }) => [styles.blackPill, pressed && styles.pressed]}
      >
        <Text style={styles.blackPillText}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

async function enrichLogs(logs: Log[], userId?: string | null): Promise<Log[]> {
  const ids = logs.map((log) => log.id);
  if (ids.length === 0) return logs;

  const [{ data: likes }, { data: comments }, liked] = await Promise.all([
    supabase.from('likes').select('log_id').in('log_id', ids),
    supabase.from('comments').select('log_id').in('log_id', ids),
    userId
      ? supabase.from('likes').select('log_id').eq('user_id', userId).in('log_id', ids)
      : Promise.resolve({ data: [] as { log_id: string }[] })
  ]);

  return logs.map((log) => ({
    ...log,
    like_count: likes?.filter((row) => row.log_id === log.id).length ?? 0,
    comment_count: comments?.filter((row) => row.log_id === log.id).length ?? 0,
    liked_by_me: liked.data?.some((row) => row.log_id === log.id) ?? false
  }));
}

function FeedList({
  logs,
  loading,
  empty
}: {
  logs: Log[];
  loading: boolean;
  empty: ReactNode;
}) {
  if (loading) {
    return (
      <View style={styles.feedLoading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (logs.length === 0) return <>{empty}</>;

  return (
    <View style={styles.feedWrap}>
      {logs.map((log) => <LogCard key={log.id} log={log} />)}
    </View>
  );
}

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
        {angles.slice(0, 3).map((angle) => (
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
      {angles.length > 3 ? <Text style={styles.expandText}>⋯ 展開</Text> : null}
    </Pressable>
  );
}

function BlackBoxSection({ studios }: { studios: OpenStudio[] }) {
  if (studios.length === 0) return null;

  return (
    <View style={styles.openStudiosSection}>
      <Text style={styles.openStudiosTitle}>⬛ Black Box 黑盒</Text>
      <Text style={styles.openStudiosSubtitle}>紀錄製作嘅黑盒子</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.openStudiosStrip}>
        {studios.map((studio) => (
          <Pressable
            key={studio.id}
            onPress={() => router.push(`/log/room/${studio.id}`)}
            style={({ pressed }) => [
              studio.latest_clip?.video_url ? styles.blackBoxVideoCard : styles.openStudioCard,
              pressed && styles.pressed
            ]}
          >
            {studio.latest_clip?.video_url ? (
              <>
                <View style={styles.blackBoxPlayer}>
                  <ClipPlayer clip={studio.latest_clip} width={200} height={140} thumbnail />
                </View>
                <View style={styles.blackBoxInfo}>
                  <Text numberOfLines={1} style={styles.blackBoxName}>{studio.name}</Text>
                  <Text numberOfLines={1} style={styles.blackBoxMeta}>{studio.member_count} 位成員 · {studio.clip_count} clips</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.openStudioBadge}>⬛</Text>
                <View style={styles.openStudioText}>
                  <Text numberOfLines={2} style={styles.openStudioName}>{studio.name}</Text>
                  <Text numberOfLines={1} style={styles.openStudioTopic}>{studio.topic}</Text>
                  <Text numberOfLines={1} style={styles.openStudioMeta}>
                    {studio.member_count} 位成員 · {studio.clip_count} clips
                  </Text>
                </View>
              </>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile: authProfile } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [homeProfile, setHomeProfile] = useState<HomeProfile | null>(null);
  const [activeTab, setActiveTab] = useState<ContentTab>('Following');
  const [task, setTask] = useState<WorkItem | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [openStudios, setOpenStudios] = useState<OpenStudio[]>([]);
  const [followingLogs, setFollowingLogs] = useState<Log[]>([]);
  const [allLogs, setAllLogs] = useState<Log[]>([]);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [followingCount, setFollowingCount] = useState(0);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [credits, setCredits] = useState(30);
  const screenWidth = Dimensions.get('window').width;
  const heroHeight = Math.round(Dimensions.get('window').height * 0.36);
  const displayUsername = homeProfile?.username || authProfile?.username ? `@${homeProfile?.username || authProfile?.username}` : '@soon';
  const avatar = homeProfile?.avatar_url;
  const initial = (homeProfile?.username || authProfile?.username || user?.email || 'S').slice(0, 1).toUpperCase();

  const loadNudge = useCallback(async () => {
    if (!user) return;
    const [{ data: taskData }, { data: creditData }, { data: profileData }] = await Promise.all([
      supabase
        .from('work_items')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'done')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('user_credits')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('avatar_url, username, display_name')
        .eq('id', user.id)
        .maybeSingle()
    ]);
    setTask((taskData ?? null) as WorkItem | null);
    if (creditData?.balance !== undefined) setCredits(creditData.balance as number);
    if (profileData) setHomeProfile(profileData as HomeProfile);
  }, [user]);

  const loadTrends = useCallback(async () => {
    setLoadingTrends(true);
    const { data, error } = await supabase
      .from('trends')
      .select('*')
      .eq('is_active', true)
      .order('heat_score', { ascending: false });

    if (error) {
      setTrends([]);
    } else {
      setTrends((data ?? []) as Trend[]);
    }
    setLoadingTrends(false);
  }, []);

  const loadFollowingFeed = useCallback(async () => {
    if (!user) return;
    setLoadingFollowing(true);

    const { data: follows, error: followsError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    if (followsError) {
      setFollowingLogs([]);
      setFollowingCount(0);
      setLoadingFollowing(false);
      return;
    }

    const followedIds = [...new Set((follows ?? []).map((follow) => follow.following_id).filter(Boolean))];
    setFollowingCount(followedIds.length);

    if (followedIds.length === 0) {
      setFollowingLogs([]);
      setLoadingFollowing(false);
      return;
    }

    const { data, error } = await supabase
      .from('logs')
      .select('*, profile:profiles!logs_user_id_fkey(*)')
      .in('user_id', followedIds)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      setFollowingLogs([]);
    } else {
      setFollowingLogs(await enrichLogs((data ?? []) as Log[], user.id));
    }
    setLoadingFollowing(false);
  }, [user]);

  const loadAllFeed = useCallback(async () => {
    setLoadingAll(true);
    const { data, error } = await supabase
      .from('logs')
      .select('*, profile:profiles!logs_user_id_fkey(*)')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      setAllLogs([]);
    } else {
      const logs = ((data ?? []) as Log[]).filter((log) =>
        regionFilter ? log.profile?.region === regionFilter : true
      );
      setAllLogs(await enrichLogs(logs, user?.id));
    }
    setLoadingAll(false);
  }, [regionFilter, user?.id]);

  const loadOpenStudios = useCallback(async () => {
    const { data: rooms, error: roomsError } = await supabase
      .from('topic_rooms')
      .select('*')
      .eq('privacy', 'open');

    if (roomsError) {
      setOpenStudios([]);
      return;
    }

    const roomRows = rooms ?? [];
    const roomIds = roomRows.map((room) => room.id);
    if (roomIds.length === 0) {
      setOpenStudios([]);
      return;
    }

    const [{ data: members }, { data: clips }] = await Promise.all([
      supabase.from('topic_room_members').select('room_id, user_id').in('room_id', roomIds),
      supabase
        .from('topic_clips')
        .select('id, room_id, created_at, video_url, media_urls, caption, time_str, date_str, caption_align, text_size, background_color')
        .in('room_id', roomIds)
    ]);

    const memberSets = new Map<string, Set<string>>();
    (members ?? []).forEach((member) => {
      const set = memberSets.get(member.room_id) ?? new Set<string>();
      set.add(member.user_id);
      memberSets.set(member.room_id, set);
    });

    const clipCounts = new Map<string, number>();
    const lastClips = new Map<string, string>();
    const latestClips = new Map<string, OpenStudio['latest_clip']>();
    (clips ?? []).forEach((clip) => {
      clipCounts.set(clip.room_id, (clipCounts.get(clip.room_id) ?? 0) + 1);
      const current = lastClips.get(clip.room_id);
      if (!current || new Date(clip.created_at).getTime() > new Date(current).getTime()) {
        lastClips.set(clip.room_id, clip.created_at);
        latestClips.set(clip.room_id, {
          id: clip.id,
          video_url: clip.video_url ?? null,
          media_urls: Array.isArray(clip.media_urls) ? clip.media_urls : [],
          caption: clip.caption ?? null,
          time_str: clip.time_str ?? null,
          date_str: clip.date_str ?? null,
          caption_align: clip.caption_align ?? null,
          text_size: clip.text_size ?? null,
          background_color: clip.background_color ?? null,
        });
      }
    });

    const studios = roomRows
      .map((room) => ({
        id: room.id,
        name: room.name,
        topic: room.topic,
        created_at: room.created_at,
        member_count: memberSets.get(room.id)?.size ?? 0,
        clip_count: clipCounts.get(room.id) ?? 0,
        last_clip_at: lastClips.get(room.id) ?? null,
        latest_clip: latestClips.get(room.id) ?? null
      }))
      .sort((a, b) => {
        const aTime = a.last_clip_at ? new Date(a.last_clip_at).getTime() : -1;
        const bTime = b.last_clip_at ? new Date(b.last_clip_at).getTime() : -1;
        if (aTime !== bTime) return bTime - aTime;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 5);

    setOpenStudios(studios);
  }, []);

  useEffect(() => {
    loadNudge();
    loadTrends();
    loadAllFeed();
  }, [loadAllFeed, loadNudge, loadTrends]);

  useFocusEffect(
    useCallback(() => {
      loadFollowingFeed();
    }, [loadFollowingFeed])
  );

  useFocusEffect(
    useCallback(() => {
      loadOpenStudios();
    }, [loadOpenStudios])
  );

  const nudgeMessage = task
    ? `今日要完成：${task.title}${task.due_date ? `，截止 ${formatDueDate(task.due_date)}` : ''}`
    : '你今日想記錄咩？撳低開始拍片 🎬';

  return (
    <View style={styles.screen}>
      <View style={[styles.hero, { height: heroHeight, paddingTop: insets.top + 14 }]}>
        <StarNoise heroHeight={heroHeight} screenWidth={screenWidth} />
        <View style={styles.topBar}>
          <Pressable onPress={() => setDrawerOpen(true)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
            <Feather name="menu" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.topActions}>
            <Pressable onPress={() => Alert.alert('AI Credits', `你今日仲有 ${credits} credits`)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Feather name="circle" size={20} color={colors.text} />
              <Text style={styles.creditTiny}>{credits}</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(app)/home/referrals')} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Feather name="gift" size={20} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => setSavedOpen(true)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Feather name="bookmark" size={20} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <View style={styles.profileZone}>
          <Pressable onPress={() => router.push('/profile')} style={({ pressed }) => [styles.homeProfileButton, pressed && styles.pressed]}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.heroAvatar} />
            ) : (
              <View style={styles.heroAvatarFallback}>
                <Text style={styles.heroAvatarInitial}>{initial}</Text>
              </View>
            )}
            <Text style={styles.username}>{displayUsername}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/log')} style={({ pressed }) => pressed && styles.pressed}>
            <View style={styles.eggButton}>
              <Text style={styles.eggIcon}>🥚</Text>
              <Text style={styles.eggText}>STUDIO</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <View style={styles.nudgeCard}>
          <Text style={styles.nudgeText}>{nudgeMessage}</Text>
          <Pressable onPress={() => router.push(task ? '/work' : '/log')} style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]}>
            <Text style={styles.arrowText}>→</Text>
          </Pressable>
        </View>

        <BlackBoxSection studios={openStudios} />

        <Text style={styles.sectionTitle}>Predikt</Text>
        <Text style={styles.sectionSubtitle}>創作者社群熱話</Text>
        <View style={styles.contentTabs}>
          {tabs.map((tab) => (
            <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.contentTab, activeTab === tab && styles.activeContentTab]}>
              <Text style={[styles.contentTabText, activeTab === tab && styles.activeContentTabText]}>{tabLabels[tab]}</Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'Following' ? (
          <FeedList
            logs={followingLogs}
            loading={loadingFollowing}
            empty={followingCount === 0 ? (
              <View style={styles.emptySocial}>
                <Text style={styles.emptyEmoji}>👥</Text>
                <Text style={styles.emptyTitle}>仲未追蹤任何創作者</Text>
                <Text style={styles.emptyBody}>去發掘創作者，追蹤佢哋睇最新動態</Text>
                <Pressable
                  onPress={() => router.push('/(app)/home/discover')}
                  style={({ pressed }) => [styles.primaryPill, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryPillText}>去發掘</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.noTrends}>暫時未有新動態</Text>
            )}
          />
        ) : null}
        {activeTab === 'All' ? (
          <View>
            <View style={styles.regionFilterWrap}>
              <RegionFilter selected={regionFilter} onChange={setRegionFilter} />
            </View>
            <FeedList
              logs={allLogs}
              loading={loadingAll}
              empty={<Text style={styles.noTrends}>暫時未有公開紀錄</Text>}
            />
          </View>
        ) : null}
        {activeTab === 'IG' ? <EmptySocialState buttonLabel="Connect Instagram" /> : null}
        {activeTab === 'Trends' ? (
          <View style={styles.trendsWrap}>
            {loadingTrends ? <ActivityIndicator color={colors.primary} /> : null}
            {!loadingTrends && trends.length === 0 ? <Text style={styles.noTrends}>暫時未有趨勢話題</Text> : null}
            {trends.map((trend) => <TrendCard key={trend.id} trend={trend} />)}
          </View>
        ) : null}
      </ScrollView>

      <MenuDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <SavedSheet visible={savedOpen} onClose={() => setSavedOpen(false)} />
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
    overflow: 'hidden'
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1
  },
  topActions: {
    flexDirection: 'row',
    gap: 10
  },
  squareButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  creditTiny: {
    position: 'absolute',
    right: 6,
    bottom: 5,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 10
  },
  profileZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 12,
    zIndex: 1
  },
  homeProfileButton: {
    alignItems: 'center'
  },
  heroAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.textOnDark,
    backgroundColor: colors.bgHeroSurface
  },
  heroAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.textOnDark,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroAvatarInitial: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 24
  },
  username: {
    marginTop: 9,
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    textAlign: 'center'
  },
  eggButton: {
    marginTop: 12,
    width: 80,
    height: 96,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 35,
    borderBottomRightRadius: 35,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5
  },
  eggIcon: {
    fontSize: 28
  },
  eggText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 2
  },
  body: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  bodyContent: {
    paddingBottom: 110
  },
  nudgeCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  nudgeText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  arrowButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  arrowText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 22
  },
  openStudiosSection: {
    marginTop: 22
  },
  openStudiosTitle: {
    marginHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  openStudiosSubtitle: {
    marginTop: 4,
    marginHorizontal: 16,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  openStudiosStrip: {
    paddingLeft: 16,
    paddingRight: 4,
    paddingTop: 12
  },
  openStudioCard: {
    width: 200,
    height: 140,
    marginRight: 12,
    borderRadius: 16,
    backgroundColor: colors.bgHero,
    padding: 16
  },
  blackBoxVideoCard: {
    width: 200,
    height: 196,
    marginRight: 12,
    borderRadius: 16,
    backgroundColor: colors.bgHero,
    overflow: 'hidden'
  },
  blackBoxPlayer: {
    width: 200,
    height: 140,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.bgHero
  },
  blackBoxInfo: {
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  blackBoxName: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  blackBoxMeta: {
    marginTop: 4,
    color: colors.textOnDarkMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  openStudioBadge: {
    alignSelf: 'flex-end',
    fontSize: 12
  },
  openStudioText: {
    marginTop: 'auto'
  },
  openStudioName: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    lineHeight: 20
  },
  openStudioTopic: {
    marginTop: 5,
    color: colors.textOnDarkMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  openStudioMeta: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: fonts.body,
    fontSize: 12
  },
  sectionTitle: {
    marginTop: 24,
    marginHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 28
  },
  sectionSubtitle: {
    marginTop: 4,
    marginHorizontal: 16,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  contentTabs: {
    marginTop: 14,
    marginHorizontal: 16,
    flexDirection: 'row',
    gap: 22
  },
  contentTab: {
    paddingBottom: 8,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent'
  },
  activeContentTab: {
    borderBottomColor: colors.primary
  },
  contentTabText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15
  },
  activeContentTabText: {
    color: colors.text,
    fontFamily: fonts.bodyBold
  },
  emptySocial: {
    minHeight: 250,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28
  },
  emptyEmoji: {
    fontSize: 40
  },
  emptyTitle: {
    marginTop: 14,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    textAlign: 'center'
  },
  emptyBody: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  blackPill: {
    marginTop: 18,
    borderRadius: 999,
    backgroundColor: colors.bgHero,
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  blackPillText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  primaryPill: {
    marginTop: 18,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12
  },
  primaryPillText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  feedLoading: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center'
  },
  feedWrap: {
    paddingTop: 8
  },
  regionFilterWrap: {
    marginTop: 12,
    paddingHorizontal: 16
  },
  trendsWrap: {
    paddingHorizontal: 16,
    paddingTop: 16
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
  expandText: {
    marginTop: 12,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  noTrends: {
    marginTop: 60,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center'
  },
  pressed: {
    opacity: 0.72
  }
});
