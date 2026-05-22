import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

export default function AppTabs() {
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
          title: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏠</Text>
        }}
      />
      <Tabs.Screen
        name="log/index"
        options={{
          title: 'Their.Studio',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🎬</Text>
        }}
      />
      <Tabs.Screen
        name="idea/library"
        options={{
          title: 'Idea',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>◈</Text>
        }}
      />
      <Tabs.Screen
        name="work/index"
        options={{
          title: '工作',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>◫</Text>
        }}
      />
      <Tabs.Screen
        name="mayan/index"
        options={{
          title: 'Mayan',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>◎</Text>
        }}
      />
      <Tabs.Screen name="feed/index" options={{ href: null }} />
      <Tabs.Screen name="create" options={{ href: null }} />
      <Tabs.Screen name="profile/index" options={{ href: null }} />
      <Tabs.Screen name="profile/[username]" options={{ href: null }} />
      <Tabs.Screen name="log/create-room" options={{ href: null }} />
      <Tabs.Screen name="log/room/[id]" options={{ href: null }} />
      <Tabs.Screen name="log/[id]" options={{ href: null }} />
      <Tabs.Screen name="topic-room/create" options={{ href: null }} />
      <Tabs.Screen name="work/create" options={{ href: null }} />
      <Tabs.Screen name="work/[id]" options={{ href: null }} />
      <Tabs.Screen name="schedule/index" options={{ href: null }} />
      <Tabs.Screen name="schedule/create" options={{ href: null }} />
      <Tabs.Screen name="idea/index" options={{ href: null }} />
      <Tabs.Screen name="idea/[id]" options={{ href: null }} />
      <Tabs.Screen name="idea/share" options={{ href: null }} />
      <Tabs.Screen name="home/trend/[id]" options={{ href: null }} />
      <Tabs.Screen name="home/referrals" options={{ href: null }} />
    </Tabs>
  );
}
