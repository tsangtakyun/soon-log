import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type Friend = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  region: string | null;
};

const REGION_FLAG: Record<string, string> = {
  HK: '🇭🇰',
  TW: '🇹🇼',
  SG: '🇸🇬',
  OTHER: '🌐'
};

export default function FriendsScreen() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadFriends = useCallback(async () => {
    if (!user?.id) return;
    const { data: rows, error: followError } = await supabase
      .from('follows')
      .select('following_id, created_at')
      .eq('follower_id', user.id)
      .order('created_at', { ascending: false });

    if (followError) {
      Alert.alert('載入失敗', followError.message);
      return;
    }

    const ids = (rows ?? []).map((row) => row.following_id).filter(Boolean);
    if (ids.length === 0) {
      setFriends([]);
      return;
    }

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, region')
      .in('id', ids);

    if (error) {
      Alert.alert('載入失敗', error.message);
      return;
    }

    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile as Friend]));
    setFriends(ids.flatMap((id) => profileMap.get(id) ? [profileMap.get(id) as Friend] : []));
  }, [user?.id]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFriends();
    setRefreshing(false);
  };

  const unfollow = async (friendId: string) => {
    if (!user?.id) return;
    const previous = friends;
    setFriends((current) => current.filter((friend) => friend.id !== friendId));

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', friendId);

    if (error) {
      setFriends(previous);
      Alert.alert('取消追蹤失敗', error.message);
    }
  };

  return (
    <View style={styles.screen}>
      <BackHeader title="好友" />
      <Text style={styles.subtitle}>你追蹤緊嘅創作者</Text>
      <FlatList
        data={friends}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={friends.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Feather name="user-plus" size={40} color="#d1d5db" />
            <Text style={styles.emptyTitle}>仲未追蹤任何創作者</Text>
            <Pressable onPress={() => router.push('/(app)/home/discover')} hitSlop={10}>
              <Text style={styles.emptyLink}>去發掘 →</Text>
            </Pressable>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar item={item} />
            <View style={styles.rowBody}>
              <View style={styles.nameRow}>
                <Text numberOfLines={1} style={styles.name}>{item.display_name || item.username || '創作者'}</Text>
                {item.region ? <Text style={styles.region}>{REGION_FLAG[item.region] || '🌐'}</Text> : null}
              </View>
              <Text numberOfLines={1} style={styles.username}>@{item.username || 'soon'}</Text>
            </View>
            <Pressable onPress={() => unfollow(item.id)} style={({ pressed }) => [styles.unfollow, pressed && styles.pressed]}>
              <Text style={styles.unfollowText}>取消追蹤</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

function Avatar({ item }: { item: Friend }) {
  const name = item.display_name || item.username || 'S';

  if (item.avatar_url) {
    return <Image source={{ uri: item.avatar_url }} style={styles.avatar} />;
  }

  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarInitial}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  subtitle: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  list: {
    paddingBottom: 110
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.bgBodyMuted,
    flexDirection: 'row',
    alignItems: 'center'
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgHeroSurface
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
  },
  avatarInitial: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  rowBody: {
    flex: 1,
    marginLeft: 12
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  name: {
    maxWidth: '86%',
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  region: {
    marginLeft: 4,
    fontSize: 12
  },
  username: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  unfollow: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5
  },
  unfollowText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center'
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 24
  },
  emptyTitle: {
    marginTop: 12,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  emptyLink: {
    marginTop: 10,
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  pressed: {
    opacity: 0.68
  }
});
