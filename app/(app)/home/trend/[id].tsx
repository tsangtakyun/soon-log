import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type TrendAngle = { emoji: string; name: string; percentage: number };
type Trend = {
  id: string;
  topic: string;
  icon: string | null;
  heat_score: number | null;
  angles: TrendAngle[];
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

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function TrendInfoCard({ trend }: { trend: Trend }) {
  return (
    <View style={styles.trendCard}>
      <View style={styles.trendHeader}>
        <View style={styles.trendTopicWrap}>
          <Text style={styles.trendIcon}>{trend.icon || '🔥'}</Text>
          <Text numberOfLines={2} style={styles.trendTitle}>{trend.topic}</Text>
        </View>
        <Text style={styles.heat}>🔥 {trend.heat_score ?? 0}</Text>
      </View>

      <View style={styles.angleList}>
        {(trend.angles ?? []).map((angle) => (
          <View key={`${angle.emoji}-${angle.name}`} style={styles.angleRow}>
            <Text style={styles.angleEmoji}>{angle.emoji}</Text>
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
  const canSend = inputText.trim().length > 0;

  const discussionIds = useMemo(() => discussions.map((discussion) => discussion.id), [discussions]);

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

  const loadData = useCallback(async () => {
    if (!trendId) return;
    setLoading(true);

    const [{ data: trendData }, { data: discussionData, error: discussionError }] = await Promise.all([
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

    setTrend((trendData ?? null) as Trend | null);

    if (discussionError) {
      console.log('Trend discussions fetch error:', JSON.stringify(discussionError));
      setDiscussions([]);
      setLoading(false);
      return;
    }

    const rows = (discussionData ?? []) as Discussion[];
    setDiscussions(rows);
    await loadLikedStatus(rows.map((discussion) => discussion.id));
    setLoading(false);
  }, [loadLikedStatus, trendId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadLikedStatus(discussionIds);
  }, [discussionIds, loadLikedStatus]);

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

  function toggleDiscussionSave(discussionId: string) {
    setSavedDiscussionIds((prev) => {
      const next = new Set(prev);
      next.has(discussionId) ? next.delete(discussionId) : next.add(discussionId);
      return next;
    });
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
          <Pressable onPress={() => setSavedTrend((current) => !current)} hitSlop={10}>
            <Text style={[styles.save, savedTrend && styles.savedSmall]}>🔖</Text>
          </Pressable>
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
  }
});
