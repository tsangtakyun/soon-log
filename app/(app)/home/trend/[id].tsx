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
type NewsItem = {
  title: string;
  original_title?: string;
  source: string;
  url: string;
  published_at: string;
};
type NewsHeadline = string | Partial<NewsItem>;
type NewsHeadlinesValue = NewsHeadline[] | string | null;
type Trend = {
  id: string;
  topic: string;
  icon: string | null;
  heat_score: number | null;
  angles: TrendAngle[];
  news_headlines?: NewsHeadlinesValue;
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
type DiscussionReply = {
  id: string;
  discussion_id: string;
  author_id: string;
  body: string;
  like_count: number | null;
  created_at: string;
  profiles?: DiscussionProfile | null;
};
type DiscussionSort = 'hot' | 'recent';

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 日前`;
}

function getRelativeTime(isoString: string): string {
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return '';

  const diff = Math.max(0, Date.now() - time);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 60) return `${mins}分前`;
  if (hours < 24) return `${hours}時前`;
  return `${days}天前`;
}

function parseNewsItems(value?: NewsHeadlinesValue) {
  let raw: unknown = value;

  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(raw)) return [];

  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  return raw.map((item) => {
    if (!item || typeof item === 'string') return null;

    const headline = item as Partial<NewsItem>;
    const title = (headline.title || '').trim();
    const url = (headline.url || '').trim();
    const publishedAt = (headline.published_at || '').trim();

    if (!title || !url || !publishedAt) return null;

    const publishedTime = new Date(publishedAt).getTime();
    if (Number.isNaN(publishedTime) || publishedTime < sevenDaysAgo) return null;

    return {
      title,
      original_title: headline.original_title?.trim(),
      url,
      source: (headline.source || '').trim(),
      published_at: publishedAt
    };
  })
    .filter(Boolean)
    .sort((a, b) => (
      new Date((b as NewsItem).published_at).getTime()
      - new Date((a as NewsItem).published_at).getTime()
    ))
    .slice(0, 10) as NewsItem[];
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
      <View style={styles.newsHeader}>
        <Text style={styles.newsTitle}>相關新聞</Text>
        <Text style={styles.newsCount}>{newsItems.length} 則</Text>
      </View>
      {newsItems.map((item, index) => (
        <Pressable
          key={`${item.url}-${index}`}
          onPress={() => Linking.openURL(item.url)}
          style={({ pressed }) => [
            styles.newsItem,
            index === newsItems.length - 1 && styles.newsItemLast,
            pressed && styles.newsItemPressed
          ]}
        >
          <Text numberOfLines={2} style={styles.newsItemTitle}>{item.title}</Text>
          <Text style={styles.newsItemMeta}>
            {item.source || 'News'} · {getRelativeTime(item.published_at)}
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

function DiscussionSortToggle({
  value,
  onChange
}: {
  value: DiscussionSort;
  onChange: (value: DiscussionSort) => void;
}) {
  return (
    <View style={styles.discussionSort}>
      {[
        { key: 'hot' as const, label: '熱門' },
        { key: 'recent' as const, label: '最近' }
      ].map((option) => (
        <Pressable
          key={option.key}
          onPress={() => onChange(option.key)}
          style={[styles.sortChip, value === option.key && styles.sortChipActive]}
        >
          <Text style={[styles.sortChipText, value === option.key && styles.sortChipTextActive]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function DiscussionThreadSheet({
  discussion,
  replies,
  loading,
  replyText,
  canReply,
  onChangeReply,
  onSubmitReply,
  onClose,
  bottomInset
}: {
  discussion: Discussion | null;
  replies: DiscussionReply[];
  loading: boolean;
  replyText: string;
  canReply: boolean;
  onChangeReply: (value: string) => void;
  onSubmitReply: () => void;
  onClose: () => void;
  bottomInset: number;
}) {
  if (!discussion) return null;

  const username = discussion.profiles?.username || 'soon';

  return (
    <Modal visible={Boolean(discussion)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.threadOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.threadKeyboard}
        >
          <View style={[styles.threadSheet, { paddingBottom: bottomInset + 12 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.threadHeader}>
              <Text style={styles.threadTitle}>留言串</Text>
              <Pressable onPress={onClose} hitSlop={10} style={styles.threadCloseButton}>
                <Feather name="x" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.threadContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.threadOriginal}>
                <View style={styles.threadOriginalHeader}>
                  <Avatar profile={discussion.profiles} />
                  <Text numberOfLines={1} style={styles.discussionMeta}>
                    <Text style={styles.username}>@{username}</Text>
                    <Text style={styles.discussionTime}> · {timeAgo(discussion.created_at)}</Text>
                  </Text>
                </View>
                <Text style={styles.threadOriginalBody}>{discussion.body}</Text>
                <View style={styles.threadStats}>
                  <Text style={styles.threadStat}>♡ {discussion.like_count ?? 0}</Text>
                  <Text style={styles.threadStat}>💬 {discussion.reply_count ?? replies.length}</Text>
                </View>
              </View>

              <View style={styles.threadRepliesHeader}>
                <Text style={styles.threadRepliesTitle}>回覆</Text>
                <Text style={styles.threadRepliesCount}>{replies.length} 則</Text>
              </View>

              {loading ? (
                <View style={styles.threadLoading}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : replies.length === 0 ? (
                <View style={styles.threadEmpty}>
                  <Text style={styles.threadEmptyText}>仲未有回覆</Text>
                  <Text style={styles.threadEmptySubtext}>接住呢個留言繼續傾。</Text>
                </View>
              ) : (
                replies.map((reply) => (
                  <View key={reply.id} style={styles.replyRow}>
                    <Avatar profile={reply.profiles} />
                    <View style={styles.replyBodyWrap}>
                      <Text numberOfLines={1} style={styles.discussionMeta}>
                        <Text style={styles.username}>@{reply.profiles?.username || 'soon'}</Text>
                        <Text style={styles.discussionTime}> · {timeAgo(reply.created_at)}</Text>
                      </Text>
                      <Text style={styles.replyText}>{reply.body}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.threadInputRow}>
              <TextInput
                value={replyText}
                onChangeText={onChangeReply}
                placeholder="回覆呢個留言⋯"
                placeholderTextColor={colors.textMuted}
                style={styles.threadInput}
                multiline
              />
              <Pressable
                disabled={!canReply}
                onPress={onSubmitReply}
                style={({ pressed }) => [styles.threadSendButton, (!canReply || pressed) && styles.sendButtonDisabled]}
              >
                <Feather name="arrow-up" size={18} color={colors.textOnDark} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function TrendDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string }>();
  const trendId = Array.isArray(id) ? id[0] : id;
  const returnPath = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const { user, profile } = useAuth();
  const [trend, setTrend] = useState<Trend | null>(null);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedTrend, setSavedTrend] = useState(false);
  const [savedDiscussionIds, setSavedDiscussionIds] = useState<Set<string>>(new Set());
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailVisible, setDetailVisible] = useState(false);
  const [discussionSort, setDiscussionSort] = useState<DiscussionSort>('hot');
  const [selectedDiscussion, setSelectedDiscussion] = useState<Discussion | null>(null);
  const [threadReplies, setThreadReplies] = useState<DiscussionReply[]>([]);
  const [threadReplyText, setThreadReplyText] = useState('');
  const [loadingThread, setLoadingThread] = useState(false);
  const canSend = inputText.trim().length > 0;
  const canReply = threadReplyText.trim().length > 0;

  const discussionIds = useMemo(() => discussions.map((discussion) => discussion.id), [discussions]);
  const sortedDiscussions = useMemo(() => {
    const next = [...discussions];
    if (discussionSort === 'recent') {
      return next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return next.sort((a, b) => {
      const hotA = (a.like_count ?? 0) + (a.reply_count ?? 0) * 2;
      const hotB = (b.like_count ?? 0) + (b.reply_count ?? 0) * 2;
      if (hotB !== hotA) return hotB - hotA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [discussionSort, discussions]);
  const hasTrendDetail = Boolean(
    trend?.description
    || trend?.why_trending
    || trend?.creator_tips
    || (trend?.related_links?.length ?? 0) > 0
  );

  function handleBack() {
    if (returnPath) {
      router.replace(returnPath as never);
      return;
    }
    router.back();
  }

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

  async function loadThreadReplies(discussionId: string) {
    setLoadingThread(true);
    const { data, error } = await supabase
      .from('trend_discussion_replies')
      .select('*, profiles!trend_discussion_replies_author_id_fkey(username, avatar_url, display_name)')
      .eq('discussion_id', discussionId)
      .order('created_at', { ascending: true });

    setThreadReplies(error ? [] : (data ?? []) as DiscussionReply[]);
    setLoadingThread(false);
  }

  function openDiscussionThread(discussion: Discussion) {
    setSelectedDiscussion(discussion);
    setThreadReplyText('');
    loadThreadReplies(discussion.id);
  }

  async function submitThreadReply() {
    const body = threadReplyText.trim();
    if (!body || !user || !selectedDiscussion) return;

    const discussionId = selectedDiscussion.id;
    const optimisticReply: DiscussionReply = {
      id: `local-reply-${Date.now()}`,
      discussion_id: discussionId,
      author_id: user.id,
      body,
      like_count: 0,
      created_at: new Date().toISOString(),
      profiles: {
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null
      }
    };

    setThreadReplyText('');
    setThreadReplies((current) => [...current, optimisticReply]);
    setSelectedDiscussion((current) => current?.id === discussionId
      ? { ...current, reply_count: (current.reply_count ?? 0) + 1 }
      : current);
    setDiscussions((current) => current.map((discussion) => discussion.id === discussionId
      ? { ...discussion, reply_count: (discussion.reply_count ?? 0) + 1 }
      : discussion));

    const { data, error } = await supabase
      .from('trend_discussion_replies')
      .insert({ discussion_id: discussionId, author_id: user.id, body })
      .select('*, profiles!trend_discussion_replies_author_id_fkey(username, avatar_url, display_name)')
      .single();

    if (error) {
      setThreadReplies((current) => current.filter((reply) => reply.id !== optimisticReply.id));
      setThreadReplyText(body);
      setSelectedDiscussion((current) => current?.id === discussionId
        ? { ...current, reply_count: Math.max(0, (current.reply_count ?? 1) - 1) }
        : current);
      setDiscussions((current) => current.map((discussion) => discussion.id === discussionId
        ? { ...discussion, reply_count: Math.max(0, (discussion.reply_count ?? 1) - 1) }
        : discussion));
      Alert.alert('回覆失敗', '請稍後再試');
      return;
    }

    setThreadReplies((current) => [
      ...current.filter((reply) => reply.id !== optimisticReply.id),
      data as DiscussionReply
    ]);
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
      <Pressable
        onPress={() => openDiscussionThread(item)}
        style={({ pressed }) => [styles.discussionCard, pressed && styles.discussionCardPressed]}
      >
        <View style={styles.discussionHeader}>
          <Avatar profile={item.profiles} />
          <Text numberOfLines={1} style={styles.discussionMeta}>
            <Text style={styles.username}>@{username}</Text>
            <Text style={styles.discussionTime}> · {timeAgo(item.created_at)}</Text>
          </Text>
        </View>

        <Text style={styles.discussionBody}>{item.body}</Text>

        <View style={styles.discussionFooter}>
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              toggleLike(item.id);
            }}
            hitSlop={8}
          >
            <Text style={[styles.footerAction, isLiked && styles.likedAction]}>{isLiked ? '♥' : '♡'} {item.like_count ?? 0}</Text>
          </Pressable>
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              openDiscussionThread(item);
            }}
            hitSlop={8}
          >
            <Text style={styles.footerAction}>💬 {item.reply_count ?? 0}</Text>
          </Pressable>
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              toggleDiscussionSave(item.id);
            }}
            hitSlop={8}
            style={styles.footerSave}
          >
            <Text style={[styles.saveSmall, isSaved && styles.savedSmall]}>🔖</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  };

  const ListHeader = (
    <>
      {trend ? <NewsSection trend={trend} /> : null}
      {trend ? <TrendInfoCard trend={trend} /> : null}
      <View style={styles.discussionTitleRow}>
        <View>
          <Text style={styles.discussionTitle}>討論區</Text>
          <Text style={styles.discussionCount}>{discussions.length} 則討論</Text>
        </View>
        <DiscussionSortToggle value={discussionSort} onChange={setDiscussionSort} />
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <SafeAreaView style={styles.safeHeader}>
        <View style={styles.header}>
          <Pressable onPress={handleBack} hitSlop={10}>
            <Text style={styles.back}>← 返回</Text>
          </Pressable>
          <View style={styles.headerCenterSpacer} />
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
          data={sortedDiscussions}
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
      <DiscussionThreadSheet
        discussion={selectedDiscussion}
        replies={threadReplies}
        loading={loadingThread}
        replyText={threadReplyText}
        canReply={canReply}
        onChangeReply={setThreadReplyText}
        onSubmitReply={submitThreadReply}
        onClose={() => {
          setSelectedDiscussion(null);
          setThreadReplies([]);
          setThreadReplyText('');
        }}
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
  headerCenterSpacer: {
    flex: 1
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
    marginBottom: 22,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  newsHeader: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  newsTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  newsCount: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14
  },
  newsItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee'
  },
  newsItemLast: {
    borderBottomWidth: 0
  },
  newsItemPressed: {
    opacity: 0.6
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
  discussionSort: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 999,
    backgroundColor: colors.bgBodyCard,
    padding: 3
  },
  sortChip: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5
  },
  sortChipActive: {
    backgroundColor: colors.primary
  },
  sortChipText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  sortChipTextActive: {
    color: colors.textOnDark
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
  discussionCardPressed: {
    opacity: 0.72
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
  threadOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  threadKeyboard: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  threadSheet: {
    maxHeight: '88%',
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
  threadHeader: {
    minHeight: 40,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  threadTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  threadCloseButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  threadContent: {
    paddingTop: 8,
    paddingBottom: 16
  },
  threadOriginal: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    padding: 14
  },
  threadOriginalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  threadOriginalBody: {
    marginTop: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 23
  },
  threadStats: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18
  },
  threadStat: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  threadRepliesHeader: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  threadRepliesTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  threadRepliesCount: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  threadLoading: {
    paddingVertical: 28,
    alignItems: 'center'
  },
  threadEmpty: {
    paddingVertical: 28,
    alignItems: 'center'
  },
  threadEmptyText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  threadEmptySubtext: {
    marginTop: 5,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.bodyBorder
  },
  replyBodyWrap: {
    flex: 1
  },
  replyText: {
    marginTop: 6,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  threadInputRow: {
    borderTopWidth: 1,
    borderTopColor: colors.bodyBorder,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8
  },
  threadInput: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: colors.bgBodyMuted,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  threadSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pressed: {
    opacity: 0.72
  }
});
