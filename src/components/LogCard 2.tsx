import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/lib/theme';
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
  const name = profile?.display_name || profile?.username || '創作者';
  const avatar = profile?.avatar_url;
  const thumbnail = log.media_urls?.[0];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        {avatar ? <Image source={{ uri: avatar }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>}
        <View style={styles.identity}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>@{profile?.username ?? 'soon'} · {timeAgo(log.created_at)}</Text>
        </View>
      </View>

      {!!log.title && <Text style={styles.title}>{log.title}</Text>}
      <Text numberOfLines={2} style={styles.body}>{log.body}</Text>

      {!!thumbnail && <Image source={{ uri: thumbnail }} style={styles.thumbnail} />}

      <View style={styles.footer}>
        <Text style={styles.footerText}>♡ {log.like_count ?? 0}</Text>
        <Text style={styles.footerText}>留言 {log.comment_count ?? 0}</Text>
        {log.tags?.slice(0, 2).map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg
  },
  pressed: {
    backgroundColor: colors.bgMuted
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.bgMuted
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.purple
  },
  avatarText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  identity: {
    flex: 1
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
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 24,
    lineHeight: 28
  },
  body: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 8,
    backgroundColor: colors.bgMuted
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  footerText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  tag: {
    color: colors.gold,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  }
});
