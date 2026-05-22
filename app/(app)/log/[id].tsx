import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Comment, Log, Profile } from '@/types';
import CreateTopicRoomScreen from './create-room';

type LogWithAuthor = Log & {
  profile?: Profile | null;
};

type CommentWithAuthor = Comment & {
  profile?: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null;
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

function avatarLabel(profile?: Pick<Profile, 'username' | 'display_name'> | null) {
  return (profile?.display_name ?? profile?.username ?? 'S').slice(0, 1).toUpperCase();
}

function Avatar({ profile, size }: { profile?: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null; size: number }) {
  if (profile?.avatar_url) {
    return <Image source={{ uri: profile.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }

  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarText}>{avatarLabel(profile)}</Text>
    </View>
  );
}

export default function LogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const logId = Array.isArray(id) ? id[0] : id;

  if (logId === 'create-room') {
    return <CreateTopicRoomScreen />;
  }

  return <LogDetailContent logId={logId} />;
}

function LogDetailContent({ logId }: { logId?: string }) {
  const { user } = useAuth();
  const [log, setLog] = useState<LogWithAuthor | null>(null);
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [commentText, setCommentText] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(true);

  const author = log?.profile;

  const fetchLikeCount = useCallback(async () => {
    if (!logId) return;
    const { count } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('log_id', logId);
    setLikeCount(count ?? 0);
  }, [logId]);

  const fetchComments = useCallback(async () => {
    if (!logId) return;
    const { data: commentsData, error: commentsError } = await supabase
      .from('comments')
      .select('*, profile:profiles!comments_user_id_fkey(username, display_name, avatar_url)')
      .eq('log_id', logId)
      .order('created_at', { ascending: true });

    if (commentsError) {
      console.error('Comments fetch error:', JSON.stringify(commentsError));
      return;
    }

    setComments((commentsData ?? []) as CommentWithAuthor[]);
    setCommentCount(commentsData?.length ?? 0);
  }, [logId]);

  const load = useCallback(async () => {
    if (!logId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('logs')
      .select('*, profile:profiles!logs_user_id_fkey(*)')
      .eq('id', logId)
      .single();

    if (error) {
      console.error('Log fetch error:', JSON.stringify(error));
      Alert.alert('載入失敗', error.message);
      setLoading(false);
      return;
    }

    setLog(data as LogWithAuthor);

    const [{ data: existingLike }, { count }] = await Promise.all([
      user
        ? supabase
          .from('likes')
          .select('*')
          .eq('log_id', logId)
          .eq('user_id', user.id)
          .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('log_id', logId)
    ]);

    setIsLiked(!!existingLike);
    setLikeCount(count ?? 0);
    await fetchComments();
    setLoading(false);
  }, [fetchComments, logId, user]);

  useEffect(() => {
    load().catch((error) => {
      console.error('Log detail load error:', JSON.stringify(error));
      setLoading(false);
      Alert.alert('載入失敗', error instanceof Error ? error.message : '請稍後再試。');
    });
  }, [load]);

  useEffect(() => {
    if (!logId) return;

    const likesChannel = supabase
      .channel(`likes-${logId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'likes',
        filter: `log_id=eq.${logId}`
      }, () => {
        fetchLikeCount();
      })
      .subscribe();

    const commentsChannel = supabase
      .channel(`comments-${logId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'comments',
        filter: `log_id=eq.${logId}`
      }, () => {
        fetchComments().catch(() => undefined);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(likesChannel);
      supabase.removeChannel(commentsChannel);
    };
  }, [fetchComments, fetchLikeCount, logId]);

  async function toggleLike() {
    if (!user || !logId) return;

    if (isLiked) {
      setLikeCount((count) => Math.max(0, count - 1));
      setIsLiked(false);
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('log_id', logId)
        .eq('user_id', user.id);
      if (error) {
        setLikeCount((count) => count + 1);
        setIsLiked(true);
        Alert.alert('取消喜歡失敗', error.message);
      }
      return;
    }

    setLikeCount((count) => count + 1);
    setIsLiked(true);
    const { error } = await supabase
      .from('likes')
      .insert({ log_id: logId, user_id: user.id });

    if (error) {
      setLikeCount((count) => Math.max(0, count - 1));
      setIsLiked(false);
      Alert.alert('喜歡失敗', error.message);
    }
  }

  async function submitComment() {
    if (!commentText.trim() || !user || !logId) return;

    const body = commentText.trim();
    setCommentText('');
    const { error } = await supabase.from('comments').insert({
      log_id: logId,
      user_id: user.id,
      body
    });

    if (error) {
      setCommentText(body);
      Alert.alert('留言失敗', error.message);
    }
  }

  const tagItems = useMemo(() => log?.tags?.filter(Boolean) ?? [], [log?.tags]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!log) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Text style={styles.emptyText}>找不到這篇紀錄。</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
          <View style={styles.topbar}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={styles.back}>返回</Text>
            </Pressable>
            <Text style={styles.topTitle}>紀錄</Text>
            <View style={styles.topbarSpacer} />
          </View>

          <View style={styles.header}>
            <Avatar profile={author} size={40} />
            <View style={styles.authorText}>
              <Text style={styles.displayName}>{author?.display_name || author?.username || '創作者'}</Text>
              <Text style={styles.username}>@{author?.username ?? 'soon'} · {timeAgo(log.created_at)}</Text>
            </View>
          </View>

          {!!log.title && <Text style={styles.title}>✦ {log.title}</Text>}
          <Text style={styles.body}>{log.body}</Text>

          {!!log.production_notes && (
            <View style={styles.notesSection}>
              <Pressable onPress={() => setNotesOpen((open) => !open)} style={styles.notesHeader}>
                <Text style={styles.notesLabel}>📝 製作筆記</Text>
                <Text style={styles.chevron}>{notesOpen ? '▲' : '▼'}</Text>
              </Pressable>
              {notesOpen ? <Text style={styles.notesBody}>{log.production_notes}</Text> : null}
            </View>
          )}

          {!!log.video_url && (
            <Pressable onPress={() => log.video_url && Linking.openURL(log.video_url)} style={styles.videoPill}>
              <Text style={styles.videoText}>▶ 睇片</Text>
            </Pressable>
          )}

          <Pressable onPress={() => Linking.openURL(`https://soon-core.vercel.app/logs/${log.id}`)} style={styles.coreLink}>
            <Text style={styles.coreLinkText}>在 SOON-CORE 查看</Text>
          </Pressable>

          {log.media_urls?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
              {log.media_urls.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.image} />
              ))}
            </ScrollView>
          ) : null}

          {tagItems.length ? (
            <View style={styles.tags}>
              {tagItems.map((tag) => (
                <Text key={tag} style={styles.tag}>✦ {tag}</Text>
              ))}
            </View>
          ) : null}

          <View style={styles.countRow}>
            <Text style={[styles.countText, isLiked && styles.likedText]}>{isLiked ? '♥' : '♡'} {likeCount}</Text>
            <Text style={styles.countText}>◌ {commentCount}</Text>
          </View>

          <View style={styles.commentsSection}>
            <Text style={styles.commentsTitle}>留言</Text>
            {comments.map((comment) => {
              const profile = comment.profile;
              return (
                <View key={comment.id} style={styles.commentRow}>
                  <Avatar profile={profile} size={28} />
                  <View style={styles.commentContent}>
                    <View style={styles.commentMeta}>
                      <Text style={styles.commentName}>{profile?.display_name || profile?.username || 'SOON'}</Text>
                      <Text style={styles.commentTime}>{timeAgo(comment.created_at)}</Text>
                    </View>
                    <Text style={styles.commentBody}>{comment.body}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
          <Pressable onPress={toggleLike} style={styles.heartButton} hitSlop={8}>
            <Text style={[styles.heartText, isLiked && styles.heartLiked]}>{isLiked ? '♥' : '♡'}</Text>
          </Pressable>
          <Text style={styles.bottomCount}>{commentCount}</Text>
          <TextInput
            value={commentText}
            onChangeText={setCommentText}
            placeholder="留言..."
            placeholderTextColor={colors.textMuted}
            style={styles.commentInput}
          />
          <Pressable onPress={submitComment} disabled={!commentText.trim()} style={[styles.sendButton, !commentText.trim() && styles.sendDisabled]}>
            <Text style={styles.sendText}>送出</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15
  },
  wrap: {
    paddingTop: 56,
    paddingBottom: 128,
    gap: 18
  },
  topbar: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  back: {
    color: colors.gold,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  topTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  topbarSpacer: {
    width: 34
  },
  header: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  avatarText: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  authorText: {
    flex: 1
  },
  displayName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  username: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2
  },
  title: {
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 28,
    lineHeight: 34
  },
  body: {
    paddingHorizontal: 16,
    color: '#3A3A3A',
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 26
  },
  notesSection: {
    marginHorizontal: 16,
    gap: 10
  },
  notesHeader: {
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bgMuted,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  notesLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  chevron: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  notesBody: {
    color: colors.textMuted,
    backgroundColor: colors.bgMuted,
    borderRadius: 12,
    padding: 16,
    fontFamily: fonts.body,
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 24
  },
  videoPill: {
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 9
  },
  videoText: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  coreLink: {
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  coreLinkText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  imageRow: {
    paddingHorizontal: 16
  },
  image: {
    width: 280,
    height: 350,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: colors.bgMuted
  },
  tags: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  tag: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.bgMuted,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  countRow: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  countText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  likedText: {
    color: colors.accent
  },
  commentsSection: {
    paddingHorizontal: 16,
    gap: 2
  },
  commentsTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    marginBottom: 8
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.bgMuted
  },
  commentContent: {
    flex: 1,
    gap: 4
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8
  },
  commentName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  commentTime: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11
  },
  commentBody: {
    color: '#3A3A3A',
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 26,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  heartButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border
  },
  heartText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 22
  },
  heartLiked: {
    color: colors.accent
  },
  bottomCount: {
    minWidth: 18,
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    textAlign: 'center'
  },
  commentInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14
  },
  sendButton: {
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  sendDisabled: {
    opacity: 0.42
  },
  sendText: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  }
});
