import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
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
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { colors } from '@/theme/colors';

function RootNavigator() {
  const { hasShareIntent } = useShareIntentContext();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!hasShareIntent || loading) return;

    if (session) {
      router.push('/idea/share');
    } else {
      router.replace('/login');
    }
  }, [hasShareIntent, loading, session]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgBody } }}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(auth)/register" />
        <Stack.Screen name="auth/callback" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useSerifFonts({ DMSerifDisplay_400Regular });
  useSansFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  return (
    <SafeAreaProvider>
      <ShareIntentProvider options={{ scheme: 'soonlog' }}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ShareIntentProvider>
    </SafeAreaProvider>
  );
}
