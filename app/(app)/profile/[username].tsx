import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Log, Profile } from '@/types';

export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { user, profile: myProfile } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!username) return;
    setRefreshing(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();

    if (error) throw error;

    const [
      logsResult,
      followerResult,
      followingResult,
      followResult
    ] = await Promise.all([
      supabase.from('logs').select('*').eq('user_id', data.id).eq('is_published', true).order('created_at', { ascending: false }),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', data.id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', data.id),
      user ? supabase.from('follows').select('*').eq('follower_id', user.id).eq('following_id', data.id).maybeSingle() : Promise.resolve({ data: null, error: null })
    ]);

    if (logsResult.error) throw logsResult.error;
    if (followerResult.error) throw followerResult.error;
    if (followingResult.error) throw followingResult.error;
    if (followResult.error) throw followResult.error;

    setProfile(data as Profile);
    setLogs((logsResult.data ?? []) as Log[]);
    setFollowerCount(followerResult.count ?? 0);
    setFollowingCount(followingResult.count ?? 0);
    setIsFollowing(Boolean(followResult.data));
    setRefreshing(false);
  }, [username, user]);

  useEffect(() => {
    load().catch((error) => {
      setRefreshing(false);
      Alert.alert('載入失敗', error.message);
    });
  }, [load]);

  const toggleFollow = async () => {
    if (!user || !profile || user.id === profile.id) return;

    const nextIsFollowing = !isFollowing;
    setIsFollowing(nextIsFollowing);
    setFollowerCount((count) => Math.max(0, count + (nextIsFollowing ? 1 : -1)));

    if (isFollowing) {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', profile.id);
      if (error) {
        setIsFollowing(true);
        setFollowerCount((count) => count + 1);
        Alert.alert('取消追蹤失敗', error.message);
      }
      return;
    }

    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: user.id, following_id: profile.id });

    if (error) {
      setIsFollowing(false);
      setFollowerCount((count) => Math.max(0, count - 1));
      Alert.alert('追蹤失敗', error.message);
    }
  };

  const displayName = profile?.display_name || profile?.username || '創作者';
  const isOwnProfile = myProfile?.username === username || user?.id === profile?.id;

  return (
    <Screen>
      <FlatList
        data={logs}
        numColumns={2}
        keyExtractor={(item) => item.id}
        onRefresh={() => load().catch((error) => Alert.alert('載入失敗', error.message))}
        refreshing={refreshing}
        ListHeaderComponent={(
          <View style={styles.header}>
            <View style={styles.topRow}>
              <Pressable onPress={() => router.back()} style={styles.backButton}>
                <Text style={styles.backText}>‹ 返回</Text>
              </Pressable>
            </View>

            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}

            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.username}>@{profile?.username ?? username}</Text>
            {!!profile?.region && <Text style={styles.regionBadge}>{profile.region}</Text>}
            {!!profile?.bio && <Text numberOfLines={2} style={styles.bio}>{profile.bio}</Text>}

            <View style={styles.statsRow}>
              <Pressable onPress={() => Alert.alert('作品', `${logs.length} 個作品`)}>
                <Text style={styles.statNumber}>{logs.length}</Text>
                <Text style={styles.statLabel}>作品</Text>
              </Pressable>
              <Pressable onPress={() => Alert.alert('追蹤者', `${followerCount} 位追蹤者`)}>
                <Text style={styles.statNumber}>{followerCount}</Text>
                <Text style={styles.statLabel}>追蹤者</Text>
              </Pressable>
              <Pressable onPress={() => Alert.alert('追蹤中', `${followingCount} 位創作者`)}>
                <Text style={styles.statNumber}>{followingCount}</Text>
                <Text style={styles.statLabel}>追蹤中</Text>
              </Pressable>
            </View>

            {!isOwnProfile && (
              <Pressable onPress={toggleFollow} style={[styles.followButton, isFollowing && styles.followingButton]}>
                <Text style={[styles.followText, isFollowing && styles.followingText]}>
                  {isFollowing ? '取消追蹤' : '追蹤'}
                </Text>
              </Pressable>
            )}

            <Text style={styles.section}>公開紀錄</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/log/${item.id}`)} style={styles.tile}>
            {item.media_urls?.[0] ? (
              <Image source={{ uri: item.media_urls[0] }} style={styles.tileImage} />
            ) : (
              <View style={styles.tileFallback}>
                <Text numberOfLines={4} style={styles.tileText}>{item.title || item.body}</Text>
              </View>
            )}
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState title="未有公開紀錄" body="這位創作者暫時未發布新內容。" />}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 110
  },
  header: {
    paddingTop: 46,
    paddingHorizontal: 16,
    paddingBottom: 18,
    alignItems: 'center',
    gap: 9
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start'
  },
  backButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  backText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgCard
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  avatarText: {
    color: colors.bgCard,
    fontFamily: fonts.heading,
    fontSize: 36
  },
  name: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center'
  },
  username: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14
  },
  regionBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.bgMuted,
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  bio: {
    maxWidth: 320,
    color: '#3A3A3A',
    fontFamily: fonts.body,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20
  },
  statsRow: {
    width: '100%',
    marginTop: 4,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  statNumber: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    textAlign: 'center'
  },
  statLabel: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    textAlign: 'center'
  },
  followButton: {
    minWidth: 170,
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  followingButton: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border
  },
  followText: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold
  },
  followingText: {
    color: colors.text
  },
  section: {
    alignSelf: 'flex-start',
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    marginTop: 12
  },
  tile: {
    width: '50%',
    aspectRatio: 1,
    padding: 4
  },
  tileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: colors.bgCard
  },
  tileFallback: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    justifyContent: 'flex-end',
    backgroundColor: colors.gold
  },
  tileText: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  }
});
