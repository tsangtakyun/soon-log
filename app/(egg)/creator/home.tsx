import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { EggScreen, eggStyles } from '@/components/egg/EggScreen';
import { EggLoader } from '@/components/egg/EggLoader';
import { useEggBootstrap } from '@/hooks/useEggBootstrap';
import { colors } from '@/theme/colors';
import { fonts } from '@/lib/theme';
import { EggTopicIdea, loadEggTopics } from '@/lib/eggApi';

type TrendProps = { current: number | null | undefined; previous: number | null | undefined };

function Trend({ current, previous }: TrendProps) {
  if (current == null || previous == null || previous === 0) return <Text style={styles.neutralTrend}>— 暫未有比較</Text>;
  const change = ((current - previous) / previous) * 100;
  const isUp = change > 0;
  const isDown = change < 0;
  return (
    <View style={styles.trendRow}>
      <Feather name={isUp ? 'arrow-up-right' : isDown ? 'arrow-down-right' : 'minus'} size={14} color={isUp ? '#15803d' : isDown ? '#dc2626' : colors.textMuted} />
      <Text style={[styles.trend, isUp && styles.trendUp, isDown && styles.trendDown]}>{Math.abs(change).toFixed(1)}%</Text>
    </View>
  );
}

function Metric({ label, value, current, previous }: { label: string; value: string; current?: number | null; previous?: number | null }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Trend current={current} previous={previous} />
    </View>
  );
}

