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
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('username', username).single();
    if (error) throw error;
    setProfile(data);

    const [{ data: logRows }, { data: followerRows }, { data: followingRows }, { data: followRow }] = await Promise.all([
      supabase.from('logs').select('*').eq('user_id', data.id).eq('is_published', true).order('created_at', { ascending: false }),
      supabase.from('follows').select('follower_id').eq('following_id', data.id),
      supabase.from('follows').select('following_id').eq('follower_id', data.id),
      user ? supabase.from('follows').select('*').eq('follower_id', user.id).eq('following_id', data.id).maybeSingle() : Promise.resolve({ data: null })
    ]);

    setLogs((logRows ?? []) as Log[]);
    setFollowers(followerRows?.length ?? 0);
    setFollowing(followingRows?.length ?? 0);
    setIsFollowing(Boolean(followRow?.data));
  }, [username, user]);

  useEffect(() => {
    load().catch((error) => Alert.alert('載入失敗', error.message));
  }, [load]);

  const toggleFollow = async () => {
    if (!user || !profile || user.id === profile.id) return;
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', profile.id);
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: profile.id });
    }
    await load();
  };

  const displayName = profile?.display_name || profile?.username || '創作者';
  const isOwnProfile = myProfile?.username === username;

  return (
    <Screen>
      <FlatList
        data={logs}
        numColumns={2}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>返回</Text></Pressable>
            {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text></View>}
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.username}>@{profile?.username ?? username}</Text>
            {!!profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}
            <View style={styles.badges}>
              {!!profile?.region && <Text style={styles.badge}>{profile.region}</Text>}
              <Pressable onPress={() => Alert.alert('追蹤者', `${followers} 位追蹤者`)}><Text style={styles.count}>{followers} 追蹤者</Text></Pressable>
              <Pressable onPress={() => Alert.alert('正在追蹤', `${following} 位創作者`)}><Text style={styles.count}>{following} 追蹤中</Text></Pressable>
            </View>
            {!isOwnProfile && (
              <Pressable onPress={toggleFollow} style={[styles.followButton, isFollowing && styles.followingButton]}>
                <Text style={styles.followText}>{isFollowing ? '取消追蹤' : '追蹤'}</Text>
              </Pressable>
            )}
            <Text style={styles.section}>公開紀錄</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/(app)/log/${item.id}`)} style={styles.tile}>
            {item.media_urls?.[0] ? <Image source={{ uri: item.media_urls[0] }} style={styles.tileImage} /> : <View style={styles.tileFallback}><Text numberOfLines={3} style={styles.tileText}>{item.title || item.body}</Text></View>}
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
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 18,
    alignItems: 'center',
    gap: 10
  },
  back: {
    alignSelf: 'flex-start'
  },
  backText: {
    color: colors.gold,
    fontFamily: fonts.bodyMedium
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46
  },
  avatarFallback: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  avatarText: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 42
  },
  name: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 34,
    lineHeight: 38
  },
  username: {
    color: colors.gold,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  bio: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8
  },
  badge: {
    color: colors.gold,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyMedium
  },
  count: {
    color: colors.text,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyMedium
  },
  followButton: {
    minWidth: 150,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 11
  },
  followingButton: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border
  },
  followText: {
    color: colors.text,
    fontFamily: fonts.bodyBold
  },
  section: {
    alignSelf: 'flex-start',
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    marginTop: 14
  },
  tile: {
    width: '50%',
    aspectRatio: 1,
    padding: 1
  },
  tileImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.bgCard
  },
  tileFallback: {
    flex: 1,
    padding: 12,
    justifyContent: 'flex-end',
    backgroundColor: colors.bgCard
  },
  tileText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  }
});
