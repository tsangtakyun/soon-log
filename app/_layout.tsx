import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  DMSerifDisplay_400Regular,
  useFonts as useSerifFonts
} from '@expo-google-fonts/dm-serif-display';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
  useFonts as useSansFonts
} from '@expo-google-fonts/dm-sans';
import { AuthProvider } from '@/hooks/useAuth';
import { colors } from '@/theme/colors';

type ShareIntentValue = {
  sharedText: string | null;
  setSharedText: (value: string | null) => void;
};

const ShareIntentContext = createContext<ShareIntentValue | undefined>(undefined);

function ShareIntentProvider({ children }: { children: ReactNode }) {
  const [sharedText, setSharedText] = useState<string | null>(null);
  const value = useMemo(() => ({ sharedText, setSharedText }), [sharedText]);
  return <ShareIntentContext.Provider value={value}>{children}</ShareIntentContext.Provider>;
}

export function useShareIntent() {
  const context = useContext(ShareIntentContext);
  if (!context) throw new Error('useShareIntent 必須在 ShareIntentProvider 之內使用。');
  return context;
}

export default function RootLayout() {
  const [serifLoaded] = useSerifFonts({ DMSerifDisplay_400Regular });
  const [sansLoaded] = useSansFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  if (!serifLoaded || !sansLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ShareIntentProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="auth/callback" />
            <Stack.Screen name="(app)" />
          </Stack>
        </AuthProvider>
      </ShareIntentProvider>
    </SafeAreaProvider>
  );
}
