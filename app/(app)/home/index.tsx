import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuDrawer } from '@/components/MenuDrawer';
import { SavedSheet } from '@/components/SavedSheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { WorkItem } from '@/types';

type ContentTab = 'All' | 'Trends' | 'YouTube' | 'IG';
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
};

const starColors = ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#a855f7'];
const tabs: ContentTab[] = ['All', 'Trends', 'YouTube', 'IG'];

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat('zh-HK', { month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function StarNoise({ heroHeight }: { heroHeight: number }) {
  const stars = useMemo(() => Array.from({ length: 20 }, (_, index) => {
    const left = ((index * 37) % 100);
    const top = 12 + ((index * 23) % 76);
    return {
      id: index,
      backgroundColor: starColors[index % starColors.length],
      left: `${left}%` as `${number}%`,
      top: Math.round((top / 100) * heroHeight)
    };
  }), [heroHeight]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map(({ id, ...star }) => <View key={id} style={[styles.star, star]} />)}
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

function OpenStudiosSection({ studios }: { studios: OpenStudio[] }) {
  if (studios.length === 0) return null;

  return (
    <View style={styles.openStudiosSection}>
      <Text style={styles.openStudiosTitle}>🌐 Open Studios</Text>
      <Text style={styles.openStudiosSubtitle}>創作者嘅製作過程</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.openStudiosStrip}>
        {studios.map((studio) => (
          <Pressable
            key={studio.id}
            onPress={() => router.push(`/log/room/${studio.id}`)}
            style={({ pressed }) => [styles.openStudioCard, pressed && styles.pressed]}
          >
            <Text style={styles.openStudioBadge}>🌐</Text>
            <View style={styles.openStudioText}>
              <Text numberOfLines={2} style={styles.openStudioName}>{studio.name}</Text>
              <Text numberOfLines={1} style={styles.openStudioTopic}>{studio.topic}</Text>
              <Text numberOfLines={1} style={styles.openStudioMeta}>
                {studio.member_count} 位成員 · {studio.clip_count} clips
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ContentTab>('All');
  const [task, setTask] = useState<WorkItem | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [openStudios, setOpenStudios] = useState<OpenStudio[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [credits, setCredits] = useState(30);
  const heroHeight = Math.round(Dimensions.get('window').height * 0.45);
  const displayUsername = profile?.username ? `@${profile.username}` : '@soon';
  const avatar = user?.user_metadata?.avatar_url || profile?.avatar_url;
  const initial = (profile?.username || user?.email || 'S').slice(0, 1).toUpperCase();

  const loadNudge = useCallback(async () => {
    if (!user) return;
    const [{ data: taskData }, { data: creditData }] = await Promise.all([
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
        .maybeSingle()
    ]);
    setTask((taskData ?? null) as WorkItem | null);
    if (creditData?.balance !== undefined) setCredits(creditData.balance as number);
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
      supabase.from('topic_clips').select('id, room_id, created_at').in('room_id', roomIds)
    ]);

    const memberSets = new Map<string, Set<string>>();
    (members ?? []).forEach((member) => {
      const set = memberSets.get(member.room_id) ?? new Set<string>();
      set.add(member.user_id);
      memberSets.set(member.room_id, set);
    });

    const clipCounts = new Map<string, number>();
    const lastClips = new Map<string, string>();
    (clips ?? []).forEach((clip) => {
      clipCounts.set(clip.room_id, (clipCounts.get(clip.room_id) ?? 0) + 1);
      const current = lastClips.get(clip.room_id);
      if (!current || new Date(clip.created_at).getTime() > new Date(current).getTime()) {
        lastClips.set(clip.room_id, clip.created_at);
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
        last_clip_at: lastClips.get(room.id) ?? null
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
    loadOpenStudios();
  }, [loadNudge, loadOpenStudios, loadTrends]);

  const nudgeMessage = task
    ? `今日要完成：${task.title}${task.due_date ? `，截止 ${formatDueDate(task.due_date)}` : ''}`
    : '你今日想記錄咩？撳低開始拍片 🎬';

  return (
    <View style={styles.screen}>
      <View style={[styles.hero, { height: heroHeight, paddingTop: insets.top + 14 }]}>
        <StarNoise heroHeight={heroHeight} />
        <View style={styles.topBar}>
          <Pressable onPress={() => setDrawerOpen(true)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
            <Text style={styles.squareButtonText}>☰</Text>
          </Pressable>
          <View style={styles.topActions}>
            <Pressable onPress={() => Alert.alert('AI Credits', `你今日仲有 ${credits} credits`)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Text style={styles.squareButtonText}>🪙</Text>
              <Text style={styles.creditTiny}>{credits}</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(app)/home/referrals')} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Text style={styles.squareButtonText}>🎁</Text>
            </Pressable>
            <Pressable onPress={() => setSavedOpen(true)} style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}>
              <Text style={styles.squareButtonText}>🔖</Text>
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
            <LinearGradient colors={[colors.primary, colors.primaryDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta}>
              <Text style={styles.ctaIcon}>⌛</Text>
              <Text style={styles.ctaText}>SOON-LOG</Text>
            </LinearGradient>
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

        <OpenStudiosSection studios={openStudios} />

        <Text style={styles.sectionTitle}>Content</Text>
        <View style={styles.contentTabs}>
          {tabs.map((tab) => (
            <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.contentTab, activeTab === tab && styles.activeContentTab]}>
              <Text style={[styles.contentTabText, activeTab === tab && styles.activeContentTabText]}>{tab}</Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'All' ? <EmptySocialState buttonLabel="Connect socials" /> : null}
        {activeTab === 'YouTube' ? <EmptySocialState buttonLabel="Connect YouTube" /> : null}
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
  star: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 999,
    opacity: 0.25
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
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.bgBody,
    alignItems: 'center',
    justifyContent: 'center'
  },
  squareButtonText: {
    color: colors.text,
    fontSize: 20,
    fontFamily: fonts.bodyBold
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
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.textOnDark,
    backgroundColor: colors.bgHeroSurface
  },
  heroAvatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.textOnDark,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroAvatarInitial: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 30
  },
  username: {
    marginTop: 12,
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    textAlign: 'center'
  },
  cta: {
    marginTop: 16,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  ctaIcon: {
    color: colors.textOnDark,
    fontSize: 16
  },
  ctaText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 16
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
    fontSize: 24
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
