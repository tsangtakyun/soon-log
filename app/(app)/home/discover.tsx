import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Profile } from '@/types';

type Creator = Profile & {
  log_count: number;
  follower_count: number;
};

export default function DiscoverCreatorsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [creators, setCreators] = useState<Creator[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadCreators = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: followingRows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    const followingIds = new Set((followingRows ?? []).map((row) => row.following_id));
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user.id)
      .limit(50);

    if (error) {
      setCreators([]);
      setLoading(false);
      Alert.alert('載入失敗', error.message);
      return;
    }

    const candidates = ((profiles ?? []) as Profile[]).filter((profile) => !followingIds.has(profile.id));
    const candidateIds = candidates.map((profile) => profile.id);
    if (candidateIds.length === 0) {
      setCreators([]);
      setLoading(false);
      return;
    }

    const [{ data: logs }, { data: followers }] = await Promise.all([
      supabase
        .from('logs')
        .select('user_id')
        .eq('is_published', true)
        .in('user_id', candidateIds),
      supabase
        .from('follows')
        .select('following_id')
        .in('following_id', candidateIds)
    ]);

    const logCounts = new Map<string, number>();
    (logs ?? []).forEach((log) => {
      logCounts.set(log.user_id, (logCounts.get(log.user_id) ?? 0) + 1);
    });

    const followerCounts = new Map<string, number>();
    (followers ?? []).forEach((follow) => {
      followerCounts.set(follow.following_id, (followerCounts.get(follow.following_id) ?? 0) + 1);
    });

    setCreators(
      candidates
        .map((profile) => ({
          ...profile,
          log_count: logCounts.get(profile.id) ?? 0,
          follower_count: followerCounts.get(profile.id) ?? 0
        }))
        .sort((a, b) => b.follower_count - a.follower_count)
        .slice(0, 20)
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadCreators();
  }, [loadCreators]);

  const followCreator = async (creatorId: string) => {
    if (!user) return;
    setFollowedIds((current) => new Set([...current, creatorId]));
    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: user.id, following_id: creatorId });

    if (error) {
      setFollowedIds((current) => {
        const next = new Set(current);
        next.delete(creatorId);
        return next;
      });
      Alert.alert('追蹤失敗', error.message);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← 返回</Text>
        </Pressable>
        <Text style={styles.title}>發掘創作者</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={creators}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>暫時未有新創作者</Text>
              <Text style={styles.emptyBody}>你可能已經追蹤晒推薦名單。</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const displayName = item.display_name || item.username || '創作者';
            const isFollowed = followedIds.has(item.id);
            return (
              <View style={styles.creatorRow}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitial}>{displayName.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.creatorInfo}>
                  <Text numberOfLines={1} style={styles.creatorName}>{displayName}</Text>
                  <Text numberOfLines={1} style={styles.creatorUsername}>@{item.username}</Text>
                  <Text style={styles.creatorMeta}>{item.log_count} 個作品 · {item.follower_count} 位追蹤者</Text>
                </View>
                <Pressable
                  onPress={() => followCreator(item.id)}
                  disabled={isFollowed}
                  style={({ pressed }) => [
                    styles.followButton,
                    isFollowed && styles.followingButton,
                    pressed && !isFollowed && styles.pressed
                  ]}
                >
                  <Text style={[styles.followText, isFollowed && styles.followingText]}>{isFollowed ? '已追蹤' : '追蹤'}</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  header: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.bodyBorder
  },
  back: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  headerSpacer: {
    width: 54
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  list: {
    padding: 16,
    paddingBottom: 110
  },
  creatorRow: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgBodyMuted
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarInitial: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  creatorInfo: {
    flex: 1
  },
  creatorName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  creatorUsername: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  creatorMeta: {
    marginTop: 5,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  followButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  followingButton: {
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted
  },
  followText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  followingText: {
    color: colors.textMuted
  },
  empty: {
    paddingTop: 120,
    alignItems: 'center'
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
    fontSize: 14
  },
  pressed: {
    opacity: 0.72
  }
});
