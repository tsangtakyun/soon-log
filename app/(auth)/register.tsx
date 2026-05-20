import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Screen, Title } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Region } from '@/types';

const regions: { label: string; value: Region }[] = [
  { label: '香港', value: 'HK' },
  { label: '台灣', value: 'TW' },
  { label: '新加坡', value: 'SG' },
  { label: '其他', value: 'OTHER' }
];

export default function RegisterScreen() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [region, setRegion] = useState<Region>('HK');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    try {
      setLoading(true);
      await register({ email: email.trim(), password, username, displayName, region });
      Alert.alert('帳戶已建立', '歡迎加入 SOON-LOG。');
    } catch (error) {
      Alert.alert('註冊失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <Title>建立你的創作者檔案</Title>
          <View style={styles.form}>
            <Field value={email} onChangeText={setEmail} placeholder="電郵" autoCapitalize="none" keyboardType="email-address" />
            <Field value={password} onChangeText={setPassword} placeholder="密碼" secureTextEntry />
            <Field value={username} onChangeText={setUsername} placeholder="用戶名" autoCapitalize="none" />
            <Field value={displayName} onChangeText={setDisplayName} placeholder="顯示名稱" />
            <Text style={styles.label}>地區</Text>
            <View style={styles.regionRow}>
              {regions.map((item) => (
                <Pressable key={item.value} onPress={() => setRegion(item.value)} style={[styles.region, region === item.value && styles.regionActive]}>
                  <Text style={[styles.regionText, region === item.value && styles.regionTextActive]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Button title="註冊" onPress={onSubmit} loading={loading} disabled={!email || !password || !username} />
          <Link href="/login" style={styles.link}>已有帳戶？返回登入</Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 18
  },
  form: {
    gap: 12
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  regionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  region: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.bgCard
  },
  regionActive: {
    borderColor: colors.gold,
    backgroundColor: colors.bgMuted
  },
  regionText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium
  },
  regionTextActive: {
    color: colors.gold
  },
  link: {
    color: colors.gold,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
    fontSize: 15
  }
});
