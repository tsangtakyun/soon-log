import { Feather } from '@expo/vector-icons';
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

type Subscriber = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  region: string | null;
  is_following_back: boolean;
};

const REGION_FLAG: Record<string, string> = {
  HK: '🇭🇰',
  TW: '🇹🇼',
  SG: '🇸🇬',
  OTHER: '🌐'
};

export default function SubscribersScreen() {
  const { user } = useAuth();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadSubscribers = useCallback(async () => {
    if (!user?.id) return;
    const { data: followerRows, error: followerError } = await supabase
      .from('follows')
      .select('follower_id, created_at')
      .eq('following_id', user.id)
      .order('created_at', { ascending: false });

    if (followerError) {
      Alert.alert('載入失敗', followerError.message);
      return;
    }

    const followerIds = (followerRows ?? []).map((row) => row.follower_id).filter(Boolean);
    if (followerIds.length === 0) {
      setSubscribers([]);
      return;
    }

    const [{ data: profiles, error }, { data: followingBackRows }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, region')
        .in('id', followerIds),
      supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .in('following_id', followerIds)
    ]);

    if (error) {
      Alert.alert('載入失敗', error.message);
      return;
    }

    const followingBackIds = new Set((followingBackRows ?? []).map((row) => row.following_id));
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    setSubscribers(
      followerIds.flatMap((id) => {
        const profile = profileMap.get(id);
        if (!profile) return [];
        return [{ ...(profile as Omit<Subscriber, 'is_following_back'>), is_following_back: followingBackIds.has(id) }];
      })
    );
  }, [user?.id]);

  useEffect(() => {
    loadSubscribers();
  }, [loadSubscribers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSubscribers();
    setRefreshing(false);
  };

  const followBack = async (subscriberId: string) => {
    if (!user?.id) return;
    setSubscribers((current) => current.map((item) => item.id === subscriberId ? { ...item, is_following_back: true } : item));
    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: user.id, following_id: subscriberId });

    if (error) {
      setSubscribers((current) => current.map((item) => item.id === subscriberId ? { ...item, is_following_back: false } : item));
      Alert.alert('追蹤失敗', error.message);
    }
  };

  return (
    <View style={styles.screen}>
      <BackHeader title="訂閱者" />
      <Text style={styles.subtitle}>追蹤咗你嘅人</Text>
      <FlatList
        data={subscribers}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={subscribers.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Feather name="users" size={40} color="#d1d5db" />
            <Text style={styles.emptyTitle}>仲未有人追蹤你</Text>
            <Text style={styles.emptyBody}>分享你嘅 profile 俾更多人知</Text>
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
            {item.is_following_back ? (
              <View style={styles.followingPill}>
                <Text style={styles.followingText}>已追蹤</Text>
              </View>
            ) : (
              <Pressable onPress={() => followBack(item.id)} style={({ pressed }) => [styles.followButton, pressed && styles.pressed]}>
                <Text style={styles.followText}>追蹤</Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
  );
}

function Avatar({ item }: { item: Subscriber }) {
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
  followButton: {
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6
  },
  followText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  followingPill: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5
  },
  followingText: {
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
  emptyBody: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  pressed: {
    opacity: 0.68
  }
});
