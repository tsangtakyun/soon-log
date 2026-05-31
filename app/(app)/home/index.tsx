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
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuDrawer } from '@/components/MenuDrawer';
import { SocialLinksSheet } from '@/components/SocialLinksSheet';
import { TrendStrip } from '@/components/TrendStrip';
import ClipPlayer from '@/components/ClipPlayer';
import { useAuth } from '@/hooks/useAuth';
import { getCredits } from '@/lib/credits';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { isTrendVisibleInResultWindow, trendHoldCutoffIso } from '@/lib/trends';
import { colors } from '@/theme/colors';
import { Log } from '@/types';

type TrendAngle = { emoji: string; name: string; percentage: number };
type Trend = {
  id: string;
  topic: string;
  icon: string | null;
  heat_score: number | null;
  angles: TrendAngle[];
};

function isImageIcon(value: string | null | undefined) {
  return Boolean(value && (/^(https?:|data:image\/)/.test(value)));
}

function TrendIcon({ value, size = 40 }: { value?: string | null; size?: number }) {
  if (isImageIcon(value)) {
    return <Image source={{ uri: value || '' }} style={{ width: size, height: size, borderRadius: size * 0.22 }} resizeMode="cover" />;
  }

  return <Text style={[styles.trendIcon, { fontSize: size }]}>{value || '🔥'}</Text>;
}
type HomeProfile = {
  avatar_url: string | null;
  username: string | null;
  display_name: string | null;
};
type HomeLog = Log & {
  profile?: {
    username: string | null;
    avatar_url: string | null;
    display_name: string | null;
  } | null;
  source?: 'log' | 'clip';
};
type HomeClip = {
  id: string;
  caption: string | null;
  media_urls: string[] | null;
  video_url: string | null;
  created_at: string;
  profile?: {
    username: string | null;
    avatar_url: string | null;
    display_name: string | null;
  } | Array<{
    username: string | null;
    avatar_url: string | null;
    display_name: string | null;
  }> | null;
};
type StarProps = {
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
};

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
    <Pressable
      onPress={() => router.push({
        pathname: '/(app)/home/trend/[id]',
        params: { id: trend.id, returnTo: '/(app)/home' }
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
      <View style={styles.angles}>
        {angles.slice(0, 3).map((angle) => (
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
      {angles.length > 3 ? <Text style={styles.expandText}>⋯ 展開</Text> : null}
    </Pressable>
  );
}

function MiniLogCard({
  log,
  compact = false,
  onOpenSettings
}: {
  log: HomeLog;
  compact?: boolean;
  onOpenSettings?: (log: HomeLog) => void;
}) {
  const cover = log.media_urls?.[0] || log.video_url;
  const isVideo = !!cover && (cover.endsWith('.mp4') || cover.includes('video'));
  const username = log.profile?.username || 'soon';
  const avatar = log.profile?.avatar_url;
  const target = log.source === 'clip' ? `/(app)/log/clip/${log.id}` : `/(app)/log/${log.id}`;

  return (
    <Pressable
      onPress={() => router.push(target)}
      style={({ pressed }) => [styles.miniLogCard, compact && styles.ownMiniLogCard, pressed && styles.pressed]}
    >
      {cover ? (
        <ClipPlayer
          clip={{
            id: log.id,
            video_url: isVideo ? cover : null,
            media_urls: log.media_urls || (isVideo ? [] : [cover]),
          }}
          width={160}
          height={compact ? 190 : 200}
          thumbnail
        />
      ) : (
        <View style={[styles.miniLogFallback, compact && styles.ownMiniLogFallback]}>
          <Text numberOfLines={3} style={[styles.miniLogFallbackText, compact && styles.ownMiniLogFallbackText]}>
            {log.title || log.body || '影片日記'}
          </Text>
        </View>
      )}
      {onOpenSettings ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onOpenSettings(log);
          }}
          hitSlop={8}
          style={({ pressed }) => [styles.miniLogSettingsButton, pressed && styles.pressed]}
        >
          <Feather name="more-horizontal" size={18} color="#ffffff" />
        </Pressable>
      ) : null}
      <View style={[styles.miniLogOverlay, compact && !cover && styles.ownMiniLogOverlay]}>
        <View style={styles.miniLogUserRow}>
          {avatar ? <Image source={{ uri: avatar }} style={styles.miniLogAvatar} /> : null}
          <Text numberOfLines={1} style={[styles.miniLogUsername, compact && !cover && styles.ownMiniLogText]}>
            @{username}
          </Text>
        </View>
        <Text numberOfLines={1} style={[styles.miniLogTitle, compact && !cover && styles.ownMiniLogText]}>
          {log.title || log.body || '影片日記'}
        </Text>
      </View>
    </Pressable>
  );
}

function FollowingDiarySection({ logs }: { logs: HomeLog[]; hasFollowing: boolean }) {
  return (
    <View style={styles.diarySection}>
      <View style={styles.sectionBannerWrap}>
        <Image source={require('../../../assets/home-black-box-banner.png')} style={styles.sectionBannerImage} />
      </View>
      {logs.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.diaryStrip}>
          {logs.map((log) => <MiniLogCard key={log.id} log={log} />)}
        </ScrollView>
      ) : (
        <View style={styles.followingEmpty}>
          <Text style={styles.emptyText}>暫時未有新日記</Text>
          <Pressable onPress={() => router.push('/(app)/home/discover')} style={styles.emptyCTA}>
            <Text style={styles.emptyCTAText}>去發掘創作者 →</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function OwnDiarySection({ logs, onOpenSettings }: { logs: HomeLog[]; onOpenSettings: (log: HomeLog) => void }) {
  return (
    <View style={styles.diarySection}>
      <Pressable
        onPress={() => router.push('/(app)/profile')}
        style={({ pressed }) => [styles.sectionBannerWrap, pressed && styles.pressed]}
      >
        <Image source={require('../../../assets/home-diary-banner.png')} style={styles.sectionBannerImage} />
      </Pressable>
      {logs.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.diaryStrip}>
          {logs.map((log) => <MiniLogCard key={log.id} log={log} compact onOpenSettings={onOpenSettings} />)}
        </ScrollView>
      ) : (
        <View style={styles.followingEmpty}>
          <Text style={styles.followingEmptyTitle}>仲未有日記</Text>
          <Pressable onPress={() => router.push('/(app)/log/camera')} style={styles.discoverButton}>
            <Text style={styles.discoverText}>開始記錄</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile: authProfile } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [socialLinksOpen, setSocialLinksOpen] = useState(false);
  const [homeProfile, setHomeProfile] = useState<HomeProfile | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [followingLogs, setFollowingLogs] = useState<HomeLog[]>([]);
  const [ownLogs, setOwnLogs] = useState<HomeLog[]>([]);
  const [hasFollowing, setHasFollowing] = useState(false);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [trendStripRefreshKey, setTrendStripRefreshKey] = useState(0);
  const [credits, setCredits] = useState<number | null>(null);
  const [deletingDiaryId, setDeletingDiaryId] = useState<string | null>(null);
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

  const loadProfileSummary = useCallback(async () => {
    if (!user) return;
    const [creditBalance, { data: profileData }] = await Promise.all([
      user.email ? getCredits(user.email) : Promise.resolve(null),
      supabase
        .from('profiles')
        .select('avatar_url, username, display_name')
        .eq('id', user.id)
        .maybeSingle()
    ]);
    if (creditBalance !== null) setCredits(creditBalance);
    if (profileData) setHomeProfile(profileData as HomeProfile);
  }, [user]);

  const loadTrends = useCallback(async () => {
    setLoadingTrends(true);
    const { data, error } = await supabase
      .from('trends')
      .select('*')
      .eq('is_active', true)
      .or(`deadline_at.is.null,deadline_at.gt.${trendHoldCutoffIso()}`)
      .order('heat_score', { ascending: false });

    if (error) {
      setTrends([]);
    } else {
      setTrends(((data ?? []) as Trend[]).filter((trend) => isTrendVisibleInResultWindow(trend)));
    }
    setLoadingTrends(false);
  }, []);

  const loadDiaries = useCallback(async () => {
    if (!user) return;
    const { data: following } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    const followingIds = (following ?? []).map((row) => row.following_id).filter(Boolean);
    setHasFollowing(followingIds.length > 0);

    const ownQuery = supabase
      .from('topic_clips')
      .select('id, caption, media_urls, video_url, created_at, profile:profiles!topic_clips_user_id_fkey(username, avatar_url, display_name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3);

    const followingQuery = followingIds.length > 0
      ? supabase
        .from('topic_clips')
        .select('id, caption, media_urls, video_url, created_at, profile:profiles!topic_clips_user_id_fkey(username, avatar_url, display_name)')
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(5)
      : Promise.resolve({ data: [], error: null });

    const [{ data: ownData }, { data: followingData }] = await Promise.all([ownQuery, followingQuery]);
    const normaliseProfile = (profile: HomeClip['profile']) => Array.isArray(profile) ? profile[0] ?? null : profile ?? null;
    const mapClip = (clip: HomeClip): HomeLog => ({
      id: clip.id,
      title: clip.caption || '影片日記',
      body: clip.caption || '',
      media_urls: clip.media_urls || [],
      video_url: clip.video_url || null,
      created_at: clip.created_at,
      profile: normaliseProfile(clip.profile),
      source: 'clip'
    } as HomeLog);

    setOwnLogs(((ownData ?? []) as unknown as HomeClip[]).map(mapClip));
    setFollowingLogs(((followingData ?? []) as unknown as HomeClip[]).map(mapClip));
  }, [user]);

  useEffect(() => {
    loadProfileSummary();
    loadTrends();
  }, [loadProfileSummary, loadTrends]);

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
      loadProfileSummary();
      loadDiaries();
    }, [loadDiaries, loadProfileSummary])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setTrendStripRefreshKey((current) => current + 1);
    await Promise.all([
      loadProfileSummary(),
      loadTrends(),
      loadDiaries()
    ]);
    setRefreshing(false);
  }, [loadDiaries, loadProfileSummary, loadTrends]);

  const deleteOwnDiary = useCallback(async (log: HomeLog) => {
    if (!user || deletingDiaryId) return;

    setDeletingDiaryId(log.id);
    const previousLogs = ownLogs;
    setOwnLogs((current) => current.filter((item) => item.id !== log.id));

    const { error } = await supabase
      .from('topic_clips')
      .delete()
      .eq('id', log.id)
      .eq('user_id', user.id);

    if (error) {
      setOwnLogs(previousLogs);
      Alert.alert('刪除失敗', error.message || '請稍後再試');
    }
    setDeletingDiaryId(null);
  }, [deletingDiaryId, ownLogs, user]);

  const openOwnDiarySettings = useCallback((log: HomeLog) => {
    Alert.alert(
      '日記設定',
      log.title || '影片日記',
      [
        { text: '取消', style: 'cancel' },
        {
          text: deletingDiaryId === log.id ? '刪除中...' : '刪除日記',
          style: 'destructive',
          onPress: () => deleteOwnDiary(log)
        }
      ]
    );
  }, [deleteOwnDiary, deletingDiaryId]);

  return (
    <View style={styles.screen}>
      <View style={[styles.hero, { height: heroHeight }]}>
        <StarNoise heroHeight={heroHeight} screenWidth={screenWidth} />
        <View style={[styles.topBar, { top: insets.top + 14 }]}>
          <View style={styles.topActions}>
            <Pressable onPress={() => setDrawerOpen(true)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Feather name="menu" size={20} color="#ffffff" />
            </Pressable>
            <Pressable
              onPress={() => Alert.alert('Credits', `你現有 ${credits ?? 0} Credits\nAI 生成每次扣 10 Credits`)}
              style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}
            >
              <Image source={require('../../../assets/coin.png')} style={styles.topIcon} />
              <Text style={styles.creditTiny}>{credits ?? '...'}</Text>
            </Pressable>
          </View>
          <View style={styles.topActions}>
            <Pressable onPress={() => router.push('/(app)/home/referrals')} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Image source={require('../../../assets/gift.png')} style={styles.topIcon} />
            </Pressable>
            <Pressable onPress={() => setSocialLinksOpen(true)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <View style={styles.fileIconCrop}>
                <Image source={require('../../../assets/save.png')} style={styles.fileTopIcon} />
              </View>
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
          <Pressable onPress={() => router.push('/(app)/log/camera')} style={({ pressed }) => pressed && styles.pressed}>
            <View style={styles.eggImageButton}>
              <Animated.Image
                source={require('../../../assets/soon-egg.png')}
                style={[styles.eggImage, { transform: [{ rotate: eggRotate }] }]}
              />
            </View>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <Text style={styles.trendStripPrompt}>你點睇？入去表達你嘅意見</Text>
        <TrendStrip key={trendStripRefreshKey} />

        <FollowingDiarySection logs={followingLogs} hasFollowing={hasFollowing} />

        <OwnDiarySection logs={ownLogs} onOpenSettings={openOwnDiarySettings} />

        <View style={styles.prediktSection}>
          <View style={styles.sectionBannerWrap}>
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
      <SocialLinksSheet visible={socialLinksOpen} onClose={() => setSocialLinksOpen(false)} />
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
  topIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain'
  },
  fileIconCrop: {
    width: 20,
    height: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  fileTopIcon: {
    width: 22,
    height: 22,
    marginRight: 2,
    resizeMode: 'contain'
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
  trendStripPrompt: {
    marginTop: 12,
    marginBottom: 8,
    marginHorizontal: 18,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    textAlign: 'center'
  },
  diarySection: {
    marginTop: 22
  },
  sectionBannerWrap: {
    width: '100%',
    height: 62,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  sectionBannerImage: {
    width: '50%',
    height: 62,
    resizeMode: 'contain'
  },
  diaryStrip: {
    paddingLeft: 16,
    paddingRight: 4,
    paddingTop: 12
  },
  miniLogCard: {
    width: 160,
    height: 200,
    marginRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.bgHero
  },
  ownMiniLogCard: {
    height: 190
  },
  miniLogImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover'
  },
  miniLogFallback: {
    flex: 1,
    justifyContent: 'center',
    padding: 14
  },
  ownMiniLogFallback: {
    backgroundColor: '#F5F2ED'
  },
  miniLogFallbackText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  ownMiniLogFallbackText: {
    color: '#1A1A1A'
  },
  miniLogOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.58)'
  },
  miniLogSettingsButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2
  },
  miniLogUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  miniLogAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bgHeroSurface
  },
  miniLogUsername: {
    flex: 1,
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  miniLogTitle: {
    marginTop: 7,
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  ownMiniLogOverlay: {
    backgroundColor: 'rgba(245,242,237,0.9)'
  },
  ownMiniLogText: {
    color: '#1A1A1A'
  },
  followingEmpty: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    padding: 16
  },
  followingEmptyTitle: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20
  },
  emptyCTA: {
    marginTop: 8
  },
  emptyCTAText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    fontWeight: '600'
  },
  discoverButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  discoverText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  sectionHeaderRow: {
    marginHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end'
  },
  sectionHeading: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  sectionSubheading: {
    marginTop: 3,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  viewAll: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13
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
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20
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
