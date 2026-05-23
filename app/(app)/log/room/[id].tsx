import { Feather } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ClipPlayer from '@/components/ClipPlayer';
import { useAuth } from '@/hooks/useAuth';
import { sendPushNotification } from '@/lib/notifications';
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
  time_str: string | null;
  date_str: string | null;
  caption_align: 'left' | 'center' | 'right' | null;
  text_size: 'small' | 'medium' | 'large' | null;
  background_color: 'cream' | 'black' | null;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
};

type SelectedImage = {
  id: string;
  previewUri: string;
  base64: string;
};

type PushMember = {
  profile?: {
    expo_push_token: string | null;
    username: string | null;
  } | Array<{
    expo_push_token: string | null;
    username: string | null;
  }> | null;
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
  const [membershipRole, setMembershipRole] = useState<'owner' | 'member' | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const memberAngles = useMemo(() => new Map(members.map((member) => [member.user_id, member.angle])), [members]);
  const isMember = Boolean(membershipRole);
  const isOwner = membershipRole === 'owner';

  const loadRoom = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    try {
      const { data: roomData, error: roomError } = await supabase
        .from('topic_rooms')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (roomError) throw roomError;
      if (!roomData) throw new Error('找不到 Topic Room');

      const { data: memberData, error: memberError } = await supabase
        .from('topic_room_members')
        .select('*, profile:profiles!topic_room_members_user_id_fkey(username, avatar_url, display_name)')
        .eq('room_id', id);

      if (memberError) throw memberError;

      const { data: clipData, error: clipError } = await supabase
        .from('topic_clips')
        .select('*, profile:profiles!topic_clips_user_id_fkey(username, avatar_url)')
        .eq('room_id', id)
        .order('created_at', { ascending: false });

      if (clipError) throw clipError;

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

      setRoom({ ...(roomData as Room), member_count: memberRows.length });
      setMembers(memberRows);
      setClips(clipRows);

      if (user) {
        const { data: membership, error: membershipError } = await supabase
          .from('topic_room_members')
          .select('id, role')
          .eq('room_id', id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (membershipError) throw membershipError;
        setMembershipRole((membership?.role as 'owner' | 'member' | undefined) ?? null);
      } else {
        setMembershipRole(null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '載入失敗';
      Alert.alert('錯誤', message);
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, user]);

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

  const shareInviteCode = () => {
    if (!room?.invite_code) return;
    Share.share({
      message: '加入我嘅 Topic Room！\n邀請碼：' + room.invite_code + '\n\n喺 SOON-LOG app 入面，去 EGGS → 輸入邀請碼，輸入：' + room.invite_code
    });
  };

  const joinStudio = async () => {
    if (!user || !room) return;
    setMembershipRole('member');
    const { error } = await supabase
      .from('topic_room_members')
      .insert({ room_id: room.id, user_id: user.id, role: 'member' });

    if (error) {
      setMembershipRole(null);
      Alert.alert('加入失敗', error.message);
      return;
    }

    Alert.alert('已加入 Studio！');
    loadRoom();
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
            <View style={styles.heroActions}>
              <Text style={styles.heroBadge}>{room.privacy === 'open' ? '🌐 Open Studio' : '🔒 私密'}</Text>
              {isOwner ? (
                <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10}>
                  <Text style={styles.settingsGear}>⚙️</Text>
                </Pressable>
              ) : null}
            </View>
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
            {isMember ? (
              <Pressable onPress={() => Alert.alert('邀請隊友', `邀請碼：${room.invite_code ?? ''}`)} style={styles.addMember}>
                <Text style={styles.addMemberText}>＋</Text>
              </Pressable>
            ) : null}
          </ScrollView>

          {isOwner ? (
            <>
              <View style={styles.invitePill}>
                <Text style={styles.inviteText}>邀請碼：{room.invite_code}</Text>
                <Pressable onPress={copyInviteCode} hitSlop={8}>
                  <Text style={styles.copyText}>Copy</Text>
                </Pressable>
              </View>
              <Pressable onPress={shareInviteCode} style={({ pressed }) => [styles.shareInviteBtn, pressed && styles.pressed]}>
                <Feather name="share-2" size={16} color={colors.primary} />
                <Text style={styles.shareInviteText}>分享邀請碼</Text>
              </Pressable>
            </>
          ) : null}

          {!isMember && room.privacy === 'open' ? (
            <Pressable onPress={joinStudio} style={({ pressed }) => [styles.joinButton, pressed && styles.pressed]}>
              <Text style={styles.joinButtonText}>+ 加入 Studio</Text>
            </Pressable>
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

      {isMember ? (
        <>
          <Pressable
            onPress={() => router.push({
              pathname: '/(app)/log/camera',
              params: { room_id: Array.isArray(id) ? id[0] : id }
            })}
            style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 22 }, pressed && styles.pressed]}
          >
            <Text style={styles.fabText}>+ 新增 Clip</Text>
          </Pressable>
          <AddClipSheet
            room={room}
            visible={sheetOpen}
            onClose={() => setSheetOpen(false)}
            onSaved={() => {
              setSheetOpen(false);
              loadRoom();
            }}
          />
        </>
      ) : null}
      {isOwner ? (
        <RoomSettingsSheet
          room={room}
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            loadRoom();
          }}
        />
      ) : null}
    </View>
  );
}

