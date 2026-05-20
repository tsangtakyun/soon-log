import { useURL } from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

function getTokenParam(url: URL, key: string) {
  const queryValue = url.searchParams.get(key);
  if (queryValue) return queryValue;
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  return hashParams.get(key);
}

function getOAuthCode(url: URL) {
  const queryValue = url.searchParams.get('code');
  if (queryValue) return queryValue;
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  return hashParams.get('code');
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function AuthCallback() {
  const url = useURL();
  const router = useRouter();
  const params = useLocalSearchParams<{
    access_token?: string;
    refresh_token?: string;
    code?: string;
    error?: string;
    error_description?: string;
  }>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function completeSignIn() {
      try {
        const callbackError = firstParam(params.error_description) ?? firstParam(params.error);
        if (callbackError) throw new Error(callbackError);

        const parsedUrl = url ? new URL(url) : null;
        const accessToken = firstParam(params.access_token) ?? (parsedUrl ? getTokenParam(parsedUrl, 'access_token') : null);
        const refreshToken = firstParam(params.refresh_token) ?? (parsedUrl ? getTokenParam(parsedUrl, 'refresh_token') : null);
        const code = firstParam(params.code) ?? (parsedUrl ? getOAuthCode(parsedUrl) : null);

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (error) throw error;
          router.replace('/feed');
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          router.replace('/feed');
          return;
        }

        throw new Error('未能讀取 Google 登入回傳資料。');
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Google 登入失敗，請再試一次。');
      }
    }

    completeSignIn();
  }, [params.access_token, params.code, params.error, params.error_description, params.refresh_token, router, url]);

  return (
    <View style={styles.container}>
      {errorMessage ? (
        <View style={styles.card}>
          <Text style={styles.title}>Google 登入未完成</Text>
          <Text style={styles.message}>{errorMessage}</Text>
          <Pressable onPress={() => router.replace('/login')} style={styles.button}>
            <Text style={styles.buttonText}>返回登入</Text>
          </Pressable>
        </View>
      ) : (
        <ActivityIndicator color={colors.accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  card: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 14
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  message: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  button: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonText: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  }
});
