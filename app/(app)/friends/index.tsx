import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { useAuth } from '@/hooks/useAuth';
import { addFriendByUsername, FriendProfile, loadFriendProfiles } from '@/lib/friends';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

const REGION_FLAG: Record<string, string> = {
  HK: '🇭🇰',
  TW: '🇹🇼',
  SG: '🇸🇬',
  OTHER: '🌐'
};

export default function FriendsScreen() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [username, setUsername] = useState('');
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadFriends = useCallback(async () => {
    if (!user?.id) return;
    try {
      setFriends(await loadFriendProfiles(user.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : '請稍後再試';
      Alert.alert('載入失敗', message);
    }
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

  const addFriend = async () => {
    if (!user?.id || adding) return;
    setAdding(true);
    try {
      const result = await addFriendByUsername(user.id, username);
      setUsername('');
      await loadFriends();
      Alert.alert(result.alreadyFriend ? '已經係好友' : '已加入好友', `@${result.profile.username} 之後可以喺 Room / 題材庫揀佢。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '請稍後再試';
      Alert.alert('加好友失敗', message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.screen}>
      <BackHeader title="好友" />
      <View style={styles.addBox}>
        <Text style={styles.subtitle}>用 username 加好友，之後可以喺 Room 同題材庫揀佢合作。</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="@username，例如 renee"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Pressable
            onPress={addFriend}
            disabled={!username.trim() || adding}
            style={({ pressed }) => [styles.addButton, (!username.trim() || adding || pressed) && styles.addButtonDimmed]}
          >
            {adding ? <ActivityIndicator size="small" color={colors.textOnDark} /> : <Text style={styles.addButtonText}>加入</Text>}
          </Pressable>
        </View>
      </View>
      <FlatList
        data={friends}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={friends.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Feather name="user-plus" size={40} color="#d1d5db" />
            <Text style={styles.emptyTitle}>仲未有好友</Text>
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

function Avatar({ item }: { item: FriendProfile }) {
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
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19
  },
  addBox: {
    margin: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    padding: 14,
    gap: 12
  },
  inputRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 12,
    backgroundColor: colors.bgBody,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: 12
  },
  addButton: {
    width: 72,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
  },
  addButtonDimmed: {
    opacity: 0.55
  },
  addButtonText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 14
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
