import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
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

type Room = {
  id: string;
  name: string;
  description: string | null;
  topic: string;
  privacy: 'private' | 'open';
  owner_id: string;
  invite_code: string | null;
  created_at: string;
  updated_at: string | null;
  member_count?: number;
};

type Member = {
  id: string;
  room_id: string;
  user_id: string;
  angle: string | null;
  role: 'owner' | 'member';
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type Clip = {
  id: string;
  room_id: string;
  user_id: string;
  caption: string | null;
  notes: string | null;
  media_urls: string[];
  video_url: string | null;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
};

type SelectedImage = {
  id: string;
  previewUri: string;
  base64: string;
};

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 日前`;
}

function base64ToArrayBuffer(base64: string) {
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const byteLength = Math.floor((cleanBase64.length * 3) / 4) - (cleanBase64.endsWith('==') ? 2 : cleanBase64.endsWith('=') ? 1 : 0);
  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;

  for (let index = 0; index < cleanBase64.length; index += 4) {
    const chunk =
      (lookup.indexOf(cleanBase64[index]) << 18) |
      (lookup.indexOf(cleanBase64[index + 1]) << 12) |
      ((cleanBase64[index + 2] === '=' ? 0 : lookup.indexOf(cleanBase64[index + 2])) << 6) |
      (cleanBase64[index + 3] === '=' ? 0 : lookup.indexOf(cleanBase64[index + 3]));

    if (byteIndex < byteLength) bytes[byteIndex++] = (chunk >> 16) & 255;
    if (byteIndex < byteLength) bytes[byteIndex++] = (chunk >> 8) & 255;
    if (byteIndex < byteLength) bytes[byteIndex++] = chunk & 255;
  }

  return bytes.buffer;
}

async function uploadImages(clipId: string, selectedImages: SelectedImage[]): Promise<string[]> {
  const urls: string[] = [];

  for (const image of selectedImages) {
    const fileName = `topic-clips/${clipId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const { error } = await supabase.storage
      .from('log-media')
      .upload(fileName, base64ToArrayBuffer(image.base64), { contentType: 'image/jpeg' });
    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from('log-media').getPublicUrl(fileName);
    urls.push(publicUrl);
  }

  return urls;
}

