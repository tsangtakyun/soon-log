import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Log } from '@/types';

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  return `${days} 日前`;
}

export function LogCard({ log, onPress }: { log: Log; onPress: () => void }) {
  const profile = log.profile;
  const username = profile?.username ?? 'soon';
  const displayName = profile?.display_name || username;
  const cover = log.media_urls?.[0];
  const hasCover = Boolean(cover);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {hasCover ? (
        <View style={styles.coverWrap}>
          <Image source={{ uri: cover }} style={styles.cover} />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.56)']}
            style={styles.coverGradient}
          >
            <Text style={styles.overlayName}>@{username}</Text>
          </LinearGradient>
        </View>
      ) : (
        <View style={styles.textOnlyHeader}>
          <Text style={styles.username}>@{username}</Text>
        </View>
      )}

      <View style={[styles.content, !hasCover && styles.textOnlyContent]}>
        {!!log.title && (
          <View style={styles.titleRow}>
            <Text style={styles.doodle}>✦</Text>
            <Text style={styles.title}>{log.title}</Text>
          </View>
        )}
        <Text numberOfLines={hasCover ? 2 : 4} style={styles.body}>{log.body}</Text>
        <Text style={styles.displayName}>{displayName}</Text>

        <View style={styles.footer}>
          <View style={styles.tags}>
            {log.tags?.slice(0, 2).map((tag) => (
              <Text key={tag} style={styles.tag}>✦ {tag}</Text>
            ))}
          </View>
          <View style={styles.metrics}>
            <Text style={[styles.metric, log.liked_by_me && styles.liked]}>{log.liked_by_me ? '♥' : '♡'} {log.like_count ?? 0}</Text>
            <Text style={styles.metric}>◌ {log.comment_count ?? 0}</Text>
          </View>
        </View>
        <Text style={styles.timestamp}>{timeAgo(log.created_at)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 10,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  pressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.92
  },
  coverWrap: {
    width: '100%',
    aspectRatio: 4 / 5,
    backgroundColor: colors.bgMuted
  },
  cover: {
    width: '100%',
    height: '100%'
  },
  coverGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
    justifyContent: 'flex-end',
    padding: 16
  },
  overlayName: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  textOnlyHeader: {
    paddingHorizontal: 18,
    paddingTop: 18
  },
  username: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  content: {
    padding: 16,
    gap: 10
  },
  textOnlyContent: {
    paddingTop: 12,
    paddingBottom: 20
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  doodle: {
    color: colors.gold,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    marginTop: 3
  },
  title: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 27,
    lineHeight: 31
  },
  body: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21
  },
  displayName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  tags: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  tag: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.bgMuted,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  metrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  metric: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  liked: {
    color: colors.accent
  },
  timestamp: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  }
});
