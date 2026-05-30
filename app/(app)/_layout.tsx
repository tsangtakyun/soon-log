import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tabs, usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { fonts } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { trendHoldCutoffIso } from '@/lib/trends';
import { colors } from '@/theme/colors';

const eggsLastSeenKey = (userId: string) => `eggs-last-seen-at:${userId}`;
const prediktLastSeenKey = (userId: string) => `predikt-last-seen-at:${userId}`;
let unreadChannelSeq = 0;

function unreadChannelName(prefix: string, userId: string) {
  unreadChannelSeq += 1;
  return `${prefix}-${userId}-${Date.now()}-${unreadChannelSeq}`;
}

function isEggsPath(pathname: string) {
  return pathname === '/log' || pathname.startsWith('/log/room') || pathname.startsWith('/log/clip');
}

function isPrediktPath(pathname: string) {
  return pathname === '/predikt' || pathname.startsWith('/home/trend');
}

export default function AppTabs() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [unreadClipCount, setUnreadClipCount] = useState(0);
  const [unreadTrendCount, setUnreadTrendCount] = useState(0);

  const markEggsSeen = useCallback(async () => {
    if (!user) return;
    await AsyncStorage.setItem(eggsLastSeenKey(user.id), new Date().toISOString());
    setUnreadClipCount(0);
  }, [user]);

  const loadUnreadClipCount = useCallback(async () => {
    if (!user) {
      setUnreadClipCount(0);
      return;
    }

    const lastSeenAt = await AsyncStorage.getItem(eggsLastSeenKey(user.id));
    if (!lastSeenAt) {
      await markEggsSeen();
      return;
    }

    const { data: memberships, error: membershipError } = await supabase
      .from('topic_room_members')
      .select('room_id')
      .eq('user_id', user.id);

    if (membershipError) return;

    const roomIds = [...new Set((memberships ?? []).map((membership) => membership.room_id).filter(Boolean))];
    if (roomIds.length === 0) {
      setUnreadClipCount(0);
      return;
    }

    const { count, error } = await supabase
      .from('topic_clips')
      .select('id', { count: 'exact', head: true })
      .in('room_id', roomIds)
      .neq('user_id', user.id)
      .gt('created_at', lastSeenAt);

    if (!error) {
      setUnreadClipCount(count || 0);
    }
  }, [markEggsSeen, user]);

  const markPrediktSeen = useCallback(async () => {
    if (!user) return;
    await AsyncStorage.setItem(prediktLastSeenKey(user.id), new Date().toISOString());
    setUnreadTrendCount(0);
  }, [user]);

  const loadUnreadTrendCount = useCallback(async () => {
    if (!user) {
      setUnreadTrendCount(0);
      return;
    }

    const lastSeenAt = await AsyncStorage.getItem(prediktLastSeenKey(user.id));
    if (!lastSeenAt) {
      await markPrediktSeen();
      return;
    }

    const { count, error } = await supabase
      .from('trends')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .or(`deadline_at.is.null,deadline_at.gt.${trendHoldCutoffIso()}`)
      .gt('created_at', lastSeenAt);

    if (!error) {
      setUnreadTrendCount(count || 0);
    }
  }, [markPrediktSeen, user]);

  useEffect(() => {
    if (!user) return;
    if (isEggsPath(pathname)) {
      markEggsSeen();
    }
    if (isPrediktPath(pathname)) {
      markPrediktSeen();
    }
  }, [markEggsSeen, markPrediktSeen, pathname, user]);

  useEffect(() => {
    if (!user) {
      setUnreadClipCount(0);
      return;
    }

    loadUnreadClipCount();
    const channel = supabase
      .channel(unreadChannelName('eggs-unread-clip-count', user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_clips' }, () => {
        if (isEggsPath(pathname)) {
          markEggsSeen();
        } else {
          loadUnreadClipCount();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_room_members', filter: `user_id=eq.${user.id}` }, () => loadUnreadClipCount())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadUnreadClipCount, markEggsSeen, pathname, user]);

  useEffect(() => {
    if (!user) {
      setUnreadTrendCount(0);
      return;
    }

    loadUnreadTrendCount();
    const channel = supabase
      .channel(unreadChannelName('predikt-unread-trend-count', user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trends' }, () => {
        if (isPrediktPath(pathname)) {
          markPrediktSeen();
        } else {
          loadUnreadTrendCount();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadUnreadTrendCount, markPrediktSeen, pathname, user]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 82,
          paddingTop: 10,
          paddingBottom: 22,
          borderTopWidth: 1,
          borderTopColor: colors.bodyBorder,
          backgroundColor: colors.bgBody
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontFamily: fonts.bodyMedium,
          fontSize: 11
        }
      }}
    >
      <Tabs.Screen
        name="home/index"
        options={{
          title: '首頁',
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />
        }}
      />
      <Tabs.Screen
        name="log/index"
        options={{
          title: 'EGGS',
          tabBarIcon: ({ color }) => (
            <View>
              <View
                style={{
                  width: 22,
                  height: 26,
                  borderTopLeftRadius: 11,
                  borderTopRightRadius: 11,
                  borderBottomLeftRadius: 9,
                  borderBottomRightRadius: 9,
                  borderWidth: 2,
                  borderColor: color
                }}
              />
              {unreadClipCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -8,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 3
                  }}
                >
                  <Text style={{ color: colors.textOnDark, fontSize: 10, fontWeight: '700' }}>{unreadClipCount}</Text>
                </View>
              ) : null}
            </View>
          )
        }}
      />
      <Tabs.Screen
        name="predikt/index"
        options={{
          title: '討論區',
          tabBarIcon: ({ color }) => (
            <View>
              <Feather name="trending-up" size={22} color={color} />
              {unreadTrendCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -8,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 3
                  }}
                >
                  <Text style={{ color: colors.textOnDark, fontSize: 10, fontWeight: '700' }}>{unreadTrendCount}</Text>
                </View>
              ) : null}
            </View>
          )
        }}
      />
      <Tabs.Screen
        name="tools/index"
        options={{
          title: '工具',
          tabBarIcon: ({ color }) => <Feather name="tool" size={22} color={color} />
        }}
      />
      <Tabs.Screen name="tools/idea-library" options={{ href: null }} />
      <Tabs.Screen name="tools/script-generator" options={{ href: null }} />
      <Tabs.Screen name="tools/script-history" options={{ href: null }} />
      <Tabs.Screen name="tools/work-board" options={{ href: null }} />
      <Tabs.Screen name="tools/schedule" options={{ href: null }} />
      <Tabs.Screen name="tools/reply-centre" options={{ href: null }} />
      <Tabs.Screen name="tools/soon-ai" options={{ href: null }} />
      <Tabs.Screen name="idea/library" options={{ href: null }} />
      <Tabs.Screen name="work/index" options={{ href: null }} />
      <Tabs.Screen name="mayan/index" options={{ href: null }} />
      <Tabs.Screen name="reply-centre" options={{ href: null }} />
      <Tabs.Screen name="feed/index" options={{ href: null }} />
      <Tabs.Screen name="create" options={{ href: null }} />
      <Tabs.Screen name="profile/index" options={{ href: null }} />
      <Tabs.Screen name="profile/[username]" options={{ href: null }} />
      <Tabs.Screen name="friends/index" options={{ href: null }} />
      <Tabs.Screen name="subscribers/index" options={{ href: null }} />
      <Tabs.Screen name="log/create-room" options={{ href: null }} />
      <Tabs.Screen name="log/camera" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="log/preview" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="log/room/[id]" options={{ href: null }} />
      <Tabs.Screen name="log/clip/[id]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="log/[id]" options={{ href: null }} />
      <Tabs.Screen name="topic-room/create" options={{ href: null }} />
      <Tabs.Screen name="work/create" options={{ href: null }} />
      <Tabs.Screen name="work/[id]" options={{ href: null }} />
      <Tabs.Screen name="schedule/index" options={{ href: null }} />
      <Tabs.Screen name="schedule/create" options={{ href: null }} />
      <Tabs.Screen name="idea/index" options={{ href: null }} />
      <Tabs.Screen name="idea/[id]" options={{ href: null }} />
      <Tabs.Screen name="idea/script" options={{ href: null }} />
      <Tabs.Screen name="idea/share" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="home/trend/[id]" options={{ href: null }} />
      <Tabs.Screen name="home/vote-history" options={{ href: null }} />
      <Tabs.Screen name="home/referrals" options={{ href: null }} />
      <Tabs.Screen name="home/discover" options={{ href: null }} />
      <Tabs.Screen name="settings/reply" options={{ href: null }} />
    </Tabs>
  );
}
