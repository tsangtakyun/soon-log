import { Feather } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ClipPlayer from '@/components/ClipPlayer';
import { useAuth } from '@/hooks/useAuth';
import { FriendProfile, loadCollaboratorProfiles } from '@/lib/friends';
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
  overlay_vertical: 'top' | 'middle' | 'bottom' | null;
  text_size: 'small' | 'medium' | 'large' | null;
  background_color: 'cream' | 'black' | null;
  like_count: number | null;
  comment_count: number | null;
  liked_by_me?: boolean;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
};

type ClipComment = {
  id: string;
  clip_id: string;
  user_id: string;
  body: string;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
};

type SelectedImage = {
  id: string;
  previewUri: string;
  base64: string;
};
type StarProps = {
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
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

function FriendPickerModal({
  visible,
  friends,
  members,
  inviting,
  onInvite,
  onOpenFriends,
  onClose
}: {
  visible: boolean;
  friends: FriendProfile[];
  members: Member[];
  inviting: boolean;
  onInvite: (friend: FriendProfile) => void;
  onOpenFriends: () => void;
  onClose: () => void;
}) {
  const memberIds = new Set(members.map((member) => member.user_id));
  const availableFriends = friends.filter((friend) => !memberIds.has(friend.id));
  const hasFriends = friends.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.friendModalOverlay}>
        <View style={styles.friendModalSheet}>
          <View style={styles.friendModalHeader}>
            <View>
              <Text style={styles.friendModalTitle}>加入好友到 Room</Text>
              <Text style={styles.friendModalSubtitle}>先喺好友頁加人，再喺呢度揀入房。</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.friendModalClose}>
              <Feather name="x" size={18} color={colors.text} />
            </Pressable>
          </View>

          {availableFriends.length === 0 ? (
            <View style={styles.friendEmpty}>
              <Feather name="user-plus" size={34} color="#d1d5db" />
              <Text style={styles.friendEmptyTitle}>{hasFriends ? '好友已經加入晒呢個 Room' : '未有可加入嘅好友'}</Text>
              {hasFriends ? (
                <View style={styles.friendJoinedList}>
                  {friends.map((friend) => {
                    const name = friend.display_name || friend.username || '好友';
                    return (
                      <View key={friend.id} style={styles.friendRow}>
                        {friend.avatar_url ? (
                          <Image source={{ uri: friend.avatar_url }} style={styles.friendAvatar} />
                        ) : (
                          <View style={styles.friendAvatarFallback}>
                            <Text style={styles.friendAvatarText}>{name.slice(0, 1).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={styles.friendTextWrap}>
                          <Text numberOfLines={1} style={styles.friendName}>{name}</Text>
                          <Text numberOfLines={1} style={styles.friendUsername}>@{friend.username || 'soon'} · 已在 Room</Text>
                        </View>
                        <Feather name="check" size={20} color={colors.success} />
                      </View>
                    );
                  })}
                </View>
              ) : null}
              <Pressable onPress={hasFriends ? onClose : onOpenFriends} style={({ pressed }) => [styles.friendPrimaryButton, pressed && styles.pressed]}>
                <Text style={styles.friendPrimaryButtonText}>{hasFriends ? '返回' : '去好友加人'}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.friendList}>
              {availableFriends.map((friend) => {
                const name = friend.display_name || friend.username || '好友';
                return (
                  <Pressable key={friend.id} disabled={inviting} onPress={() => onInvite(friend)} style={({ pressed }) => [styles.friendRow, pressed && styles.pressed]}>
                    {friend.avatar_url ? (
                      <Image source={{ uri: friend.avatar_url }} style={styles.friendAvatar} />
                    ) : (
                      <View style={styles.friendAvatarFallback}>
                        <Text style={styles.friendAvatarText}>{name.slice(0, 1).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={styles.friendTextWrap}>
                      <Text numberOfLines={1} style={styles.friendName}>{name}</Text>
                      <Text numberOfLines={1} style={styles.friendUsername}>@{friend.username || 'soon'}</Text>
                    </View>
                    {inviting ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="plus" size={20} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 日前`;
}

function AnimatedStar({ x, y, size, color, delay }: StarProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000 + Math.random() * 1000,
          delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(opacity, {
          toValue: 0.2,
          duration: 1000 + Math.random() * 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -3,
          duration: 2000 + Math.random() * 2000,
          delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(translateY, {
          toValue: 3,
          duration: 2000 + Math.random() * 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    ).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }]
      }}
    />
  );
}

function StarField({ heroHeight, screenWidth }: { heroHeight: number; screenWidth: number }) {
  const stars = useMemo(() => Array.from({ length: 52 }, (_, index) => ({
    id: index,
    x: Math.random() * screenWidth,
    y: Math.random() * heroHeight,
    size: 1 + Math.random() * 3,
    color: `rgba(255,255,255,${0.25 + Math.random() * 0.65})`,
    delay: Math.random() * 2000
  })), [heroHeight, screenWidth]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map(({ id, ...star }) => <AnimatedStar key={id} {...star} />)}
    </View>
  );
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
  const screenWidth = Dimensions.get('window').width;
  const heroHeight = insets.top + 420;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [membershipRole, setMembershipRole] = useState<'owner' | 'member' | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [friendSheetOpen, setFriendSheetOpen] = useState(false);
  const [roomFriends, setRoomFriends] = useState<FriendProfile[]>([]);
  const [invitingFriend, setInvitingFriend] = useState(false);
  const memberAngles = useMemo(() => new Map(members.map((member) => [member.user_id, member.angle])), [members]);
  const isMember = Boolean(membershipRole);
  const isOwner = membershipRole === 'owner';
  const goBackToEggs = useCallback(() => {
    router.replace('/(app)/log');
  }, []);

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
        avatar_url: clip.profile?.avatar_url ?? null,
        liked_by_me: false
      })) as Clip[];

      if (user && clipRows.length > 0) {
        const { data: likesData, error: likesError } = await supabase
          .from('topic_clip_likes')
          .select('clip_id')
          .eq('user_id', user.id)
          .in('clip_id', clipRows.map((clip) => clip.id));

        if (likesError) throw likesError;
        const likedIds = new Set((likesData ?? []).map((like) => like.clip_id));
        clipRows.forEach((clip) => {
          clip.liked_by_me = likedIds.has(clip.id);
        });
      }

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
      goBackToEggs();
    } finally {
      setLoading(false);
    }
  }, [goBackToEggs, id, user]);

  useEffect(() => {
    loadRoom();
    const channel = supabase
      .channel(`topic-room-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_rooms', filter: `id=eq.${id}` }, () => loadRoom())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_room_members', filter: `room_id=eq.${id}` }, () => loadRoom())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'topic_clips', filter: `room_id=eq.${id}` }, () => loadRoom())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'topic_clips', filter: `room_id=eq.${id}` }, () => loadRoom())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loadRoom]);

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

  const openFriendPicker = async () => {
    if (!user) return;
    try {
      setRoomFriends(await loadCollaboratorProfiles(user.id));
    } catch {
      setRoomFriends([]);
    }
    setFriendSheetOpen(true);
  };

  const inviteFriendToRoom = async (friend: FriendProfile) => {
    if (!user || !room || invitingFriend) return;
    setInvitingFriend(true);
    try {
      const response = await fetch('https://idea-brainstorm.vercel.app/api/topic-room/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: room.id,
          invitedBy: user.id,
          userId: friend.id
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '邀請失敗');

      await loadRoom();
      Alert.alert(payload.alreadyMember ? '已在 Room' : '已加入 Room', `@${friend.username || '好友'} 可以一齊上載片段。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '請稍後再試';
      Alert.alert('邀請失敗', message);
    } finally {
      setInvitingFriend(false);
    }
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
        <Pressable onPress={goBackToEggs} hitSlop={10}>
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
          <StarField heroHeight={heroHeight} screenWidth={screenWidth} />
          <View style={styles.heroContent}>
            <View style={styles.heroTop}>
              <Pressable onPress={goBackToEggs} hitSlop={10}>
                <Text style={styles.heroBack}>← 返回</Text>
              </Pressable>
              <View style={styles.heroActions}>
                <Text style={styles.heroBadge}>{room.privacy === 'open' ? '🌐 Open Studio' : '🔒 私密'}</Text>
                {isOwner ? (
                  <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10} style={styles.settingsButton}>
                    <Feather name="settings" size={20} color="rgba(255,255,255,0.7)" />
                  </Pressable>
                ) : null}
              </View>
            </View>
            <Text style={styles.roomTitle}>{room.name}</Text>
            {room.description ? <Text style={styles.topicText}>{room.description}</Text> : null}

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
                  <Text numberOfLines={2} style={styles.memberAngle}>{member.display_name || member.username || '成員'}</Text>
                </View>
              ))}
              {isMember ? (
                <Pressable onPress={openFriendPicker} style={styles.addMember}>
                  <Feather name="user-plus" size={18} color={colors.textOnDark} />
                  <Text style={styles.addMemberText}>加入成員</Text>
                </Pressable>
              ) : null}
            </ScrollView>

            {!isMember && room.privacy === 'open' ? (
              <Pressable onPress={joinStudio} style={({ pressed }) => [styles.joinButton, pressed && styles.pressed]}>
                <Text style={styles.joinButtonText}>+ 加入 Studio</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionTitle}>最新影片</Text>
          {clips.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>尚未有影片</Text>
              <Text style={styles.emptyBody}>在這裡分享你今日發生的事</Text>
            </View>
          ) : null}
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} angle={memberAngles.get(clip.user_id)} />
          ))}
        </View>
      </ScrollView>

      <FriendPickerModal
        visible={friendSheetOpen}
        friends={roomFriends}
        members={members}
        inviting={invitingFriend}
        onInvite={inviteFriendToRoom}
        onOpenFriends={() => {
          setFriendSheetOpen(false);
          router.push('/(app)/friends');
        }}
        onClose={() => setFriendSheetOpen(false)}
      />

      {isMember ? (
        <>
          <Pressable
            onPress={() => router.push({
              pathname: '/(app)/log/camera',
              params: { room_id: Array.isArray(id) ? id[0] : id }
            })}
            style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 22 }, pressed && styles.pressed]}
          >
            <Text style={styles.fabText}>+ 新增影片</Text>
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
  const { user } = useAuth();
  const playerWidth = Dimensions.get('window').width - 32;
  const playerHeight = playerWidth * (16 / 9);
  const [liked, setLiked] = useState(Boolean(clip.liked_by_me));
  const [likeCount, setLikeCount] = useState(clip.like_count ?? 0);
  const [commentCount, setCommentCount] = useState(clip.comment_count ?? 0);
  const [commentsOpen, setCommentsOpen] = useState(false);

  useEffect(() => {
    setLiked(Boolean(clip.liked_by_me));
    setLikeCount(clip.like_count ?? 0);
    setCommentCount(clip.comment_count ?? 0);
  }, [clip.comment_count, clip.like_count, clip.liked_by_me]);

  const toggleLike = async () => {
    if (!user) {
      Alert.alert('請先登入', '登入後即可為影片按讚。');
      return;
    }

    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((count) => Math.max(0, count + (wasLiked ? -1 : 1)));

    const { error } = wasLiked
      ? await supabase
        .from('topic_clip_likes')
        .delete()
        .eq('clip_id', clip.id)
        .eq('user_id', user.id)
      : await supabase
        .from('topic_clip_likes')
        .insert({ clip_id: clip.id, user_id: user.id });

    if (error) {
      setLiked(wasLiked);
      setLikeCount((count) => Math.max(0, count + (wasLiked ? 1 : -1)));
      Alert.alert('操作失敗', error.message);
    }
  };

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
        <Pressable onPress={toggleLike} hitSlop={8}>
          <Text style={[styles.clipActionText, liked && styles.clipActionLiked]}>{liked ? '♥' : '♡'} {likeCount}</Text>
        </Pressable>
        <Pressable onPress={() => setCommentsOpen(true)} hitSlop={8}>
          <Text style={styles.clipActionText}>💬 {commentCount}</Text>
        </Pressable>
      </View>
      <ClipCommentsSheet
        clip={clip}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCommentAdded={() => setCommentCount((count) => count + 1)}
      />
    </View>
  );
}

function ClipCommentsSheet({
  clip,
  visible,
  onClose,
  onCommentAdded
}: {
  clip: Clip;
  visible: boolean;
  onClose: () => void;
  onCommentAdded: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [comments, setComments] = useState<ClipComment[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadComments = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('topic_clip_comments')
      .select('*, profile:profiles!topic_clip_comments_user_id_fkey(username, avatar_url)')
      .eq('clip_id', clip.id)
      .order('created_at', { ascending: true });

    setLoading(false);
    if (error) {
      Alert.alert('載入留言失敗', error.message);
      return;
    }

    setComments((data ?? []).map((comment) => ({
      ...comment,
      username: comment.profile?.username ?? null,
      avatar_url: comment.profile?.avatar_url ?? null
    })) as ClipComment[]);
  }, [clip.id, visible]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const submitComment = async () => {
    const text = body.trim();
    if (!text || sending) return;
    if (!user) {
      Alert.alert('請先登入', '登入後即可留言。');
      return;
    }

    setSending(true);
    setBody('');
    const { error } = await supabase.from('topic_clip_comments').insert({
      clip_id: clip.id,
      user_id: user.id,
      body: text
    });
    setSending(false);

    if (error) {
      setBody(text);
      Alert.alert('留言失敗', error.message);
      return;
    }

    onCommentAdded();
    await loadComments();
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={[styles.commentsSheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.commentsHeader}>
            <Text style={styles.commentsTitle}>留言</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.commentsList} contentContainerStyle={styles.commentsListContent} keyboardShouldPersistTaps="handled">
            {loading ? <ActivityIndicator color={colors.primary} /> : null}
            {!loading && comments.length === 0 ? (
              <View style={styles.commentEmpty}>
                <Text style={styles.commentEmptyTitle}>尚未有留言</Text>
                <Text style={styles.commentEmptyBody}>成為第一個回應這段影片的人。</Text>
              </View>
            ) : null}
            {comments.map((comment) => (
              <View key={comment.id} style={styles.commentRow}>
                {comment.avatar_url ? (
                  <Image source={{ uri: comment.avatar_url }} style={styles.commentAvatar} />
                ) : (
                  <View style={styles.commentAvatarFallback}>
                    <Text style={styles.commentInitial}>{(comment.username || 'S').slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.commentContent}>
                  <View style={styles.commentMeta}>
                    <Text style={styles.commentUsername}>@{comment.username || 'soon'}</Text>
                    <Text style={styles.commentTime}>{timeAgo(comment.created_at)}</Text>
                  </View>
                  <Text style={styles.commentBody}>{comment.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.commentInputRow}>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="寫下你的留言..."
              placeholderTextColor={colors.textMuted}
              style={styles.commentInput}
              returnKeyType="send"
              onSubmitEditing={submitComment}
            />
            <Pressable
              onPress={submitComment}
              disabled={!body.trim() || sending}
              style={[styles.commentSendButton, (!body.trim() || sending) && styles.commentSendDisabled]}
            >
              {sending ? <ActivityIndicator color={colors.textOnDark} /> : <Feather name="send" size={17} color={colors.textOnDark} />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  const [subtitle, setSubtitle] = useState(room.description ?? '');
  const [isOpen, setIsOpen] = useState(room.privacy === 'open');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(room.name);
    setSubtitle(room.description ?? '');
    setIsOpen(room.privacy === 'open');
  }, [room.description, room.name, room.privacy, visible]);

  const saveSettings = async () => {
    const nextName = name.trim();
    const nextSubtitle = subtitle.trim();
    if (!nextName || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from('topic_rooms')
      .update({ name: nextName, description: nextSubtitle || null, privacy: isOpen ? 'open' : 'private' })
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
            <Text style={styles.settingsLabel}>房間名稱</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="房間名稱"
              placeholderTextColor={colors.textMuted}
              style={styles.sheetInput}
            />
          </View>

          <View style={styles.settingsField}>
            <Text style={styles.settingsLabel}>副題</Text>
            <TextInput
              value={subtitle}
              onChangeText={setSubtitle}
              placeholder="副題 / 題材描述"
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
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.bgHero,
    paddingHorizontal: 16,
    paddingBottom: 20
  },
  heroContent: {
    position: 'relative',
    zIndex: 1
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
  settingsButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center'
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
    width: 92,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10
  },
  addMemberText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 12
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
  clipActionLiked: {
    color: colors.primary
  },
  commentsSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.bgBody,
    paddingTop: 10
  },
  commentsHeader: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.bodyBorder
  },
  commentsTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  commentsList: {
    maxHeight: 380
  },
  commentsListContent: {
    padding: 18,
    gap: 14
  },
  commentEmpty: {
    alignItems: 'center',
    paddingVertical: 32
  },
  commentEmptyTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  commentEmptyBody: {
    marginTop: 6,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bgBodyMuted
  },
  commentAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  commentInitial: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  commentContent: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: colors.bgBodyMuted,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  commentUsername: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  commentTime: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  commentBody: {
    marginTop: 5,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20
  },
  commentInputRow: {
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.bodyBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  commentInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: colors.bgBodyMuted,
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15
  },
  commentSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  commentSendDisabled: {
    opacity: 0.45
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
  friendModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  friendModalSheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.bgBody,
    padding: 18
  },
  friendModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14
  },
  friendModalTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  friendModalSubtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  friendModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgBodyMuted
  },
  friendEmpty: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12
  },
  friendEmptyTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  friendPrimaryButton: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18
  },
  friendPrimaryButtonText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  friendList: {
    gap: 10,
    paddingBottom: 12
  },
  friendJoinedList: {
    alignSelf: 'stretch',
    gap: 10,
    width: '100%'
  },
  friendRow: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  friendAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.bgBodyMuted
  },
  friendAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  friendAvatarText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  friendTextWrap: {
    flex: 1
  },
  friendName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  friendUsername: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  pressed: {
    opacity: 0.72
  }
});
