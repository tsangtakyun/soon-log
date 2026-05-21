import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
type Discussion = {
  id: string;
  trend_id: string;
  author_id: string;
  body: string;
  like_count: number | null;
  reply_count: number | null;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
  liked_by_me?: boolean;
};

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  return `${days} 日前`;
}

function TrendInfo({ trend }: { trend: Trend }) {
  return (
    <View style={styles.trendCard}>
      <View style={styles.trendHeader}>
        <View style={styles.trendTopic}>
          <Text style={styles.trendIcon}>{trend.icon || '🔥'}</Text>
          <Text style={styles.trendTitle}>{trend.topic}</Text>
        </View>
        <Text style={styles.heat}>🔥 {trend.heat_score ?? 0}</Text>
      </View>
      <View style={styles.angles}>
        {(trend.angles ?? []).map((angle) => (
          <View key={angle.name} style={styles.angleRow}>
            <Text style={styles.angleEmoji}>{angle.emoji}</Text>
            <Text numberOfLines={1} style={styles.angleName}>{angle.name}</Text>
            <Text style={styles.anglePercent}>{angle.percentage}%</Text>
            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, angle.percentage))}%` }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function TrendDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [trend, setTrend] = useState<Trend | null>(null);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);

  const loadTrend = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('trends').select('*').eq('id', id).maybeSingle();
    setTrend((data ?? null) as Trend | null);
  }, [id]);

  const loadDiscussions = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('trend_discussions')
      .select('*, profile:profiles!trend_discussions_author_id_fkey(username, avatar_url)')
      .eq('trend_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Discussion fetch error:', JSON.stringify(error));
      setDiscussions([]);
      return;
    }

    const rows = (data ?? []).map((row) => ({
      ...row,
      username: row.profile?.username ?? null,
      avatar_url: row.profile?.avatar_url ?? null
    })) as Discussion[];

    if (user && rows.length > 0) {
      const { data: likes } = await supabase
        .from('discussion_likes')
        .select('discussion_id')
        .eq('user_id', user.id)
        .in('discussion_id', rows.map((row) => row.id));
      const liked = new Set((likes ?? []).map((like) => like.discussion_id));
      setDiscussions(rows.map((row) => ({ ...row, liked_by_me: liked.has(row.id) })));
      return;
    }
    setDiscussions(rows);
  }, [id, user]);

  useEffect(() => {
    Promise.all([loadTrend(), loadDiscussions()]).finally(() => setLoading(false));
  }, [loadDiscussions, loadTrend]);

  const sendDiscussion = async () => {
    const trimmed = body.trim();
    if (!trimmed || !user || !id) return;
    setBody('');
    const { error } = await supabase.from('trend_discussions').insert({
      trend_id: id,
      author_id: user.id,
      body: trimmed
    });
    if (error) {
      console.error('Discussion insert error:', JSON.stringify(error));
      setBody(trimmed);
      return;
    }
    loadDiscussions();
  };

  const toggleLike = async (discussion: Discussion) => {
    if (!user) return;
    const currentlyLiked = Boolean(discussion.liked_by_me);
    setDiscussions((current) => current.map((item) => item.id === discussion.id
      ? {
        ...item,
        liked_by_me: !currentlyLiked,
        like_count: Math.max(0, (item.like_count ?? 0) + (currentlyLiked ? -1 : 1))
      }
      : item));

    const request = currentlyLiked
      ? supabase.from('discussion_likes').delete().eq('user_id', user.id).eq('discussion_id', discussion.id)
      : supabase.from('discussion_likes').insert({ user_id: user.id, discussion_id: discussion.id });
    const { error } = await request;
    if (error) loadDiscussions();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← 返回</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>{trend?.topic ?? 'Trend'}</Text>
        <Pressable onPress={() => undefined} hitSlop={10}>
          <Text style={styles.save}>🔖</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 92 }]} showsVerticalScrollIndicator={false}>
          {trend ? <TrendInfo trend={trend} /> : null}

          <Text style={styles.discussionTitle}>討論區</Text>
          {discussions.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyTitle}>仲未有人分享睇法</Text>
              <Text style={styles.emptyBody}>做第一個發表意見</Text>
            </View>
          ) : null}

          {discussions.map((discussion) => (
            <View key={discussion.id} style={styles.discussionCard}>
              <View style={styles.discussionHeader}>
                {discussion.avatar_url ? (
                  <Image source={{ uri: discussion.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitial}>{(discussion.username || 'S').slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.meta}>@{discussion.username || 'soon'} · {timeAgo(discussion.created_at)}</Text>
              </View>
              <Text style={styles.body}>{discussion.body}</Text>
              <Pressable onPress={() => toggleLike(discussion)} hitSlop={8}>
                <Text style={[styles.footer, discussion.liked_by_me && styles.liked]}>
                  👍 {discussion.like_count ?? 0}  💬 {discussion.reply_count ?? 0}
                </Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable style={styles.plusButton}>
          <Text style={styles.plusText}>＋</Text>
        </Pressable>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="分享你嘅睇法⋯"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        <Pressable onPress={sendDiscussion} style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}>
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
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.bodyBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgBody
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
    fontSize: 20
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    padding: 16
  },
  trendCard: {
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
  discussionTitle: {
    marginTop: 24,
    marginBottom: 12,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 42
  },
  emptyEmoji: {
    fontSize: 34
  },
  emptyTitle: {
    marginTop: 10,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  emptyBody: {
    marginTop: 6,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14
  },
  discussionCard: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    padding: 14,
    marginBottom: 12
  },
  discussionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgBodyMuted
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarInitial: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  meta: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  body: {
    marginTop: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  footer: {
    marginTop: 12,
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  liked: {
    color: colors.primary
  },
  inputBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: colors.bodyBorder,
    backgroundColor: colors.bgBody,
    paddingTop: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  plusButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgBodyMuted,
    alignItems: 'center',
    justifyContent: 'center'
  },
  plusText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  input: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: colors.bgBodyMuted,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: 14
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 22
  },
  pressed: {
    opacity: 0.72
  }
});
