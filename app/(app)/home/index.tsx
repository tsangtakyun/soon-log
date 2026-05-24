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
import { MenuDrawer } from '@/components/MenuDrawer';
import { SocialLinksSheet } from '@/components/SocialLinksSheet';
import { SubscriberStrip } from '@/components/SubscriberStrip';
import ClipPlayer from '@/components/ClipPlayer';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
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

function MiniLogCard({ log, compact = false }: { log: HomeLog; compact?: boolean }) {
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

function OwnDiarySection({ logs }: { logs: HomeLog[] }) {
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
          {logs.map((log) => <MiniLogCard key={log.id} log={log} compact />)}
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

  const loadProfileSummary = useCallback(async () => {
    if (!user) return;
    const [{ data: creditData }, { data: profileData }] = await Promise.all([
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
      loadDiaries();
    }, [loadDiaries])
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.hero, { height: heroHeight }]}>
        <StarNoise heroHeight={heroHeight} screenWidth={screenWidth} />
        <View style={[styles.topBar, { top: insets.top + 14 }]}>
          <View style={styles.topActions}>
            <Pressable onPress={() => setDrawerOpen(true)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Feather name="menu" size={20} color="#ffffff" />
            </Pressable>
            <Pressable onPress={() => Alert.alert('AI Credits', `你今日仲有 ${credits} credits`)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Image source={require('../../../assets/coin.png')} style={styles.topIcon} />
              <Text style={styles.creditTiny}>{credits}</Text>
            </Pressable>
          </View>
          <View style={styles.topActions}>
            <Pressable onPress={() => router.push('/(app)/home/referrals')} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Image source={require('../../../assets/gift.png')} style={styles.topIcon} />
            </Pressable>
            <Pressable onPress={() => setSocialLinksOpen(true)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Image source={require('../../../assets/save.png')} style={styles.topIcon} />
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

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <SubscriberStrip />

        <FollowingDiarySection logs={followingLogs} hasFollowing={hasFollowing} />

        <OwnDiarySection logs={ownLogs} />

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
