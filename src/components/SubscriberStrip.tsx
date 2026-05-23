import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { PlatformLogo, type Platform as PlatformKey } from './PlatformLogo';

type SocialStats = {
  instagram: number;
  youtube: number;
  tiktok: number;
  xiaohongshu: number;
  threads: number;
};

type Platform = {
  key: PlatformKey;
  name: string;
  count: number;
  color: string;
};

const emptyStats: SocialStats = {
  instagram: 0,
  youtube: 0,
  tiktok: 0,
  xiaohongshu: 0,
  threads: 0,
};

function formatCount(value: number) {
  return Math.round(value).toLocaleString('en-US');
}

export function SubscriberStrip() {
  const { user } = useAuth();
  const [stats, setStats] = useState<SocialStats>(emptyStats);
  const [draft, setDraft] = useState<SocialStats>(emptyStats);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [displayCount, setDisplayCount] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const platforms: Platform[] = [
    { key: 'instagram', name: 'Instagram', count: stats.instagram, color: '#E1306C' },
    { key: 'youtube', name: 'YouTube', count: stats.youtube, color: '#FF0000' },
    { key: 'tiktok', name: 'TikTok', count: stats.tiktok, color: '#000000' },
    { key: 'xiaohongshu', name: '小紅書', count: stats.xiaohongshu, color: '#FF2442' },
    { key: 'threads', name: 'Threads', count: stats.threads, color: '#000000' },
  ];
  const active = platforms[currentIndex] ?? platforms[0];

  const loadStats = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('social_stats')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data?.social_stats && typeof data.social_stats === 'object') {
      const next = { ...emptyStats, ...(data.social_stats as Partial<SocialStats>) };
      setStats(next);
      setDraft(next);
    }
  }, [user]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex((current) => (current + 1) % platforms.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [fadeAnim, platforms.length]);

  useEffect(() => {
    countAnim.stopAnimation();
    countAnim.setValue(0);
    const listener = countAnim.addListener(({ value }) => setDisplayCount(value));
    Animated.timing(countAnim, {
      toValue: active?.count || 0,
      duration: 800,
      useNativeDriver: false,
    }).start();

    return () => countAnim.removeListener(listener);
  }, [active?.count, countAnim, currentIndex]);

  async function saveStats() {
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update({ social_stats: draft })
      .eq('id', user.id);

    if (error) {
      Alert.alert('儲存失敗', error.message);
      return;
    }
    setStats(draft);
    setEditOpen(false);
  }

  return (
    <>
      <Pressable onPress={() => setEditOpen(true)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
          <View style={styles.platformInfo}>
            <PlatformLogo
              platform={active.key}
              size={28}
              showLabel
              labelStyle={styles.platformName}
            />
          </View>
          <View style={styles.countWrap}>
            <Text style={styles.count}>{formatCount(displayCount)}</Text>
            <Text style={styles.countLabel}>位追蹤者</Text>
          </View>
          <View style={styles.dots}>
            {platforms.map((platform, index) => (
              <View key={platform.key} style={[styles.dot, index === currentIndex && styles.dotActive]} />
            ))}
          </View>
        </Animated.View>
      </Pressable>

      <Modal animationType="slide" transparent visible={editOpen} onRequestClose={() => setEditOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropPress} onPress={() => setEditOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
            <Text style={styles.sheetTitle}>更新追蹤者數字</Text>
            {platforms.map((platform) => (
              <View key={platform.key} style={styles.inputRow}>
                <PlatformLogo
                  platform={platform.key}
                  size={24}
                  showLabel
                  labelStyle={[styles.inputLabel, { color: platform.color }]}
                />
                <TextInput
                  value={String(draft[platform.key] || '')}
                  onChangeText={(text) => {
                    const clean = text.replace(/[^0-9]/g, '');
                    setDraft((current) => ({ ...current, [platform.key]: Number(clean || 0) }));
                  }}
                  keyboardType="number-pad"
                  placeholder="0"
                  style={styles.input}
                />
              </View>
            ))}
            <Pressable onPress={saveStats} style={styles.saveButton}>
              <Text style={styles.saveText}>儲存</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    padding: 16
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  platformInfo: {
    width: 122,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  platformName: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    fontWeight: '700'
  },
  countWrap: {
    flex: 1,
    alignItems: 'center'
  },
  count: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 28
  },
  countLabel: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  dots: {
    width: 34,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bodyBorder
  },
  dotActive: {
    backgroundColor: colors.primary
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  backdropPress: {
    flex: 1
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.bgBody,
    padding: 16
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    marginBottom: 14
  },
  inputRow: {
    marginBottom: 12
  },
  inputLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16
  },
  saveButton: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    alignItems: 'center'
  },
  saveText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  pressed: {
    opacity: 0.72
  }
});
