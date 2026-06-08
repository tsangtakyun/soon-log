import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts as useExpoFonts } from 'expo-font';
import { Feather, FontAwesome, Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ShareIntentModule, ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
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
import { SHARE_INTENT_URL } from '@/lib/shareIdeas';
import { colors } from '@/theme/colors';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { hasShareIntent } = useShareIntentContext();
  const { session, loading } = useAuth();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const lastShareRouteAt = useRef(0);

  const checkPendingShare = useCallback(() => {
    if (loading) return;
    ShareIntentModule?.getShareIntent(SHARE_INTENT_URL);
  }, [loading]);

  useEffect(() => {
    checkPendingShare();
  }, [checkPendingShare]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkPendingShare();
      }
    });

    return () => subscription.remove();
  }, [checkPendingShare]);

  useEffect(() => {
    if (!hasShareIntent || loading) return;

    const now = Date.now();
    if (now - lastShareRouteAt.current < 1200) return;
    lastShareRouteAt.current = now;

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
  const [fontWaitExpired, setFontWaitExpired] = useState(false);
  const [serifLoaded, serifError] = useSerifFonts({ DMSerifDisplay_400Regular });
  const [sansLoaded, sansError] = useSansFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const [iconLoaded, iconError] = useExpoFonts({
    ...Feather.font,
    ...FontAwesome.font,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    ...MaterialIcons.font
  });
  const fontsReady = (serifLoaded && sansLoaded && iconLoaded) || Boolean(serifError || sansError || iconError || fontWaitExpired);

  useEffect(() => {
    if (fontsReady) return;

    const timer = setTimeout(() => setFontWaitExpired(true), 4000);
    return () => clearTimeout(timer);
  }, [fontsReady]);

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
      <ShareIntentProvider options={{ scheme: 'soonlog', resetOnBackground: false }}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ShareIntentProvider>
    </SafeAreaProvider>
  );
}
