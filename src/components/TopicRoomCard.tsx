import { Feather } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

const cardWidth = Dimensions.get('window').width - 32;
const clipCellWidth = cardWidth / 3;

export type TopicRoomCardRoom = {
  id: string;
  name: string;
  topic: string;
  privacy: string;
  owner_id: string;
  updated_at: string;
  created_at?: string;
  member_count?: number;
  clip_count?: number;
  latest_clips?: Array<{
    id: string;
    video_url?: string | null;
    media_urls?: string[] | null;
    time_str?: string | null;
    date_str?: string | null;
    user_id: string;
    created_at?: string;
  }>;
  owner?: {
    username: string;
    avatar_url?: string | null;
    display_name?: string | null;
  };
  members?: Array<{
    user_id: string;
    profiles?: {
      username: string;
      avatar_url?: string | null;
      display_name?: string | null;
    } | null;
  }>;
};

type TopicRoomCardProps = {
  room: TopicRoomCardRoom;
  onPress: () => void;
  isVisible?: boolean;
};

function relativeTime(value?: string | null) {
  if (!value) return '未有更新';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 日前`;
}

function AvatarStack({ members = [] }: { members?: TopicRoomCardRoom['members'] }) {
  const visible = members.slice(0, 3);

  return (
    <View style={styles.avatarStack}>
      {visible.map((member, index) => {
        const profile = member.profiles;
        const name = profile?.display_name || profile?.username || 'C';
        return profile?.avatar_url ? (
          <Image
            key={member.user_id}
            source={{ uri: profile.avatar_url }}
            style={[styles.memberAvatar, { marginLeft: index === 0 ? 0 : -8 }]}
          />
        ) : (
          <View key={member.user_id} style={[styles.memberAvatarFallback, { marginLeft: index === 0 ? 0 : -8 }]}>
            <Text style={styles.memberInitial}>{name.slice(0, 1).toUpperCase()}</Text>
          </View>
        );
      })}
    </View>
  );
}

function VideoThumbnail({ videoUrl, shouldPlay }: { videoUrl: string; shouldPlay: boolean }) {
  const player = useVideoPlayer(videoUrl, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
  });

  useEffect(() => {
    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, shouldPlay]);

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay' && shouldPlay) {
      player.play();
    }
  });

  useEventListener(player, 'playToEnd', () => {
    if (shouldPlay) {
      player.replay();
    }
  });

  return (
    <VideoView
      player={player}
      style={styles.videoThumb}
      nativeControls={false}
      contentFit="cover"
      allowsVideoFrameAnalysis={false}
      onFirstFrameRender={() => player.play()}
    />
  );
}

function ClipStrip({ clips = [], isVisible = false }: { clips?: TopicRoomCardRoom['latest_clips']; isVisible?: boolean }) {
  const visible = clips.slice(0, 3);

  if (visible.length === 0) {
    return (
      <View style={styles.emptyStrip}>
        <Feather name="video" size={26} color="rgba(255,255,255,0.55)" />
      </View>
    );
  }

  return (
    <View style={styles.clipStrip}>
      {visible.map((clip) => (
        <View key={clip.id} style={styles.clipCell}>
          {clip.video_url ? (
            <VideoThumbnail videoUrl={clip.video_url} shouldPlay={isVisible} />
          ) : Array.isArray(clip.media_urls) && clip.media_urls[0] ? (
            <Image source={{ uri: clip.media_urls[0] }} style={styles.clipImage} resizeMode="cover" />
          ) : (
            <View style={styles.cleanClipFallback}>
              <Feather name="video" size={24} color="#555" />
            </View>
          )}
        </View>
      ))}
      {visible.length < 3
        ? Array.from({ length: 3 - visible.length }).map((_, index) => (
            <View key={`placeholder-${index}`} style={[styles.clipCell, styles.clipPlaceholder]}>
              <Feather name="video" size={18} color="rgba(255,255,255,0.35)" />
            </View>
          ))
        : null}
    </View>
  );
}

export function TopicRoomCard({ room, onPress, isVisible = false }: TopicRoomCardProps) {
  const memberCount = room.member_count ?? room.members?.length ?? 0;
  const clipCount = room.clip_count ?? room.latest_clips?.length ?? 0;
  const latestClip = room.latest_clips?.[0];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <ClipStrip clips={room.latest_clips} isVisible={isVisible} />

      {latestClip?.time_str || latestClip?.date_str ? (
        <View style={styles.timeBar}>
          <Feather name="clock" size={12} color={colors.textMuted} />
          <Text style={styles.timeBarText}>
            {[latestClip.time_str, latestClip.date_str].filter(Boolean).join('  ')}
          </Text>
          <View style={styles.timeBarSpacer} />
          <Text style={styles.latestLabel}>最新片段</Text>
        </View>
      ) : null}

      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.name}>{room.name}</Text>
          <View style={[styles.privacyBadge, room.privacy === 'open' ? styles.openBadge : styles.privateBadge]}>
            <Text style={[styles.privacyText, room.privacy === 'open' ? styles.openText : styles.privateText]}>
              {room.privacy === 'open' ? '公開' : '私人'}
            </Text>
          </View>
        </View>

        <Text numberOfLines={1} style={styles.topic}>{room.topic}</Text>

        <View style={styles.metaRow}>
          <View style={styles.memberRow}>
            <AvatarStack members={room.members} />
            <Text style={styles.memberText}>{memberCount} 位成員</Text>
          </View>
          <Text style={styles.updateText}>影片數量：{clipCount} · {relativeTime(latestClip?.created_at ?? room.updated_at)}</Text>
        </View>

        {latestClip ? (
          <Text numberOfLines={1} style={styles.latestText}>
            最新：{latestClip.time_str || latestClip.date_str || '有新製作進度'}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyCard
  },
  clipStrip: {
    height: 120,
    flexDirection: 'row',
    backgroundColor: colors.bgHero
  },
  clipCell: {
    flex: 1,
    height: 120,
    overflow: 'hidden',
    backgroundColor: colors.bgHero
  },
  videoThumb: {
    width: clipCellWidth,
    height: 120,
    backgroundColor: colors.bgHero
  },
  clipImage: {
    width: '100%',
    height: 120,
    backgroundColor: colors.bgHero
  },
  cleanClipFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgHeroCard
  },
  clipPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.08)'
  },
  emptyStrip: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgHero
  },
  info: {
    padding: 12
  },
  timeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: colors.bgBodyMuted
  },
  timeBarText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    fontWeight: '500'
  },
  timeBarSpacer: {
    flex: 1
  },
  latestLabel: {
    color: '#9ca3af',
    fontFamily: fonts.body,
    fontSize: 11
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  name: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  privacyBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  openBadge: {
    backgroundColor: 'rgba(52,211,153,0.14)'
  },
  privateBadge: {
    backgroundColor: colors.bgBodyMuted
  },
  privacyText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11
  },
  openText: {
    color: '#059669'
  },
  privateText: {
    color: colors.textMuted
  },
  topic: {
    marginTop: 5,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8
  },
  memberAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bgBody
  },
  memberAvatarFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bgBody,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
  },
  memberInitial: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 10
  },
  memberText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  updateText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  latestText: {
    marginTop: 10,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  pressed: {
    opacity: 0.72
  }
});
