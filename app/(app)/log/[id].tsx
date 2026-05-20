import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Comment, Log } from '@/types';

export default function LogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [log, setLog] = useState<Log | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [notesOpen, setNotesOpen] = useState(true);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);

  const load = useCallback(async () => {
    const { data: logData, error } = await supabase
      .from('logs')
      .select('*, profile:profiles!logs_user_id_fkey(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    setLog(logData as Log);

    const [{ data: likeRows }, { data: myLike }, { data: commentRows }] = await Promise.all([
      supabase.from('likes').select('user_id').eq('log_id', id),
      user ? supabase.from('likes').select('log_id').eq('log_id', id).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('comments').select('*, profile:profiles!comments_user_id_fkey(*)').eq('log_id', id).order('created_at', { ascending: true })
    ]);

    setLikeCount(likeRows?.length ?? 0);
    setLiked(Boolean(myLike));
    setComments((commentRows ?? []) as Comment[]);
  }, [id, user]);

  useEffect(() => {
    load().catch((error) => Alert.alert('載入失敗', error.message));
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`log-detail-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes', filter: `log_id=eq.${id}` }, () => {
        supabase.from('likes').select('user_id').eq('log_id', id).then(({ data }) => setLikeCount(data?.length ?? 0));
        if (user) {
          supabase.from('likes').select('log_id').eq('log_id', id).eq('user_id', user.id).maybeSingle().then(({ data }) => setLiked(Boolean(data)));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `log_id=eq.${id}` }, async (payload) => {
        const next = payload.new as Comment;
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', next.user_id).maybeSingle();
        setComments((current) => current.some((item) => item.id === next.id) ? current : [...current, { ...next, profile }]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user]);

  const toggleLike = async () => {
    if (!user || !log) return;
    if (liked) {
      await supabase.from('likes').delete().eq('log_id', log.id).eq('user_id', user.id);
    } else {
      await supabase.from('likes').insert({ log_id: log.id, user_id: user.id });
    }
  };

  const submitComment = async () => {
    if (!user || !commentBody.trim()) return;
    const { error } = await supabase.from('comments').insert({ log_id: id, user_id: user.id, body: commentBody.trim() });
    if (error) {
      Alert.alert('留言失敗', error.message);
      return;
    }
    setCommentBody('');
  };

  if (!log) return <Screen><View /></Screen>;

  const profile = log.profile;
  const coreUrl = `https://soon-core.vercel.app/logs/${log.id}`;

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap}>
          <View style={styles.topbar}>
            <Pressable onPress={() => router.back()}><Text style={styles.link}>返回</Text></Pressable>
            <Text style={styles.topTitle}>紀錄</Text>
            <View style={{ width: 38 }} />
          </View>

          <Pressable onPress={() => profile?.username && router.push(`/(app)/profile/${profile.username}`)} style={styles.author}>
            {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{(profile?.username ?? 'S').slice(0, 1).toUpperCase()}</Text></View>}
            <View>
              <Text style={styles.name}>{profile?.display_name || profile?.username || '創作者'}</Text>
              <Text style={styles.meta}>@{profile?.username ?? 'soon'}</Text>
            </View>
          </Pressable>

          {!!log.title && <Text style={styles.title}>{log.title}</Text>}
          <Text style={styles.body}>{log.body}</Text>

          {log.media_urls?.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>
              {log.media_urls.map((uri) => <Image key={uri} source={{ uri }} style={styles.image} />)}
            </ScrollView>
          )}

          {!!log.production_notes && (
            <View style={styles.notes}>
              <Pressable onPress={() => setNotesOpen((value) => !value)} style={styles.notesHeader}>
                <Text style={styles.sectionTitle}>製作筆記</Text>
                <Text style={styles.link}>{notesOpen ? '收起' : '展開'}</Text>
              </Pressable>
              {notesOpen && <Text style={styles.noteBody}>{log.production_notes}</Text>}
            </View>
          )}

          <View style={styles.actions}>
            <Pressable onPress={toggleLike} style={[styles.likeButton, liked && styles.likeActive]}>
              <Text style={styles.likeText}>{liked ? '已喜歡' : '喜歡'} · {likeCount}</Text>
            </Pressable>
            <Pressable onPress={() => WebBrowser.openBrowserAsync(coreUrl)} style={styles.coreButton}>
              <Text style={styles.coreButtonText}>在 SOON-CORE 查看</Text>
            </Pressable>
            {!!log.video_url && <Text style={styles.video}>{log.platform ?? 'video'} · {log.video_url}</Text>}
          </View>

          <View style={styles.comments}>
            <Text style={styles.sectionTitle}>留言</Text>
            {comments.map((comment) => (
              <View key={comment.id} style={styles.comment}>
                <Text style={styles.commentName}>@{comment.profile?.username ?? 'soon'}</Text>
                <Text style={styles.commentBody}>{comment.body}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            value={commentBody}
            onChangeText={setCommentBody}
            placeholder="寫低你的回應"
            placeholderTextColor={colors.textMuted}
            style={styles.commentInput}
          />
          <Pressable onPress={submitComment} style={styles.send}><Text style={styles.sendText}>送出</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 58,
    paddingBottom: 110,
    gap: 16
  },
  topbar: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  topTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  link: {
    color: colors.gold,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  author: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  avatarText: {
    color: colors.text,
    fontFamily: fonts.bodyBold
  },
  name: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  meta: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  title: {
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 34,
    lineHeight: 38
  },
  body: {
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24
  },
  mediaRow: {
    paddingHorizontal: 16,
    gap: 12
  },
  image: {
    width: 290,
    height: 220,
    borderRadius: 8,
    backgroundColor: colors.bgCard
  },
  notes: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  noteBody: {
    marginTop: 10,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  actions: {
    paddingHorizontal: 16,
    gap: 10,
    alignItems: 'flex-start'
  },
  likeButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.bgCard
  },
  likeActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgMuted
  },
  likeText: {
    color: colors.text,
    fontFamily: fonts.bodyBold
  },
  coreButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: colors.bgMuted
  },
  coreButtonText: {
    color: colors.gold,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  video: {
    color: colors.gold,
    fontFamily: fonts.body,
    fontSize: 13
  },
  comments: {
    paddingHorizontal: 16,
    gap: 12
  },
  comment: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  commentName: {
    color: colors.gold,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  commentBody: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 4
  },
  inputBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 28,
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg
  },
  commentInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: colors.text,
    fontFamily: fonts.body,
    backgroundColor: colors.bgCard
  },
  send: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  sendText: {
    color: colors.text,
    fontFamily: fonts.bodyBold
  }
});
