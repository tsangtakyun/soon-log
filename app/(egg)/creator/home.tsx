import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  const [topicOffset, setTopicOffset] = useState(0);
  const creator = data?.creator;
  const latest = data?.metrics?.latest;
  const previous = data?.metrics?.previous;
  const name = creator?.display_name || creator?.username || 'Creator';
  const followers = creator?.instagram_followers ?? latest?.followers;
  const topicCardWidth = Math.min(286, Math.max(246, width - 84));
  const visibleTopics = useMemo(() => {
    if (topics.length <= 5) return topics;
    return Array.from({ length: 5 }, (_, index) => topics[(topicOffset + index) % topics.length]);
  }, [topicOffset, topics]);
  const loadTopics = useCallback(async () => {
    try {
      const result = await loadEggTopics();
      setTopics(result.ideas);
    } catch {
      setTopics([]);
    }
  }, []);
  useEffect(() => { void loadTopics(); }, [loadTopics, data?.activeWorkspace?.id]);

  function nextTopicBatch() {
    if (topics.length <= 5) return void loadTopics();
    setTopicOffset((current) => (current + 5) % topics.length);
  }
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
      </View>
      {loading ? <EggLoader label="正在載入工作空間…" /> : null}
      {error ? <View style={eggStyles.card}><Text style={eggStyles.cardTitle}>未能載入工作空間</Text><Text style={eggStyles.body}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={eggStyles.link}>重新整理</Text></Pressable></View> : null}
      {data && data.workspaces.length > 1 ? (
        <View style={eggStyles.card}>
          <Text style={eggStyles.cardTitle}>切換工作空間</Text>
          {data.workspaces.map((workspace) => (
            <Pressable key={workspace.id} onPress={() => void refresh(workspace.id)} style={eggStyles.row}>
              <Text style={eggStyles.body}>{workspace.display_name || workspace.username}</Text>
              <Text style={workspace.id === data.activeWorkspace?.id ? eggStyles.link : eggStyles.body}>{workspace.role}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.topicSection}>
        <View style={eggStyles.sectionHeader}>
          <Text style={eggStyles.cardTitle}>題材靈感</Text>
          <Pressable onPress={nextTopicBatch} hitSlop={10} style={styles.refreshTopics} accessibilityRole="button" accessibilityLabel="換一批題材靈感">
            <Feather name="refresh-cw" size={14} color={colors.primary} />
            <Text style={eggStyles.link}>換一批</Text>
          </Pressable>
        </View>
        {visibleTopics.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={topicCardWidth + 10} decelerationRate="fast" contentContainerStyle={styles.topicRail}>
          {visibleTopics.map((topic) => <Pressable key={topic.id} onPress={() => router.push('/creator/topics' as never)} style={[styles.topicCard, { width: topicCardWidth }]} accessibilityRole="button" accessibilityLabel={`查看題材：${topic.title}`}>
            {topic.image_url ? <Image source={{ uri: topic.image_url }} style={styles.topicImage} resizeMode="cover" /> : <View style={[styles.topicImage, styles.topicImageFallback]}><Feather name="zap" size={25} color="#92400e" /></View>}
            <View style={styles.topicCopy}>
              <View style={styles.topicMetaRow}>
                <Text style={styles.topicMeta} numberOfLines={1}>{topic.category}{topic.localities?.[0] ? ` · ${topic.localities[0]}` : ''}</Text>
                {topic.media_urls && topic.media_urls.length > 1 ? <Text style={styles.topicCount}>1/{topic.media_urls.length}</Text> : null}
              </View>
              <Text style={styles.topicTitle} numberOfLines={2}>{topic.title}</Text>
              <View style={styles.topicAction}><Text style={styles.topicActionText}>查看題材</Text><Feather name="arrow-right" size={13} color={colors.primary} /></View>
            </View>
          </Pressable>)}
          <Pressable onPress={() => router.push('/creator/topics' as never)} style={[styles.moreTopics, { width: Math.min(170, topicCardWidth * 0.62) }]} accessibilityRole="button"><Feather name="arrow-right-circle" size={26} color={colors.primary} /><Text style={styles.moreTopicsText}>查看更多題材</Text></Pressable>
        </ScrollView> : <Pressable onPress={() => router.push('/creator/topics' as never)} style={styles.emptyTopics}><Text style={eggStyles.body}>SOON 正在整理新題材</Text><Text style={eggStyles.link}>前往題材靈感庫 →</Text></Pressable>}
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
  topicSection: { gap: 11 },
  refreshTopics: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  topicRail: { gap: 10, paddingRight: 4 },
  topicCard: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  topicImage: { width: '100%', height: 142, backgroundColor: '#f8f3ed' },
  topicImageFallback: { alignItems: 'center', justifyContent: 'center' },
  topicCopy: { padding: 13, gap: 8 },
  topicMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  topicMeta: { flex: 1, color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 11 },
  topicCount: { borderRadius: 999, overflow: 'hidden', backgroundColor: '#2b211f', color: '#fff', fontFamily: fonts.bodyBold, fontSize: 10, paddingHorizontal: 7, paddingVertical: 3 },
  topicTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, minHeight: 44 },
  topicAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  topicActionText: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 12 },
  moreTopics: { minHeight: 240, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fbf5ef', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 16 },
  moreTopicsText: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 13, textAlign: 'center' },
  emptyTopics: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, padding: 18, gap: 6 },
});
