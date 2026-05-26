import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
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
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { registerPushToken } from '@/lib/notifications';
import { colors } from '@/theme/colors';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { hasShareIntent } = useShareIntentContext();
  const { session, loading } = useAuth();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!hasShareIntent || loading) return;

    if (session) {
      router.push('/idea/share');
    } else {
      router.replace('/login');
    }
  }, [hasShareIntent, loading, session]);

  useEffect(() => {
    if (session?.user) {
      registerPushToken(session.user.id).catch(() => undefined);
    }
  }, [session]);

  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(() => undefined);

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data.type === 'new_clip' && data.room_id) {
        router.push('/(app)/log/room/' + data.room_id);
      }
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  if (loading) {
    return <AppLoadingScreen />;
  }

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
  const [introDone, setIntroDone] = useState(false);
  const [serifLoaded, serifError] = useSerifFonts({ DMSerifDisplay_400Regular });
  const [sansLoaded, sansError] = useSansFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const fontsReady = (serifLoaded && sansLoaded) || Boolean(serifError || sansError);

  useEffect(() => {
    if (!fontsReady) return;

    SplashScreen.hideAsync().catch(() => undefined);
    const timer = setTimeout(() => setIntroDone(true), 1800);

    return () => clearTimeout(timer);
  }, [fontsReady]);

  if (!fontsReady || !introDone) {
    return (
      <SafeAreaProvider>
        <AppLoadingScreen />
      </SafeAreaProvider>
    );
  }

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
