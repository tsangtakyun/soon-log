import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ClipPlayer from '@/components/ClipPlayer';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';

type ClipDetail = {
  id: string;
  room_id: string;
  user_id: string;
  caption: string | null;
  notes: string | null;
  media_urls: string[];
  video_url: string | null;
  time_str: string | null;
  date_str: string | null;
  caption_align: 'left' | 'center' | 'right' | null;
  overlay_vertical: 'top' | 'middle' | 'bottom' | null;
  text_size: 'small' | 'medium' | 'large' | null;
  background_color: 'cream' | 'black' | null;
  like_count?: number | null;
  reply_count?: number | null;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  angle: string | null;
};

export default function ClipDetailScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');
  const { id } = useLocalSearchParams<{ id: string }>();
  const clipId = Array.isArray(id) ? id[0] : id;
  const [clip, setClip] = useState<ClipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    async function loadClip() {
      if (!clipId) return;
      setLoading(true);

      try {
        const { data, error } = await supabase
          .from('topic_clips')
          .select('*, profile:profiles!topic_clips_user_id_fkey(username, display_name, avatar_url)')
          .eq('id', clipId)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('找不到 Clip');

        const { data: membership } = await supabase
          .from('topic_room_members')
          .select('angle')
          .eq('room_id', data.room_id)
          .eq('user_id', data.user_id)
          .maybeSingle();

        setClip({
          ...data,
          username: data.profile?.username ?? null,
          display_name: data.profile?.display_name ?? null,
          avatar_url: data.profile?.avatar_url ?? null,
          angle: membership?.angle ?? null
        } as ClipDetail);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '載入失敗';
        Alert.alert('錯誤', message);
        router.back();
      } finally {
        setLoading(false);
      }
    }

    loadClip();
  }, [clipId]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!clip) return null;

  return (
    <View style={styles.screen}>
      <ClipPlayer
        clip={clip}
        width={width}
        height={height}
        onDoubleTap={() => setLiked((value) => !value)}
      />

      <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.backButton, { top: insets.top + 12 }]}>
        <Text style={styles.backText}>← 返回</Text>
      </Pressable>

      <View style={[styles.infoBar, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.authorRow}>
          {clip.avatar_url ? (
            <Image source={{ uri: clip.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{(clip.display_name || clip.username || 'S').slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.authorText}>
            <Text style={styles.username}>@{clip.username || 'soon'}</Text>
            {clip.angle ? <Text numberOfLines={1} style={styles.angle}>{clip.angle}</Text> : null}
          </View>
        </View>
        <View style={styles.actionRow}>
          <Text style={[styles.actionText, liked && styles.likedText]}>{liked ? '♥' : '♡'} Like</Text>
          <Text style={styles.actionText}>💬 Comment</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000'
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000'
  },
  backButton: {
    position: 'absolute',
    left: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  backText: {
    color: '#fff',
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  infoBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.58)'
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#222'
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#5C2A22',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarInitial: {
    color: '#fff',
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  authorText: {
    flex: 1
  },
  username: {
    color: '#fff',
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  angle: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.65)',
    fontFamily: fonts.body,
    fontSize: 12
  },
  caption: {
    marginTop: 12,
    color: '#fff',
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 21
  },
  actionRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 18
  },
  actionText: {
    color: 'rgba(255,255,255,0.76)',
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  likedText: {
    color: '#5C2A22'
  }
});
