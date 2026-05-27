import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useShareIntentContext } from 'expo-share-intent';
import { Feather } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { enrichIdeaFromUrl } from '@/lib/ideaEnrichment';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type Status = 'idle' | 'ready' | 'saving' | 'saved' | 'error';

function extractUrl(text?: string | null) {
  return text?.match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[),.]+$/, '') ?? '';
}

export default function IdeaShareScreen() {
  const { shareIntent, hasShareIntent, resetShareIntent } = useShareIntentContext();
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [url, setUrl] = useState('');
  const [selectedBoard, setSelectedBoard] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!hasShareIntent || !shareIntent || status !== 'idle') return;

    const sharedUrl = shareIntent.webUrl || extractUrl(shareIntent.text);
    if (!sharedUrl) {
      setStatus('error');
      setErrorMsg('無法讀取分享連結');
      return;
    }

    const board = typeof shareIntent.meta?.soonBoard === 'string' ? shareIntent.meta.soonBoard.trim() : '';
    setSelectedBoard(board);
    setUrl(sharedUrl);
    setStatus('ready');
  }, [hasShareIntent, shareIntent, status]);

  async function enrichIdea(ideaId: string, targetUrl: string, boardCategories: string[]) {
    try {
      await enrichIdeaFromUrl(ideaId, targetUrl, boardCategories);
    } catch (error) {
      console.warn('[share-idea] background enrich failed', error);
    }
  }

  async function saveIdea() {
    if (!url || !user) return;

    setStatus('saving');
    try {
      const boardCategories = selectedBoard ? [selectedBoard] : [];
      const { data, error } = await supabase.from('ideas').insert({
        user_id: user.id,
        url,
        thumb: null,
        title: 'IG Reel 靈感',
        topic: 'IG Reel 靈感',
        summary: '已由 Instagram 儲存，AI 會稍後補充題材資料。',
        script_hook: '',
        country: 'HK',
        platform: 'instagram',
        tags: ['instagram', '待分析'],
        categories: boardCategories,
        place_name: '',
        place_address: '',
        viral_score: 0,
        ai_viral_base: 0,
        date: new Date().toISOString(),
        notes: '',
        lat: null,
        lng: null,
        description: '',
        hook: '',
        region: 'HK',
        viral_potential: 'medium',
        source_url: url
      }).select('id').single();

      if (error) throw error;

      setStatus('saved');
      resetShareIntent();
      if (data?.id) {
        enrichIdea(data.id, url, boardCategories);
      }
      setTimeout(() => router.replace('/(app)/idea/library'), 1200);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('儲存失敗', message);
      setStatus('ready');
    }
  }

  function dismiss() {
    resetShareIntent();
    router.replace('/feed');
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>SHARE TO SOON</Text>
          <Text style={styles.title}>Save Idea</Text>
        </View>
        <Pressable onPress={dismiss} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {url ? <Text numberOfLines={2} style={styles.urlPill}>{url}</Text> : null}

        {status === 'error' ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>讀取失敗</Text>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable onPress={dismiss} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>返回動態</Text>
            </Pressable>
          </View>
        ) : null}

        {status === 'saved' ? (
          <View style={styles.centerState}>
            <Text style={styles.savedIcon}>◈</Text>
            <Text style={styles.savedText}>已儲存入題材庫</Text>
            <Text style={styles.savedSubtext}>AI 會喺背景補充標題、Hook 同標籤。</Text>
          </View>
        ) : null}

        {status === 'ready' || status === 'saving' ? (
          <View style={styles.quickCard}>
            <View style={styles.quickIcon}>
              <Feather name="bookmark" size={24} color={colors.primary} />
            </View>
            <View style={styles.quickCopy}>
              <Text style={styles.quickTitle}>Save to 題材庫</Text>
              <Text style={styles.quickDescription}>先儲存連結，AI 之後自動補充標題、Hook 同標籤。</Text>
              {selectedBoard ? (
                <View style={styles.boardPill}>
                  <Feather name="folder" size={13} color={colors.primary} />
                  <Text style={styles.boardPillText}>{selectedBoard}</Text>
                </View>
              ) : null}
            </View>
            <Pressable disabled={status === 'saving'} onPress={saveIdea} style={({ pressed }) => [styles.saveButton, (pressed || status === 'saving') && styles.pressed]}>
              {status === 'saving' ? (
                <ActivityIndicator color={colors.textOnDark} />
              ) : (
                <View style={styles.saveButtonContent}>
                  <Feather name="bookmark" size={18} color={colors.textOnDark} />
                  <Text style={styles.saveButtonText}>儲存入題材庫</Text>
                </View>
              )}
            </Pressable>

            <Pressable onPress={dismiss} style={styles.dismissLink}>
              <Text style={styles.dismissText}>唔儲存</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 58,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  kicker: {
    color: colors.gold,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  title: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 38,
    lineHeight: 42
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMuted
  },
  closeText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  content: {
    padding: 18,
    paddingBottom: 44,
    gap: 16
  },
  urlPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    color: colors.textMuted,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  centerState: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12
  },
  centerText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16
  },
  errorTitle: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  errorText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center'
  },
  savedIcon: {
    color: colors.gold,
    fontSize: 48
  },
  savedText: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 28
  },
  savedSubtext: {
    maxWidth: 260,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  quickCard: {
    borderRadius: 24,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    gap: 16
  },
  quickIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickCopy: {
    gap: 6
  },
  quickTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 24
  },
  quickDescription: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  boardPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  boardPillText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  card: {
    borderRadius: 18,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    gap: 16
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  potentialBadge: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  platformBadge: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: colors.purple,
    backgroundColor: '#F0EAFE',
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  ideaTitle: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 28,
    lineHeight: 34
  },
  hookBox: {
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
    backgroundColor: '#FFF9ED',
    borderRadius: 12,
    padding: 14,
    gap: 6
  },
  hookLabel: {
    color: colors.gold,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  hookText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 23
  },
  description: {
    color: '#3A3A3A',
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23
  },
  editSection: {
    gap: 6
  },
  editLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  editInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text
  },
  editInputMultiline: {
    height: 80,
    textAlignVertical: 'top'
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  region: {
    color: colors.text,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  tag: {
    color: colors.textMuted,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  primaryButton: {
    marginTop: 10,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold
  },
  primaryButtonText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  saveButton: {
    height: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
  },
  saveButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  saveButtonText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  dismissLink: {
    alignItems: 'center',
    paddingVertical: 6
  },
  dismissText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  pressed: {
    opacity: 0.72
  }
});