function ClipCard({ clip, angle }: { clip: Clip; angle?: string | null }) {
  const playerWidth = Dimensions.get('window').width - 32;
  const playerHeight = playerWidth * (16 / 9);

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
      {(clip.video_url || clip.media_urls?.length > 0) ? (
        <View style={styles.clipPlayerWrap}>
          <ClipPlayer clip={clip} width={playerWidth} height={playerHeight} />
          <Pressable
            style={styles.clipOpenLayer}
            onPress={() => router.push(`/(app)/log/clip/${clip.id}`)}
          />
        </View>
      ) : null}
      {!clip.video_url && clip.caption ? <Text style={styles.caption}>{clip.caption}</Text> : null}
      {clip.notes ? <Text style={styles.notes}>📝 製作筆記：{clip.notes}</Text> : null}
      <View style={styles.clipActions}>
        <Pressable onPress={() => Alert.alert('Like', 'Coming soon')}>
          <Text style={styles.clipActionText}>♡ Like</Text>
        </Pressable>
        <Pressable onPress={() => Alert.alert('Comment', 'Coming soon')}>
          <Text style={styles.clipActionText}>💬 Comment</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AddClipSheet({
  room,
  visible,
  onClose,
  onSaved
}: {
  room: Room;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
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
        room_id: room.id,
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

      try {
        const { data: members } = await supabase
          .from('topic_room_members')
          .select('profile:profiles!topic_room_members_user_id_fkey(expo_push_token, username)')
          .eq('room_id', room.id)
          .neq('user_id', user.id);

        const username = profile?.username || user.email?.split('@')[0] || 'soon';
        await Promise.all(((members ?? []) as PushMember[]).map((member) => {
          const memberProfile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
          const token = memberProfile?.expo_push_token;
          if (!token) return Promise.resolve();
          return sendPushNotification(
            token,
            room.name,
            `@${username} 分享咗新製作進度`,
            { type: 'new_clip', room_id: room.id }
          );
        }));
      } catch {
        // Push notification failure should not affect clip creation.
      }
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

function RoomSettingsSheet({
  room,
  visible,
  onClose,
  onSaved
}: {
  room: Room;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(room.name);
  const [isOpen, setIsOpen] = useState(room.privacy === 'open');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(room.name);
    setIsOpen(room.privacy === 'open');
  }, [room.name, room.privacy, visible]);

  const saveSettings = async () => {
    const nextName = name.trim();
    if (!nextName || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from('topic_rooms')
      .update({ name: nextName, privacy: isOpen ? 'open' : 'private' })
      .eq('id', room.id);

    setSaving(false);
    if (error) {
      Alert.alert('儲存失敗', error.message);
      return;
    }
    onSaved();
  };

  const confirmDelete = () => {
    Alert.alert(
      '刪除 Topic Room',
      '刪除後所有成員、clips 同邀請碼都會一併移除。確定要刪除？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('topic_rooms').delete().eq('id', room.id);
            if (error) {
              Alert.alert('刪除失敗', error.message);
              return;
            }
            onClose();
            router.replace('/log');
          }
        }
      ]
    );
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>房間設定</Text>

          <View style={styles.settingsField}>
            <Text style={styles.settingsLabel}>題材名稱</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="題材名稱"
              placeholderTextColor={colors.textMuted}
              style={styles.sheetInput}
            />
          </View>

          <View style={styles.privacySetting}>
            <View style={styles.privacySettingText}>
              <Text style={styles.settingsLabel}>開放模式</Text>
              <Text style={styles.privacyDescription}>
                {isOpen ? '🌐 Open Studio — 任何人可以睇製作過程' : '🔒 私密 — 只有成員可以睇'}
              </Text>
            </View>
            <Switch
              value={isOpen}
              onValueChange={setIsOpen}
              trackColor={{ false: colors.bodyBorder, true: colors.primaryLight }}
              thumbColor={isOpen ? colors.primary : colors.textMuted}
            />
          </View>

          <Pressable
            onPress={saveSettings}
            disabled={saving || !name.trim()}
            style={({ pressed }) => [styles.sheetSubmit, (pressed || saving || !name.trim()) && styles.pressed]}
          >
            {saving ? <ActivityIndicator color={colors.textOnDark} /> : <Text style={styles.sheetSubmitText}>儲存設定</Text>}
          </Pressable>

          <Pressable onPress={confirmDelete} style={styles.deleteRoomButton}>
            <Text style={styles.deleteRoomText}>刪除 Topic Room</Text>
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
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
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
  settingsGear: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 20
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
  shareInviteBtn: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  shareInviteText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    fontWeight: '600'
  },
  joinButton: {
    alignSelf: 'flex-start',
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  joinButtonText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 14
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
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    marginBottom: 12
  },
  clipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14
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
    paddingHorizontal: 14,
    paddingTop: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  clipPlayerWrap: {
    position: 'relative',
    backgroundColor: colors.bgHero
  },
  clipOpenLayer: {
    ...StyleSheet.absoluteFillObject
  },
  notes: {
    paddingHorizontal: 14,
    paddingTop: 12,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20
  },
  clipActions: {
    padding: 14,
    flexDirection: 'row',
    gap: 16
  },
  clipActionText: {
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
  settingsField: {
    gap: 8
  },
  settingsLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  privacySetting: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  privacySettingText: {
    flex: 1,
    gap: 6
  },
  privacyDescription: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18
  },
  deleteRoomButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  deleteRoomText: {
    color: colors.error,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  pressed: {
    opacity: 0.72
  }
});
