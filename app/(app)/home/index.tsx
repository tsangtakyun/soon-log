import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { SavedSheet } from '@/components/SavedSheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { WorkItem } from '@/types';

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

const nudgeMessages = [
  '今日想記錄咩？撳 EGGS 開始拍片 🎬',
  '有新題材？去 Ideas 儲低靈感 💡',
  '睇下其他 creator 嘅熱話 👀',
  '今日無任務，係時候創作！✨',
];

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
  const stars = useMemo(() => Array.from({ length: 50 }, (_, index) => ({
    id: index,
    x: Math.random() * screenWidth,
    y: Math.random() * heroHeight,
    size: 1 + Math.random() * 3,
    color: `rgba(255,255,255,${0.3 + Math.random() * 0.7})`,
    delay: Math.random() * 2000,
  })), [heroHeight, screenWidth]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map(({ id, ...star }) => <AnimatedStar key={id} {...star} />)}
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
      <View style={styles.sectionBannerCard}>
        <Image source={require('../../../assets/home-black-box-banner.png')} style={styles.sectionBannerImage} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.openStudiosStrip}>
        {studios.map((studio) => (
          <Pressable
            key={studio.id}
            onPress={() => router.push(`/(app)/log/room/${studio.id}`)}
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

function getTaskUrgency(task: WorkItem | null) {
  if (!task?.due_date) return null;
  const dueDate = new Date(`${task.due_date}T23:59:59`);
  const hoursLeft = Math.floor((dueDate.getTime() - Date.now()) / 3600000);
  const daysLeft = Math.max(1, Math.ceil(hoursLeft / 24));

  if (hoursLeft < 3) {
    return {
      hoursLeft,
      badge: `⏰ ${Math.max(0, hoursLeft)}小時後截止`,
      badgeStyle: styles.deadlineBadgeUrgent,
      badgeTextStyle: styles.deadlineBadgeTextUrgent,
      cardStyle: styles.nudgeCardUrgent,
    };
  }

  if (hoursLeft < 24) {
    return {
      hoursLeft,
      badge: '⏰ 今日截止',
      badgeStyle: styles.deadlineBadgeToday,
      badgeTextStyle: styles.deadlineBadgeTextToday,
      cardStyle: styles.nudgeCardNormal,
    };
  }

  return {
    hoursLeft,
    badge: `📅 ${daysLeft}日後截止`,
    badgeStyle: styles.deadlineBadgeLater,
    badgeTextStyle: styles.deadlineBadgeTextLater,
    cardStyle: styles.nudgeCardNormal,
  };
}

function NudgeCard({ task }: { task: WorkItem | null }) {
  const urgency = getTaskUrgency(task);
  const fallbackMessage = useMemo(() => nudgeMessages[Math.floor(Math.random() * nudgeMessages.length)], []);

  if (task?.due_date && urgency) {
    return (
      <View style={[styles.nudgeCard, urgency.cardStyle]}>
        <View style={styles.nudgeTopRow}>
          <View style={[styles.deadlineBadge, urgency.badgeStyle]}>
            <Text style={[styles.deadlineBadgeText, urgency.badgeTextStyle]}>{urgency.badge}</Text>
          </View>
          <Pressable onPress={() => router.push('/(app)/work')} style={({ pressed }) => [styles.nudgeArrowCircle, pressed && styles.pressed]}>
            <Text style={styles.nudgeArrowText}>→</Text>
          </Pressable>
        </View>
        <Text style={styles.nudgeTaskTitle}>{task.title}</Text>
        <Text style={styles.nudgeHint}>撳入睇詳情 →</Text>
      </View>
    );
  }

  if (task) {
    return (
      <View style={[styles.nudgeCard, styles.nudgeCardNormal, styles.nudgeSimpleCard]}>
        <Text style={styles.nudgeSimpleText}>📋 今日待辦：{task.title}</Text>
        <Pressable onPress={() => router.push('/(app)/work')} style={({ pressed }) => [styles.nudgeArrowCircle, pressed && styles.pressed]}>
          <Text style={styles.nudgeArrowText}>→</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.nudgeCard, styles.nudgeCardMotivational, styles.nudgeSimpleCard]}>
      <Text style={styles.nudgeMotivationText}>{fallbackMessage}</Text>
      <Pressable onPress={() => router.push('/(app)/log')} style={({ pressed }) => [styles.nudgeArrowCircle, pressed && styles.pressed]}>
        <Text style={styles.nudgeArrowText}>→</Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile: authProfile } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [homeProfile, setHomeProfile] = useState<HomeProfile | null>(null);
  const [task, setTask] = useState<WorkItem | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [openStudios, setOpenStudios] = useState<OpenStudio[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [credits, setCredits] = useState(30);
  const screenWidth = Dimensions.get('window').width;
  const heroHeight = Math.round(Dimensions.get('window').height * 0.36);
  const eggRotation = useRef(new Animated.Value(0)).current;
  const eggRotate = eggRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
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
  }, [loadNudge, loadTrends]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(eggRotation, {
          toValue: 1,
          duration: 8000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(eggRotation, {
          toValue: 0,
          duration: 0,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [eggRotation]);

  useFocusEffect(
    useCallback(() => {
      loadOpenStudios();
    }, [loadOpenStudios])
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.hero, { height: heroHeight }]}>
        <StarNoise heroHeight={heroHeight} screenWidth={screenWidth} />
        <View style={[styles.topBar, { top: insets.top + 14 }]}>
          <View style={styles.topActions}>
            <Pressable onPress={() => setDrawerOpen(true)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Feather name="menu" size={20} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => Alert.alert('AI Credits', `你今日仲有 ${credits} credits`)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Feather name="circle" size={20} color={colors.text} />
              <Text style={styles.creditTiny}>{credits}</Text>
            </Pressable>
          </View>
          <View style={styles.topActions}>
            <Pressable onPress={() => router.push('/(app)/home/referrals')} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Feather name="gift" size={20} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => setSavedOpen(true)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Feather name="bookmark" size={20} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <View style={styles.profileZone}>
          <Pressable onPress={() => router.push('/(app)/profile')} style={({ pressed }) => [styles.homeProfileButton, pressed && styles.pressed]}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.heroAvatar} />
            ) : (
              <View style={styles.heroAvatarFallback}>
                <Text style={styles.heroAvatarInitial}>{initial}</Text>
              </View>
            )}
            <Text style={styles.username}>{displayUsername}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/log')} style={({ pressed }) => pressed && styles.pressed}>
            <View style={styles.eggImageButton}>
              <Animated.Image
                source={require('../../../assets/soon-egg.png')}
                style={[styles.eggImage, { transform: [{ rotate: eggRotate }] }]}
              />
            </View>
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <NudgeCard task={task} />

        <BlackBoxSection studios={openStudios} />

        <View style={styles.prediktSection}>
          <View style={styles.sectionBannerCard}>
            <Image source={require('../../../assets/home-predikt-banner.png')} style={styles.sectionBannerImage} />
          </View>
          <View style={styles.trendsWrap}>
            {loadingTrends ? <ActivityIndicator color={colors.primary} /> : null}
            {!loadingTrends && trends.length === 0 ? (
              <View style={styles.emptyTrends}>
                <Text style={styles.emptyText}>暫時未有熱話</Text>
              </View>
            ) : null}
            {trends.map((trend) => <TrendCard key={trend.id} trend={trend} />)}
          </View>
        </View>
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
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2
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
    marginTop: 60,
    paddingBottom: 8,
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
    fontSize: 11,
    textAlign: 'center'
  },
  eggImageButton: {
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  eggImage: {
    width: 80,
    height: 80,
    resizeMode: 'contain'
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
    borderRadius: 16,
    padding: 16
  },
  nudgeCardUrgent: {
    borderColor: '#E8614A',
    backgroundColor: '#FFF0EE'
  },
  nudgeCardNormal: {
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyCard
  },
  nudgeCardMotivational: {
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted
  },
  nudgeSimpleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  nudgeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  deadlineBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  deadlineBadgeUrgent: {
    backgroundColor: '#E8614A'
  },
  deadlineBadgeToday: {
    backgroundColor: '#FFF0EE'
  },
  deadlineBadgeLater: {
    backgroundColor: colors.bgBodyMuted
  },
  deadlineBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  deadlineBadgeTextUrgent: {
    color: colors.textOnDark
  },
  deadlineBadgeTextToday: {
    color: '#E8614A'
  },
  deadlineBadgeTextLater: {
    color: colors.textMuted
  },
  nudgeArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  nudgeArrowText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  nudgeTaskTitle: {
    marginTop: 8,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  nudgeHint: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  nudgeSimpleText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  nudgeMotivationText: {
    flex: 1,
    color: '#3A3A3A',
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 21
  },
  openStudiosSection: {
    marginTop: 22
  },
  sectionBannerCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    alignItems: 'center'
  },
  sectionBannerImage: {
    width: '50%',
    height: 62,
    resizeMode: 'contain'
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
  prediktSection: {
    marginTop: 24
  },
  trendsWrap: {
    paddingHorizontal: 16,
    paddingTop: 16
  },
  emptyTrends: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center'
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
  expandText: {
    marginTop: 12,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  pressed: {
    opacity: 0.72
  }
});