export default function EggHomeScreen() {
  const { width } = useWindowDimensions();
  const { data, loading, error, refresh } = useEggBootstrap();
  const [topics, setTopics] = useState<EggTopicIdea[]>([]);
  const [topicPage, setTopicPage] = useState(0);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const topicRailRef = useRef<ScrollView>(null);
  const creator = data?.creator;
  const latest = data?.metrics?.latest;
  const previous = data?.metrics?.previous;
  const name = creator?.display_name || creator?.username || 'Creator';
  const followers = creator?.instagram_followers ?? latest?.followers;
  const topicCardWidth = Math.min(286, Math.max(246, width - 84));
  const visibleTopics = useMemo(() => topics.slice(0, 5), [topics]);
  const loadTopics = useCallback(async () => {
    try {
      const result = await loadEggTopics();
      setTopics(result.ideas);
    } catch {
      setTopics([]);
    }
  }, []);
  useEffect(() => { void loadTopics(); }, [loadTopics, data?.activeWorkspace?.id]);
  useEffect(() => {
    if (visibleTopics.length < 2) return;
    const timer = setInterval(() => {
      setTopicPage((current) => {
        const next = (current + 1) % visibleTopics.length;
        topicRailRef.current?.scrollTo({ x: next * (topicCardWidth + 10), animated: next !== 0 });
        return next;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [topicCardWidth, visibleTopics.length]);

  const handleTopicScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setTopicPage(Math.min(visibleTopics.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / (topicCardWidth + 10)))));
  }, [topicCardWidth, visibleTopics.length]);
  const switchWorkspace = useCallback(async (workspaceId: string) => {
    if (workspaceId === data?.activeWorkspace?.id) {
      setWorkspaceMenuOpen(false);
      return;
    }
    await refresh(workspaceId);
    setWorkspaceMenuOpen(false);
  }, [data?.activeWorkspace?.id, refresh]);
  return (
    <EggScreen>
      <View style={styles.greeting}>
        {creator?.avatar_url ? (
          <Image source={{ uri: creator.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}><Feather name="user" size={24} color={colors.textMuted} /></View>
        )}
        <View style={styles.greetingCopy}>
          <Text style={styles.hello}>你好，{name}</Text>
          <Text style={styles.subheading}>今日有咩想創作？</Text>
        </View>
        {data && data.workspaces.length > 1 ? (
          <Pressable onPress={() => setWorkspaceMenuOpen(true)} style={({ pressed }) => [styles.workspaceButton, pressed && styles.workspaceButtonPressed]} accessibilityRole="button" accessibilityLabel="切換工作空間">
            <Feather name="repeat" size={21} color={colors.primary} />
            <View style={styles.workspaceButtonDot} />
          </Pressable>
        ) : null}
      </View>
      {loading ? <EggLoader label="正在載入工作空間…" /> : null}
      {error ? <View style={eggStyles.card}><Text style={eggStyles.cardTitle}>未能載入工作空間</Text><Text style={eggStyles.body}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={eggStyles.link}>重新整理</Text></Pressable></View> : null}
      <View style={styles.topicSection}>
        <View style={eggStyles.sectionHeader}>
          <Text style={eggStyles.cardTitle}>題材靈感</Text>
          <Pressable onPress={() => router.push('/creator/topics' as never)} hitSlop={10} accessibilityRole="button">
            <Text style={styles.topicLibraryLink}>查看全部 →</Text>
          </Pressable>
        </View>
        {visibleTopics.length ? <ScrollView ref={topicRailRef} horizontal showsHorizontalScrollIndicator={false} snapToInterval={topicCardWidth + 10} decelerationRate="fast" onMomentumScrollEnd={handleTopicScroll} contentContainerStyle={styles.topicRail}>
          {visibleTopics.map((topic) => <Pressable key={topic.id} onPress={() => router.push('/creator/topics' as never)} style={[styles.topicCard, { width: topicCardWidth }]} accessibilityRole="button" accessibilityLabel={`查看題材：${topic.title}`}>
            {topic.image_url ? <Image source={{ uri: topic.image_url }} style={[styles.topicImage, { height: topicCardWidth }]} resizeMode="contain" /> : <View style={[styles.topicImage, styles.topicImageFallback, { height: topicCardWidth }]}><Feather name="zap" size={25} color="#92400e" /></View>}
            <View style={styles.topicCopy}>
              <View style={styles.topicMetaRow}>
                <Text style={styles.topicMeta} numberOfLines={1}>{topic.category}{topic.localities?.[0] ? ` · ${topic.localities[0]}` : ''}</Text>
                {topic.media_urls && topic.media_urls.length > 1 ? <Text style={styles.topicCount}>1/{topic.media_urls.length}</Text> : null}
              </View>
              <Text style={styles.topicTitle} numberOfLines={2}>{topic.title}</Text>
              <View style={styles.topicAction}><Text style={styles.topicActionText}>查看題材</Text><Feather name="arrow-right" size={13} color={colors.primary} /></View>
            </View>
          </Pressable>)}
        </ScrollView> : <Pressable onPress={() => router.push('/creator/topics' as never)} style={styles.emptyTopics}><Text style={eggStyles.body}>SOON 正在整理新題材</Text><Text style={eggStyles.link}>前往題材靈感庫 →</Text></Pressable>}
        {visibleTopics.length > 1 ? <View style={styles.topicDots}>{visibleTopics.map((topic, index) => <View key={topic.id} style={[styles.topicDot, topicPage === index && styles.topicDotActive]} />)}</View> : null}
      </View>
      <View style={eggStyles.card}>
        <View style={eggStyles.sectionHeader}><Text style={eggStyles.cardTitle}>待處理合作</Text><Feather name="briefcase" size={19} color={colors.textMuted} /></View>
        <View style={eggStyles.row}><Text style={eggStyles.body}>品牌邀請及申請</Text><Text style={eggStyles.metric}>{data?.metrics?.pendingDeals ?? 0}</Text></View>
      </View>
      <Pressable onPress={() => router.push('/creator/analytics' as never)} style={eggStyles.card} accessibilityRole="button" accessibilityLabel="查看完整社交數據">
        <View style={eggStyles.sectionHeader}><Text style={eggStyles.cardTitle}>社交數據</Text><Text style={eggStyles.link}>查看詳情 →</Text></View>
        <Text style={styles.period}>與上一個數據快照比較</Text>
        <View style={styles.metricsGrid}>
          <Metric label="Instagram 粉絲" value={followers?.toLocaleString() ?? '—'} current={followers} previous={previous?.followers} />
          <Metric label="7 日觸及" value={latest?.reach_7d?.toLocaleString() ?? '—'} current={latest?.reach_7d} previous={previous?.reach_7d} />
          <Metric label="互動率" value={latest?.engagement_rate != null ? `${latest.engagement_rate.toFixed(1)}%` : '—'} current={latest?.engagement_rate} previous={previous?.engagement_rate} />
        </View>
      </Pressable>
      <Modal visible={workspaceMenuOpen} transparent animationType="slide" onRequestClose={() => setWorkspaceMenuOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setWorkspaceMenuOpen(false)}>
          <Pressable style={styles.workspaceSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View><Text style={styles.workspaceEyebrow}>工作空間</Text><Text style={styles.sheetTitle}>切換創作者身份</Text></View>
              <Pressable onPress={() => setWorkspaceMenuOpen(false)} style={styles.closeButton} hitSlop={10} accessibilityLabel="關閉"><Feather name="x" size={20} color={colors.textMuted} /></Pressable>
            </View>
            <Text style={styles.sheetHint}>目前使用：{data?.activeWorkspace?.display_name || data?.activeWorkspace?.username}</Text>
            <View style={styles.workspaceList}>
              {data?.workspaces.map((workspace) => (
                <Pressable key={workspace.id} disabled={loading} onPress={() => void switchWorkspace(workspace.id)} style={({ pressed }) => [styles.workspaceOption, workspace.id === data.activeWorkspace?.id && styles.workspaceOptionActive, pressed && styles.workspaceOptionPressed]} accessibilityRole="button" accessibilityLabel={`切換到 ${workspace.display_name || workspace.username}`}>
                  {workspace.avatar_url ? <Image source={{ uri: workspace.avatar_url }} style={styles.workspaceAvatar} /> : <View style={[styles.workspaceAvatar, styles.workspaceAvatarFallback]}><Text style={styles.workspaceInitial}>{(workspace.display_name || workspace.username).slice(0, 1).toUpperCase()}</Text></View>}
                  <View style={styles.workspaceCopy}><Text style={styles.workspaceName}>{workspace.display_name || workspace.username}</Text><Text style={styles.workspaceRole}>{workspace.role === 'owner' ? '擁有者' : workspace.role === 'admin' ? '管理員' : '成員'}</Text></View>
                  {workspace.id === data?.activeWorkspace?.id ? <View style={styles.currentBadge}><Feather name="check" size={13} color="#fff" /><Text style={styles.currentBadgeText}>使用中</Text></View> : <Feather name="chevron-right" size={19} color={colors.textMuted} />}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </EggScreen>
  );
}

const styles = StyleSheet.create({
  greeting: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 4 },
  greetingCopy: { flex: 1, gap: 2 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.bgCard },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  hello: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 25, lineHeight: 31 },
  subheading: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 },
  workspaceButton: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: colors.bodyBorder, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  workspaceButtonPressed: { opacity: 0.65, transform: [{ scale: 0.97 }] },
  workspaceButtonDot: { position: 'absolute', right: 8, top: 8, width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: colors.bgCard, backgroundColor: '#d9a76c' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(31, 24, 21, 0.36)' },
  workspaceSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.bg, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34, gap: 14 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#d7d0ca', marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: colors.text, fontFamily: fonts.heading, fontSize: 24, marginTop: 2 },
  sheetHint: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 },
  closeButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  workspaceList: { gap: 10 },
  workspaceEyebrow: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.8 },
  workspaceOption: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.bodyBorder, backgroundColor: colors.bg, paddingHorizontal: 12, paddingVertical: 10 },
  workspaceOptionActive: { borderColor: '#d9a76c', backgroundColor: '#fff8ea' },
  workspaceOptionPressed: { opacity: 0.7 },
  workspaceAvatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#f3f4f6' },
  workspaceAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  workspaceInitial: { fontFamily: fonts.heading, fontSize: 17, color: colors.primary },
  workspaceCopy: { flex: 1, minWidth: 0 },
  workspaceName: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 },
  workspaceRole: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: colors.primary, paddingHorizontal: 9, paddingVertical: 6 },
  currentBadgeText: { color: '#fff', fontFamily: fonts.bodyBold, fontSize: 11 },
  comingSoon: { borderRadius: 999, backgroundColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 5 },
  comingSoonText: { color: '#92400e', fontFamily: fonts.bodyBold, fontSize: 11 },
  period: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
  metricsGrid: { gap: 10 },
  metricCard: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 4 },
  metricLabel: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 },
  metricValue: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 25 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  trend: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 12 },
  trendUp: { color: '#15803d' },
  trendDown: { color: '#dc2626' },
  neutralTrend: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },
  topicSection: { gap: 11, marginHorizontal: -8, borderWidth: 1, borderColor: '#d8b48f', borderRadius: 22, backgroundColor: '#fff8e8', padding: 14 },
  topicLibraryLink: { color: '#7a4033', fontFamily: fonts.bodyBold, fontSize: 12 },
  topicRail: { gap: 10, paddingRight: 4 },
  topicCard: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: '#ead3bb', backgroundColor: '#fffdf8' },
  topicImage: { width: '100%', backgroundColor: '#f8f3ed' },
  topicImageFallback: { alignItems: 'center', justifyContent: 'center' },
  topicCopy: { padding: 13, gap: 8 },
  topicMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  topicMeta: { flex: 1, color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 11 },
  topicCount: { borderRadius: 999, overflow: 'hidden', backgroundColor: '#2b211f', color: '#fff', fontFamily: fonts.bodyBold, fontSize: 10, paddingHorizontal: 7, paddingVertical: 3 },
  topicTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, minHeight: 44 },
  topicAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  topicActionText: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 12 },
  topicDots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, minHeight: 8 },
  topicDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#dec9b5' },
  topicDotActive: { width: 18, backgroundColor: '#7a4033' },
  emptyTopics: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, padding: 18, gap: 6 },
});
