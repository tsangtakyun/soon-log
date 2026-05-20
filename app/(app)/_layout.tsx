import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadComments } from '@/hooks/useUnreadComments';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

export default function AppTabs() {
  const { profile } = useAuth();
  const { count } = useUnreadComments(profile);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 82,
          paddingTop: 10,
          paddingBottom: 22,
          borderTopColor: colors.border,
          backgroundColor: colors.bg
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontFamily: fonts.bodyMedium,
          fontSize: 12
        }
      }}
    >
      <Tabs.Screen
        name="feed/index"
        options={{
          title: '動態',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>◈</Text>
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: '記錄',
          tabBarActiveTintColor: colors.gold,
          tabBarIcon: () => <Text style={{ color: colors.gold, fontSize: 26 }}>⊕</Text>
        }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{
          title: '個人',
          tabBarIcon: ({ color }) => (
            <View>
              <Text style={{ color, fontSize: 22 }}>◉</Text>
              {count > 0 && <View style={styles.badge} />}
            </View>
          )
        }}
      />
      <Tabs.Screen name="profile/[username]" options={{ href: null }} />
      <Tabs.Screen name="log/[id]" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -2,
    right: -7,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent
  }
});
