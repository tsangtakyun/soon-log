import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

const shareTargets = [
  { label: 'WhatsApp', icon: '📱', color: '#25D366' },
  { label: 'Telegram', icon: '✈️', color: '#229ED9' },
  { label: 'LINE', icon: '💬', color: '#00B900' },
  { label: 'WeChat', icon: '💬', color: '#07C160' },
  { label: 'IG', icon: '📸', color: '#C13584' },
  { label: 'Threads', icon: '@', color: '#0a0a0a' },
  { label: 'Facebook', icon: 'f', color: '#1877F2' },
  { label: 'Email', icon: '📧', color: '#6b7280' },
  { label: '小紅書', icon: '📕', color: '#FF2442' }
];

const steps = [
  { emoji: '1️⃣', title: '分享連結', body: '將你嘅專屬連結分享俾創作者朋友' },
  { emoji: '2️⃣', title: '朋友註冊', body: '朋友用你嘅連結加入 SOON' },
  { emoji: '3️⃣', title: '獲得 Credits', body: '雙方即刻獲得 100 AI Credits' }
];

export default function ReferralsScreen() {
  const { profile } = useAuth();
  const username = profile?.username || 'soon';
  const referralUrl = `soon.studio/r/${username}`;
  const referralMessage = '我喺用 SOON 整內容超好用，呢個係我嘅邀請連結，你註冊咗我哋兩個都會有免費 AI Credits 用：';

  const copyLink = async () => {
    await Clipboard.setStringAsync(referralUrl);
    Alert.alert('已複製連結！');
  };

  const shareLink = async () => {
    await Share.share({ message: `${referralMessage}\n${referralUrl}` });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← 返回</Text>
        </Pressable>
        <Text style={styles.headerTitle}>My Referrals</Text>
        <View style={styles.headerSpace} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>邀請創作者，賺取免費 AI Credits！</Text>
          <Text style={styles.subtitle}>每成功邀請一位朋友加入 SOON</Text>
          <Text style={styles.subtitle}>
            即送 <Text style={styles.subtitleBold}>100 Credits</Text>
          </Text>
          <Text style={styles.subtitle}>（約 3 日免費 AI 額度）</Text>

          <Pressable onPress={copyLink} style={({ pressed }) => [styles.linkPill, pressed && styles.pressed]}>
            <Text style={styles.linkText}>🔗 {referralUrl}</Text>
            <Text style={styles.copyIcon}>📋</Text>
          </Pressable>

          <Pressable onPress={() => Alert.alert('即將推出')} style={({ pressed }) => [styles.bioButton, pressed && styles.pressed]}>
            <Text style={styles.bioButtonText}>Add link to Link in Bio →</Text>
          </Pressable>

          <Text style={styles.shareTitle}>分享連結到：</Text>
          <View style={styles.shareGrid}>
            {shareTargets.map((target) => (
              <Pressable key={target.label} onPress={shareLink} style={({ pressed }) => [styles.shareItem, pressed && styles.pressed]}>
                <View style={[styles.shareCircle, { backgroundColor: target.color }]}>
                  <Text style={styles.shareIcon}>{target.icon}</Text>
                </View>
                <Text numberOfLines={1} style={styles.shareLabel}>{target.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.faqTitle}>點樣賺取 Credits？</Text>
        {steps.map((step) => (
          <View key={step.title} style={styles.stepCard}>
            <Text style={styles.stepEmoji}>{step.emoji}</Text>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  header: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.bodyBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  back: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  headerTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  headerSpace: {
    width: 52
  },
  content: {
    paddingBottom: 40
  },
  heroCard: {
    margin: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 24,
    backgroundColor: colors.bgBodyCard,
    padding: 24
  },
  heroTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center'
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center'
  },
  subtitleBold: {
    color: colors.text,
    fontFamily: fonts.bodyBold
  },
  linkPill: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: colors.bgBodyMuted,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  linkText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  copyIcon: {
    color: colors.primary,
    fontSize: 18
  },
  bioButton: {
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: colors.bgHero,
    paddingVertical: 14,
    alignItems: 'center'
  },
  bioButtonText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  shareTitle: {
    marginTop: 20,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  shareGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  shareItem: {
    width: '33.333%',
    alignItems: 'center',
    marginBottom: 16
  },
  shareCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  shareIcon: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  shareLabel: {
    marginTop: 6,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  faqTitle: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  stepCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: colors.bgBodyMuted,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  stepEmoji: {
    width: 38,
    fontSize: 32
  },
  stepText: {
    flex: 1
  },
  stepTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  stepBody: {
    marginTop: 3,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18
  },
  pressed: {
    opacity: 0.72
  }
});
