import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { colors } from "@/theme/colors";
import { fonts } from "@/lib/theme";

export default function EggCreatorLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          height: 82,
          paddingTop: 9,
          paddingBottom: 22,
          borderTopWidth: 1,
          borderTopColor: colors.bodyBorder,
          backgroundColor: colors.bgCard,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="creator/home"
        options={{
          title: "主頁",
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="creator/script"
        options={{
          title: "劇本工作台",
          tabBarIcon: ({ color }) => (
            <Feather name="edit-3" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="creator/reply"
        options={{
          title: "回覆中心",
          tabBarIcon: ({ color }) => (
            <Feather name="message-circle" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="creator/more"
        options={{
          title: "更多",
          tabBarIcon: ({ color }) => (
            <Feather name="grid" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="creator/media-kit" options={{ href: null }} />
      <Tabs.Screen name="creator/deals" options={{ href: null }} />
      <Tabs.Screen name="creator/analytics" options={{ href: null }} />
      <Tabs.Screen name="creator/script-history" options={{ href: null }} />
      <Tabs.Screen name="creator/team" options={{ href: null }} />
      <Tabs.Screen name="creator/settings" options={{ href: null }} />
      <Tabs.Screen name="creator/products" options={{ href: null }} />
    </Tabs>
  );
}
