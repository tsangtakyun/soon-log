import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';

type OnboardingBannerProps = {
  userId?: string | null;
  onCreateRoom: () => void;
  onStartCamera: () => void;
};

export function OnboardingBanner({ userId, onCreateRoom, onStartCamera }: OnboardingBannerProps) {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkNewUser() {
      if (!userId) {
        if (active) setShowOnboarding(false);
        return;
      }

      const [{ count: roomCount }, { count: logCount }, { count: followerCount }] = await Promise.all([
        supabase
          .from('topic_room_members')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('logs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('follows')
          .select('id', { count: 'exact', head: true })
          .eq('following_id', userId),
      ]);

      if (active) {
        setShowOnboarding((roomCount ?? 0) === 0 && (logCount ?? 0) === 0 && (followerCount ?? 0) === 0);
      }
    }

    checkNewUser();
    return () => {
      active = false;
    };
  }, [userId]);

  if (!showOnboarding) return null;

  const steps = [
    { step: '1', text: '建立 Topic Room 同隊友協作', action: '建立', onPress: onCreateRoom },
    { step: '2', text: '拍第一條 clip 記錄今日創作', action: '拍攝', onPress: onStartCamera },
    { step: '3', text: '發掘同追蹤其他創作者', action: '發掘', onPress: () => router.push('/(app)/home/discover') },
  ];

  return (
    <View style={styles.onboardingBanner}>
      <Text style={styles.onboardingTitle}>👋 歡迎來到 SOON-LOG</Text>
      <Text style={styles.onboardingSubtitle}>3 步開始你嘅創作之旅</Text>

      {steps.map((item) => (
        <View key={item.step} style={styles.onboardingStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>{item.step}</Text>
          </View>
          <Text style={styles.stepText}>{item.text}</Text>
          <TouchableOpacity style={styles.stepAction} onPress={item.onPress}>
            <Text style={styles.stepActionText}>{item.action}</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity onPress={() => setShowOnboarding(false)} style={styles.dismissBtn}>
        <Text style={styles.dismissText}>暫時跳過</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  onboardingBanner: {
    backgroundColor: '#FBF4EE',
    borderRadius: 16,
    margin: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(92,42,34,0.2)',
  },
  onboardingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#5C2A22',
  },
  onboardingSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
    marginTop: 4,
  },
  onboardingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#5C2A22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#3A3A3A',
    marginHorizontal: 10,
  },
  stepAction: {
    backgroundColor: '#5C2A22',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stepActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  dismissBtn: {
    alignItems: 'center',
    marginTop: 8,
  },
  dismissText: {
    color: '#888',
    fontSize: 13,
  },
});