export default function TopicRoomScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const memberAngles = useMemo(() => new Map(members.map((member) => [member.user_id, member.angle])), [members]);
  const isOwner = Boolean(user && room?.owner_id === user.id);

  const loadRoom = useCallback(async () => {
    if (!id) return;
    const [{ data: roomData, error: roomError }, { data: memberData, error: memberError }, { data: clipData, error: clipError }] = await Promise.all([
      supabase.from('topic_rooms').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('topic_room_members')
        .select('*, profile:profiles!topic_room_members_user_id_fkey(username, avatar_url, display_name)')
        .eq('room_id', id),
      supabase
        .from('topic_clips')
        .select('*, profile:profiles!topic_clips_user_id_fkey(username, avatar_url)')
        .eq('room_id', id)
        .order('created_at', { ascending: false })
    ]);

    if (roomError) console.error('Room fetch error:', JSON.stringify(roomError));
    if (memberError) console.error('Members fetch error:', JSON.stringify(memberError));
    if (clipError) console.error('Clips fetch error:', JSON.stringify(clipError));

    const memberRows = (memberData ?? []).map((member) => ({
      ...member,
      username: member.profile?.username ?? null,
      display_name: member.profile?.display_name ?? null,
      avatar_url: member.profile?.avatar_url ?? null
    })) as Member[];

    const clipRows = (clipData ?? []).map((clip) => ({
      ...clip,
      username: clip.profile?.username ?? null,
      avatar_url: clip.profile?.avatar_url ?? null
    })) as Clip[];

    setRoom(roomData ? { ...(roomData as Room), member_count: memberRows.length } : null);
    setMembers(memberRows);
    setClips(clipRows);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadRoom();
    const channel = supabase
      .channel(`topic-room-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_rooms', filter: `id=eq.${id}` }, () => loadRoom())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_room_members', filter: `room_id=eq.${id}` }, () => loadRoom())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_clips', filter: `room_id=eq.${id}` }, () => loadRoom())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loadRoom]);

  const copyInviteCode = () => {
    Alert.alert('邀請碼', room?.invite_code ?? '');
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!room) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← 返回</Text>
        </Pressable>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>找不到 Topic Room</Text>
          <Text style={styles.emptyBody}>可能已被移除，或者你未有權限。</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 116 }}>
        <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
          <View style={styles.heroTop}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={styles.heroBack}>← 返回</Text>
            </Pressable>
            <Text style={styles.heroBadge}>{room.privacy === 'open' ? '🌐 Open Studio' : '🔒 私密'}</Text>
          </View>
          <Text style={styles.roomTitle}>{room.name}</Text>
          <Text style={styles.topicText}>{room.topic}</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.membersRow}>
            {members.map((member) => (
              <View key={member.id} style={styles.memberItem}>
                {member.avatar_url ? (
                  <Image source={{ uri: member.avatar_url }} style={styles.memberAvatar} />
                ) : (
                  <View style={styles.memberAvatarFallback}>
                    <Text style={styles.memberInitial}>{(member.display_name || member.username || 'S').slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <Text numberOfLines={2} style={styles.memberAngle}>{member.angle || '未設定角度'}</Text>
              </View>
            ))}
            <Pressable onPress={() => Alert.alert('邀請隊友', `邀請碼：${room.invite_code ?? ''}`)} style={styles.addMember}>
              <Text style={styles.addMemberText}>＋</Text>
            </Pressable>
          </ScrollView>

          {isOwner ? (
            <View style={styles.invitePill}>
              <Text style={styles.inviteText}>邀請碼：{room.invite_code}</Text>
              <Pressable onPress={copyInviteCode} hitSlop={8}>
                <Text style={styles.copyText}>Copy</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionTitle}>最新 Clips</Text>
          {clips.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>仲未有 clips</Text>
              <Text style={styles.emptyBody}>係呢個 topic room 分享你嘅製作過程</Text>
            </View>
          ) : null}
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} angle={memberAngles.get(clip.user_id)} />
          ))}
        </View>
      </ScrollView>

      <Pressable onPress={() => setSheetOpen(true)} style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 22 }, pressed && styles.pressed]}>
        <Text style={styles.fabText}>+ 新增 Clip</Text>
      </Pressable>
      <AddClipSheet
        roomId={room.id}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          setSheetOpen(false);
          loadRoom();
        }}
      />
    </View>
  );
}

function ClipCard({ clip, angle }: { clip: Clip; angle?: string | null }) {
  return (
    <View style={styles.clipCard}>
      <View style={styles.clipHeader}>
        {clip.avatar_url ? (
          <Image source={{ uri: clip.avatar_url }} style={styles.clipAvatar} />
        ) : (
          <View style={styles.clipAvatarFallback}>
            <Text style={styles.clipInitial}>{(clip.username || 'S').slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.clipMeta}>
          <Text style={styles.clipUsername}>@{clip.username || 'soon'}</Text>
          <Text style={styles.clipTime}>{timeAgo(clip.created_at)}</Text>
        </View>
        {angle ? <Text numberOfLines={1} style={styles.angleBadge}>{angle}</Text> : null}
      </View>
      {clip.caption ? <Text style={styles.caption}>{clip.caption}</Text> : null}
      {clip.media_urls?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>
          {clip.media_urls.map((url) => <Image key={url} source={{ uri: url }} style={styles.thumbnail} />)}
        </ScrollView>
      ) : null}
      {clip.notes ? <Text style={styles.notes}>📝 製作筆記：{clip.notes}</Text> : null}
      {clip.video_url ? <Text style={styles.videoUrl}>{clip.video_url}</Text> : null}
      <Text style={styles.actions}>♡ Like   💬 Comment</Text>
    </View>
  );
}

function AddClipSheet({
  roomId,
  visible,
  onClose,
  onSaved
}: {
  roomId: string;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [caption, setCaption] = useState('');
  const [notes, setNotes] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [saving, setSaving] = useState(false);

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要相片權限', '請允許 SOON-LOG 存取相片。');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 4 - images.length),
      quality: 0.8,
      base64: true,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible
    });

    if (!result.canceled) {
      const nextImages = result.assets
        .filter((asset) => Boolean(asset.base64))
        .map((asset) => ({
          id: `${asset.uri}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          previewUri: `data:image/jpeg;base64,${asset.base64}`,
          base64: asset.base64 as string
        }));
      setImages((current) => [...current, ...nextImages].slice(0, 4));
    }
  };

  const submit = async () => {
    if (!user || saving) return;
    setSaving(true);
    const clipId = Crypto.randomUUID();
    try {
      const mediaUrls = await uploadImages(clipId, images);
      const { error } = await supabase.from('topic_clips').insert({
        id: clipId,
        room_id: roomId,
        user_id: user.id,
        caption: caption.trim() || null,
        notes: notes.trim() || null,
        media_urls: mediaUrls,
        video_url: videoUrl.trim() || null
      });
      if (error) throw error;
      setCaption('');
      setNotes('');
      setVideoUrl('');
      setImages([]);
      onSaved();
    } catch (error) {
      Alert.alert('新增失敗', error instanceof Error ? error.message : '請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>分享製作進度</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="今日做咗咩..."
            placeholderTextColor={colors.textMuted}
            style={styles.sheetInput}
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="製作筆記、靈感、挑戰..."
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.sheetInput, styles.sheetNotes]}
          />
          <Pressable onPress={pickImages} style={({ pressed }) => [styles.imagePicker, pressed && styles.pressed]}>
            <Text style={styles.imagePickerText}>＋ 選擇圖片（最多 4 張）</Text>
          </Pressable>
          {images.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewRow}>
              {images.map((image) => <Image key={image.id} source={{ uri: image.previewUri }} style={styles.preview} />)}
            </ScrollView>
          ) : null}
          <TextInput
            value={videoUrl}
            onChangeText={setVideoUrl}
            placeholder="Video URL（選填）"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={styles.sheetInput}
          />
          <Pressable onPress={submit} disabled={saving} style={({ pressed }) => [styles.sheetSubmit, (pressed || saving) && styles.pressed]}>
            {saving ? <ActivityIndicator color={colors.textOnDark} /> : <Text style={styles.sheetSubmitText}>分享 Clip</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  loading: {
    flex: 1,
    backgroundColor: colors.bgBody,
    alignItems: 'center',
    justifyContent: 'center'
  },
  hero: {
    backgroundColor: colors.bgHero,
    paddingHorizontal: 16,
    paddingBottom: 20
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  heroBack: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  heroBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  roomTitle: {
    marginTop: 28,
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    lineHeight: 34
  },
  topicText: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22
  },
  membersRow: {
    paddingTop: 22,
    gap: 14
  },
  memberItem: {
    width: 72,
    alignItems: 'center'
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgHeroSurface
  },
  memberAvatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  memberInitial: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  memberAngle: {
    marginTop: 8,
    color: colors.textOnDarkMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center'
  },
  addMember: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  addMemberText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 24
  },
  invitePill: {
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  inviteText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  copyText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  body: {
    padding: 16
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    marginBottom: 12
  },
  empty: {
    paddingVertical: 42,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  emptyBody: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center'
  },
  back: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  clipCard: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    padding: 14,
    marginBottom: 12
  },
  clipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  clipAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgBodyMuted
  },
  clipAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  clipInitial: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  clipMeta: {
    flex: 1
  },
  clipUsername: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  clipTime: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2
  },
  angleBadge: {
    maxWidth: 96,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  caption: {
    marginTop: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  mediaRow: {
    paddingTop: 12,
    gap: 8
  },
  thumbnail: {
    width: 112,
    height: 112,
    borderRadius: 12,
    backgroundColor: colors.bgBodyMuted
  },
  notes: {
    marginTop: 12,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20
  },
  videoUrl: {
    marginTop: 8,
    color: colors.primary,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  actions: {
    marginTop: 12,
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  fab: {
    position: 'absolute',
    right: 16,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
  },
  fabText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)'
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.bgBody,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.bodyBorder,
    marginBottom: 6
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  sheetInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 12,
    backgroundColor: colors.bgBodyCard,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: 12
  },
  sheetNotes: {
    height: 86,
    paddingTop: 12,
    textAlignVertical: 'top'
  },
  imagePicker: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.bodyBorder,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center'
  },
  imagePickerText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  previewRow: {
    gap: 8
  },
  preview: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.bgBodyMuted
  },
  sheetSubmit: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sheetSubmitText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  pressed: {
    opacity: 0.72
  }
});
