import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type TrendAngle = { emoji: string; name: string; percentage: number };
type NewsHeadline = string | {
  title?: string;
  source?: string;
  url?: string;
  published_at?: string | null;
};
type Trend = {
  id: string;
  topic: string;
  icon: string | null;
  heat_score: number | null;
  angles: TrendAngle[];
  news_headlines?: NewsHeadline[] | null;
  description?: string | null;
  why_trending?: string | null;
  creator_tips?: string | null;
  related_links?: Array<{ url: string }> | null;
};
type DiscussionProfile = {
  username: string | null;
  avatar_url: string | null;
  display_name: string | null;
};
type Discussion = {
  id: string;
  trend_id: string;
  author_id: string;
  body: string;
  like_count: number | null;
  reply_count: number | null;
  created_at: string;
  profiles?: DiscussionProfile | null;
};

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 日前`;
}

function parseNewsItems(value?: NewsHeadline[] | null) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return null;
    const title = (item.title || '').trim();
    const url = (item.url || '').trim();
    if (!title || !url) return null;
    return {
      title,
      url,
      source: (item.source || '').trim(),
      published_at: item.published_at || null
    };
  }).filter(Boolean) as Array<{ title: string; source: string; url: string; published_at: string | null }>;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function isImageIcon(value: string | null | undefined) {
  return Boolean(value && (/^(https?:|data:image\/)/.test(value)));
}

function TrendIcon({ value, size = 30 }: { value?: string | null; size?: number }) {
  if (isImageIcon(value)) {
    return <Image source={{ uri: value || '' }} style={{ width: size, height: size, borderRadius: size * 0.22 }} resizeMode="cover" />;
  }

  return <Text style={[styles.trendIcon, { fontSize: size }]}>{value || '🔥'}</Text>;
}

function TrendInfoCard({ trend }: { trend: Trend }) {
  return (
    <View style={styles.trendCard}>
      <View style={styles.trendHeader}>
        <View style={styles.trendTopicWrap}>
          <TrendIcon value={trend.icon} />
          <Text numberOfLines={2} style={styles.trendTitle}>{trend.topic}</Text>
        </View>
        <Text style={styles.heat}>🔥 {trend.heat_score ?? 0}</Text>
      </View>

      <View style={styles.angleList}>
        {(trend.angles ?? []).map((angle) => (
          <View key={`${angle.emoji}-${angle.name}`} style={styles.angleRow}>
            <TrendIcon value={angle.emoji} size={18} />
            <Text numberOfLines={1} style={styles.angleName}>{angle.name}</Text>
            <Text style={styles.anglePercent}>{angle.percentage}%</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${clampPercent(angle.percentage)}%` }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function TrendDetailSection({ trend }: { trend: Trend }) {
  const links = trend.related_links ?? [];
  const hasDetail = Boolean(trend.description || trend.why_trending || trend.creator_tips || links.length > 0);
  if (!hasDetail) return null;

  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailTitle}>話題詳細</Text>

      {trend.description ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailLabel}>背景</Text>
          <Text style={styles.detailText}>{trend.description}</Text>
        </View>
      ) : null}

      {trend.why_trending ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailLabel}>點解而家咁熱？</Text>
          <Text style={styles.detailText}>{trend.why_trending}</Text>
        </View>
      ) : null}

      {trend.creator_tips ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailLabel}>Creator 可以點拍？</Text>
          <Text style={styles.detailText}>{trend.creator_tips}</Text>
        </View>
      ) : null}

      {links.length > 0 ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailLabel}>相關連結</Text>
          {links.map((link, index) => (
            <TouchableOpacity
              key={`${link.url}-${index}`}
              onPress={() => Linking.openURL(link.url)}
              style={styles.linkRow}
            >
              <Feather name="external-link" size={14} color={colors.primary} />
              <Text style={styles.linkText} numberOfLines={1}>
                {link.url}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function NewsSection({ trend }: { trend: Trend }) {
  const newsItems = parseNewsItems(trend.news_headlines);
  if (newsItems.length === 0) return null;

  return (
    <View style={styles.newsSection}>
      <Text style={styles.newsTitle}>相關新聞</Text>
      {newsItems.map((item, index) => (
        <Pressable
          key={`${item.url}-${index}`}
          onPress={() => Linking.openURL(item.url)}
          style={({ pressed }) => [
            styles.newsItem,
            index === newsItems.length - 1 && styles.newsItemLast,
            pressed && styles.pressed
          ]}
        >
          <Text numberOfLines={2} style={styles.newsItemTitle}>{item.title}</Text>
          <Text style={styles.newsItemMeta}>
            {item.source || 'News'}{item.published_at ? `・${timeAgo(item.published_at)}` : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function TrendDetailSheet({
  trend,
  visible,
  onClose,
  bottomInset
}: {
  trend: Trend | null;
  visible: boolean;
  onClose: () => void;
  bottomInset: number;
}) {
  if (!trend) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: bottomInset + 20 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>話題詳細</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.sheetCloseButton}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            <TrendDetailSection trend={trend} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Avatar({ profile }: { profile?: DiscussionProfile | null }) {
  if (profile?.avatar_url) {
    return <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />;
  }

  const initial = (profile?.display_name || profile?.username || 'S').slice(0, 1).toUpperCase();
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarInitial}>{initial}</Text>
    </View>
  );
}

function EmptyDiscussionState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>💬</Text>
      <Text style={styles.emptyTitle}>仲未有人分享睇法</Text>
      <Text style={styles.emptyBody}>做第一個發表你對呢個 trend 嘅意見</Text>
    </View>
  );
}

export default function TrendDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trendId = Array.isArray(id) ? id[0] : id;
  const { user, profile } = useAuth();
  const [trend, setTrend] = useState<Trend | null>(null);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedTrend, setSavedTrend] = useState(false);
  const [savedDiscussionIds, setSavedDiscussionIds] = useState<Set<string>>(new Set());
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailVisible, setDetailVisible] = useState(false);
  const canSend = inputText.trim().length > 0;

  const discussionIds = useMemo(() => discussions.map((discussion) => discussion.id), [discussions]);
  const hasTrendDetail = Boolean(
    trend?.description
    || trend?.why_trending
    || trend?.creator_tips
    || (trend?.related_links?.length ?? 0) > 0
  );

  const loadLikedStatus = useCallback(async (ids: string[]) => {
    if (!user || ids.length === 0) {
      setLikedIds(new Set());
      return;
    }

    const { data: myLikes } = await supabase
      .from('discussion_likes')
      .select('discussion_id')
      .eq('user_id', user.id)
      .in('discussion_id', ids);

    setLikedIds(new Set((myLikes ?? []).map((like) => like.discussion_id)));
  }, [user]);

  const loadSavedStatus = useCallback(async (ids: string[]) => {
    if (!user || !trendId) {
      setSavedTrend(false);
      setSavedDiscussionIds(new Set());
      return;
    }

    const savedTargets = [
      { item_type: 'trend', item_id: trendId },
      ...ids.map((discussionId) => ({ item_type: 'discussion', item_id: discussionId }))
    ];

    const { data } = await supabase
      .from('saved_items')
      .select('item_type, item_id')
      .eq('user_id', user.id)
      .or(savedTargets.map((target) => `and(item_type.eq.${target.item_type},item_id.eq.${target.item_id})`).join(','));

    const savedRows = data ?? [];
    setSavedTrend(savedRows.some((row) => row.item_type === 'trend' && row.item_id === trendId));
    setSavedDiscussionIds(new Set(
      savedRows
        .filter((row) => row.item_type === 'discussion')
        .map((row) => row.item_id)
    ));
  }, [trendId, user]);

  const loadData = useCallback(async () => {
    if (!trendId) return;
    setLoading(true);

    const [{ data: trendData, error: trendError }, { data: discussionData, error: discussionError }] = await Promise.all([
      supabase
        .from('trends')
        .select('*')
        .eq('id', trendId)
        .single(),
      supabase
        .from('trend_discussions')
        .select('*, profiles!trend_discussions_author_id_fkey(username, avatar_url, display_name)')
        .eq('trend_id', trendId)
        .order('created_at', { ascending: false })
    ]);

    if (trendError || !trendData) {
      Alert.alert('錯誤', '找不到此話題');
      router.back();
      setLoading(false);
      return;
    }

    setTrend((trendData ?? null) as Trend | null);

    if (discussionError) {
      setDiscussions([]);
      setLoading(false);
      return;
    }

    const rows = (discussionData ?? []) as Discussion[];
    setDiscussions(rows);
    await loadLikedStatus(rows.map((discussion) => discussion.id));
    await loadSavedStatus(rows.map((discussion) => discussion.id));
    setLoading(false);
  }, [loadLikedStatus, loadSavedStatus, trendId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadLikedStatus(discussionIds);
    loadSavedStatus(discussionIds);
  }, [discussionIds, loadLikedStatus, loadSavedStatus]);

  useEffect(() => {
    if (!trendId) return;

    const channel = supabase
      .channel(`trend-discussions-${trendId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trend_discussions',
        filter: `trend_id=eq.${trendId}`
      }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData, trendId]);

  async function toggleLike(discussionId: string) {
    if (!user) return;

    const isCurrentlyLiked = likedIds.has(discussionId);

    setLikedIds((prev) => {
      const next = new Set(prev);
      isCurrentlyLiked ? next.delete(discussionId) : next.add(discussionId);
      return next;
    });
    setDiscussions((prev) => prev.map((discussion) => discussion.id === discussionId
      ? { ...discussion, like_count: Math.max(0, (discussion.like_count ?? 0) + (isCurrentlyLiked ? -1 : 1)) }
      : discussion));

    const { error } = isCurrentlyLiked
      ? await supabase
        .from('discussion_likes')
        .delete()
        .eq('discussion_id', discussionId)
        .eq('user_id', user.id)
      : await supabase
        .from('discussion_likes')
        .insert({ discussion_id: discussionId, user_id: user.id });

    if (error) {
      loadData();
    }
  }

  async function submitDiscussion() {
    const body = inputText.trim();
    if (!body || !user || !trendId) return;

    const optimisticDiscussion: Discussion = {
      id: `local-${Date.now()}`,
      trend_id: trendId,
      author_id: user.id,
      body,
      like_count: 0,
      reply_count: 0,
      created_at: new Date().toISOString(),
      profiles: {
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null
      }
    };

    setInputText('');
    setDiscussions((prev) => [optimisticDiscussion, ...prev]);
    Keyboard.dismiss();

    const { data, error } = await supabase
      .from('trend_discussions')
      .insert({ trend_id: trendId, author_id: user.id, body })
      .select('*, profiles!trend_discussions_author_id_fkey(username, avatar_url, display_name)')
      .single();

    if (error) {
      setDiscussions((prev) => prev.filter((discussion) => discussion.id !== optimisticDiscussion.id));
      setInputText(body);
      return;
    }

    setDiscussions((prev) => [data as Discussion, ...prev.filter((discussion) => discussion.id !== optimisticDiscussion.id)]);
  }

  async function toggleTrendSave() {
    if (!user || !trendId) return;
    const isSaved = savedTrend;
    setSavedTrend(!isSaved);

    const { error } = isSaved
      ? await supabase
        .from('saved_items')
        .delete()
        .eq('user_id', user.id)
        .eq('item_type', 'trend')
        .eq('item_id', trendId)
      : await supabase
        .from('saved_items')
        .insert({ user_id: user.id, item_type: 'trend', item_id: trendId });

    if (error) setSavedTrend(isSaved);
  }

  async function toggleDiscussionSave(discussionId: string) {
    if (!user) return;
    const isSaved = savedDiscussionIds.has(discussionId);
    setSavedDiscussionIds((prev) => {
      const next = new Set(prev);
      isSaved ? next.delete(discussionId) : next.add(discussionId);
      return next;
    });

    const { error } = isSaved
      ? await supabase
        .from('saved_items')
        .delete()
        .eq('user_id', user.id)
        .eq('item_type', 'discussion')
        .eq('item_id', discussionId)
      : await supabase
        .from('saved_items')
        .insert({ user_id: user.id, item_type: 'discussion', item_id: discussionId });

    if (error) {
      setSavedDiscussionIds((prev) => {
        const next = new Set(prev);
        isSaved ? next.add(discussionId) : next.delete(discussionId);
        return next;
      });
    }
  }

  const renderDiscussion = ({ item }: { item: Discussion }) => {
    const username = item.profiles?.username || 'soon';
    const isLiked = likedIds.has(item.id);
    const isSaved = savedDiscussionIds.has(item.id);

    return (
      <View style={styles.discussionCard}>
        <View style={styles.discussionHeader}>
          <Avatar profile={item.profiles} />
          <Text numberOfLines={1} style={styles.discussionMeta}>
            <Text style={styles.username}>@{username}</Text>
            <Text style={styles.discussionTime}> · {timeAgo(item.created_at)}</Text>
          </Text>
        </View>

        <Text style={styles.discussionBody}>{item.body}</Text>

        <View style={styles.discussionFooter}>
          <Pressable onPress={() => toggleLike(item.id)} hitSlop={8}>
            <Text style={[styles.footerAction, isLiked && styles.likedAction]}>{isLiked ? '♥' : '♡'} {item.like_count ?? 0}</Text>
          </Pressable>
          <Text style={styles.footerAction}>💬 {item.reply_count ?? 0}</Text>
          <Pressable onPress={() => toggleDiscussionSave(item.id)} hitSlop={8} style={styles.footerSave}>
            <Text style={[styles.saveSmall, isSaved && styles.savedSmall]}>🔖</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const ListHeader = (
    <>
      {trend ? <TrendInfoCard trend={trend} /> : null}
      {trend ? <NewsSection trend={trend} /> : null}
      <View style={styles.discussionTitleRow}>
        <Text style={styles.discussionTitle}>討論區</Text>
        <Text style={styles.discussionCount}>{discussions.length} 則討論</Text>
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <SafeAreaView style={styles.safeHeader}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.back}>← 返回</Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.headerTitle}>{trend?.topic ?? 'Trend'}</Text>
          <View style={styles.headerActions}>
            <Pressable
              disabled={!hasTrendDetail}
              onPress={() => setDetailVisible(true)}
              hitSlop={10}
              style={[styles.headerIconButton, !hasTrendDetail && styles.headerIconDisabled]}
            >
              <Feather name="info" size={22} color={hasTrendDetail ? colors.textMuted : colors.bodyBorder} />
            </Pressable>
            <Pressable onPress={toggleTrendSave} hitSlop={10} style={styles.headerIconButton}>
              <Feather
                name="bookmark"
                size={21}
                color={savedTrend ? colors.primary : colors.textMuted}
              />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={discussions}
          keyExtractor={(item) => item.id}
          renderItem={renderDiscussion}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={<EmptyDiscussionState />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 12 }]}>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="分享你嘅睇法⋯"
          placeholderTextColor={colors.textMuted}
          returnKeyType="send"
          onSubmitEditing={submitDiscussion}
          style={styles.input}
        />
        <Pressable
          disabled={!canSend}
          onPress={submitDiscussion}
          style={({ pressed }) => [styles.sendButton, (!canSend || pressed) && styles.sendButtonDisabled]}
        >
          <Text style={styles.sendText}>→</Text>
        </Pressable>
      </View>

      <TrendDetailSheet
        trend={trend}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        bottomInset={insets.bottom}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  safeHeader: {
    backgroundColor: colors.bgBody
  },
  header: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.bodyBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  back: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    textAlign: 'center'
  },
  headerActions: {
    minWidth: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10
  },
  headerIconButton: {
    width: 28,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerIconDisabled: {
    opacity: 0.45
  },
  save: {
    width: 46,
    color: colors.text,
    fontSize: 20,
    textAlign: 'right'
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  listContent: {
    paddingTop: 16,
    paddingHorizontal: 16
  },
  trendCard: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    padding: 16,
    marginBottom: 22
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  trendTopicWrap: {
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
    fontSize: 20,
    lineHeight: 25
  },
  heat: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  angleList: {
    marginTop: 16,
    gap: 14
  },
  angleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  angleEmoji: {
    width: 24,
    fontSize: 20
  },
  angleName: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14
  },
  anglePercent: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  progressTrack: {
    width: 76,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.bodyBorder,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary
  },
  detailSection: {
    marginBottom: 16
  },
  detailTitle: {
    marginBottom: 12,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    fontWeight: '700'
  },
  detailCard: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 12,
    backgroundColor: colors.bgBodyMuted,
    padding: 14
  },
  detailLabel: {
    marginBottom: 6,
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  detailText: {
    color: '#3A3A3A',
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6
  },
  linkText: {
    flex: 1,
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    textDecorationLine: 'underline'
  },
  newsSection: {
    marginBottom: 22
  },
  newsTitle: {
    marginBottom: 10,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  newsItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee'
  },
  newsItemLast: {
    borderBottomWidth: 0
  },
  newsItemTitle: {
    color: '#1a1a1a',
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    lineHeight: 19
  },
  newsItemMeta: {
    marginTop: 5,
    color: '#888888',
    fontFamily: fonts.body,
    fontSize: 12
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.bgBody,
    paddingTop: 10,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.bodyBorder,
    marginBottom: 12
  },
  sheetHeader: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    fontWeight: '700'
  },
  sheetCloseButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sheetContent: {
    paddingTop: 8
  },
  discussionTitleRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12
  },
  discussionTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  discussionCount: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14
  },
  discussionCard: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    padding: 16,
    marginBottom: 12
  },
  discussionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgBodyMuted
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarInitial: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  discussionMeta: {
    flex: 1,
    fontSize: 14
  },
  username: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  discussionTime: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  discussionBody: {
    marginTop: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  discussionFooter: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18
  },
  footerAction: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  likedAction: {
    color: colors.primary,
    fontFamily: fonts.bodyBold
  },
  footerSave: {
    marginLeft: 'auto'
  },
  saveSmall: {
    color: colors.textMuted,
    fontSize: 16
  },
  savedSmall: {
    color: colors.primary
  },
  emptyState: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  emptyEmoji: {
    fontSize: 48
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
    textAlign: 'center'
  },
  inputBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: colors.bodyBorder,
    backgroundColor: colors.bgBody,
    paddingTop: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center'
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: colors.bgBodyMuted,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  sendButton: {
    marginLeft: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendButtonDisabled: {
    opacity: 0.4
  },
  sendText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  pressed: {
    opacity: 0.72
  }
});
