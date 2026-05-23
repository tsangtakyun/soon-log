import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { fonts } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/colors';

export default function AppTabs() {
  const { user } = useAuth();
  const [todayCount, setTodayCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setTodayCount(0);
      return;
    }

    const loadTodayCount = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('topic_clips')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', today.toISOString());

      setTodayCount(count || 0);
    };

    loadTodayCount();
    const channel = supabase
      .channel(`today-clip-count-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topic_clips', filter: `user_id=eq.${user.id}` }, () => loadTodayCount())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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
              {todayCount > 0 ? (
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
                  <Text style={{ color: colors.textOnDark, fontSize: 10, fontWeight: '700' }}>{todayCount}</Text>
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
          tabBarIcon: ({ color }) => <Feather name="trending-up" size={22} color={color} />
        }}
      />
      <Tabs.Screen
        name="tools/index"
        options={{
          title: '工具',
          tabBarIcon: ({ color }) => <Feather name="tool" size={22} color={color} />
        }}
      />
      <Tabs.Screen name="idea/library" options={{ href: null }} />
      <Tabs.Screen name="work/index" options={{ href: null }} />
      <Tabs.Screen name="mayan/index" options={{ href: null }} />
      <Tabs.Screen name="reply-centre" options={{ href: null }} />
      <Tabs.Screen name="feed/index" options={{ href: null }} />
      <Tabs.Screen name="create" options={{ href: null }} />
      <Tabs.Screen name="profile/index" options={{ href: null }} />
      <Tabs.Screen name="profile/[username]" options={{ href: null }} />
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
      <Tabs.Screen name="idea/share" options={{ href: null }} />
      <Tabs.Screen name="home/trend/[id]" options={{ href: null }} />
      <Tabs.Screen name="home/referrals" options={{ href: null }} />
      <Tabs.Screen name="home/discover" options={{ href: null }} />
      <Tabs.Screen name="settings/reply" options={{ href: null }} />
    </Tabs>
  );
}
