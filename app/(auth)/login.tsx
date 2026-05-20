import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Screen, Title } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

WebBrowser.maybeCompleteAuthSession();

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

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailVisible, setEmailVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const signInWithGoogle = async () => {
    try {
      setGoogleLoading(true);
      const redirectUrl = 'soonlog://auth/callback';

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true
        }
      });

      if (error || !data.url) {
        Alert.alert('Google 登入失敗', error?.message ?? '未能建立登入連結。');
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success') {
        const url = new URL(result.url);
        const accessToken = getTokenParam(url, 'access_token');
        const refreshToken = getTokenParam(url, 'refresh_token');
        const code = getOAuthCode(url);

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (sessionError) {
            Alert.alert('Google 登入失敗', sessionError.message);
          }
        } else if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            Alert.alert('Google 登入失敗', exchangeError.message);
          }
        } else {
          Alert.alert('Google 登入失敗', '未能讀取登入回傳資料，請再試一次。');
        }
      }
    } catch (error) {
      Alert.alert('Google 登入失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setGoogleLoading(false);
    }
  };

  const onSubmit = async () => {
    try {
      setLoading(true);
      await signIn(email.trim(), password);
    } catch (error) {
      Alert.alert('登入失敗', error instanceof Error ? error.message : '請檢查電郵及密碼。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={styles.hero}>
          <Text style={styles.brand}>SOON LOG</Text>
          <Title>記低創作背後的每一步</Title>
          <Text style={styles.copy}>登入後即可追蹤靈感、製作筆記、影像和創作者動態。</Text>
        </View>

        <View style={styles.authCard}>
          <Pressable
            onPress={signInWithGoogle}
            disabled={googleLoading}
            style={({ pressed }) => [styles.googleButton, (pressed || googleLoading) && styles.pressed]}
          >
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleText}>{googleLoading ? '連接 Google 中...' : '以 Google 帳號登入'}</Text>
          </Pressable>

          <Pressable onPress={() => setEmailVisible((visible) => !visible)} style={styles.emailToggle}>
            <Text style={styles.emailToggleText}>{emailVisible ? '收起電郵登入' : '或用電郵登入'}</Text>
          </Pressable>

          {emailVisible ? (
            <View style={styles.form}>
              <Field value={email} onChangeText={setEmail} placeholder="電郵" autoCapitalize="none" keyboardType="email-address" />
              <Field value={password} onChangeText={setPassword} placeholder="密碼" secureTextEntry />
              <Button title="Email/Password 登入" onPress={onSubmit} loading={loading} disabled={!email || !password} />
            </View>
          ) : null}
        </View>

        <Link href="/register" style={styles.link}>未有帳戶？建立創作者帳戶</Link>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 28
  },
  hero: {
    gap: 12
  },
  brand: {
    color: colors.gold,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 0
  },
  copy: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  authCard: {
    gap: 14
  },
  googleButton: {
    minHeight: 54,
    width: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10
  },
  googleIcon: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  googleText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  emailToggle: {
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8
  },
  emailToggleText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 15
  },
  form: {
    gap: 12
  },
  pressed: {
    opacity: 0.72
  },
  link: {
    color: colors.gold,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
    fontSize: 15
  }
});
