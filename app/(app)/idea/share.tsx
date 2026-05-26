import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useShareIntentContext } from 'expo-share-intent';
import { Feather } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { ViralPotential } from '@/types';

const AUTOFILL_API = 'https://idea-brainstorm.vercel.app/api/autofill-link';

type AnalysisResult = {
  title: string;
  topic?: string;
  description?: string;
  desc?: string;
  hook?: string;
  script_hook?: string;
  region?: string;
  country?: string;
  viral_potential: ViralPotential;
  tags: string[];
  platform: string;
  image?: string;
  placeName?: string;
  placeAddress?: string;
  categories?: string[];
};

type Status = 'idle' | 'ready' | 'saving' | 'saved' | 'error';

function extractUrl(text?: string | null) {
  return text?.match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[),.]+$/, '') ?? '';
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

async function geocodePlace(placeName: string, country: string) {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key || !placeName.trim()) return null;

  const query = encodeURIComponent(`${placeName}, ${country}`);
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${key}`);
  const data = await response.json();
  const location = data.results?.[0]?.geometry?.location;

  if (typeof location?.lat === 'number' && typeof location?.lng === 'number') {
    return {
      lat: location.lat,
      lng: location.lng
    };
  }

  return null;
}

export default function IdeaShareScreen() {
  const { shareIntent, hasShareIntent, resetShareIntent } = useShareIntentContext();
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [url, setUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const analyzeUrl = useCallback(async (targetUrl: string): Promise<AnalysisResult> => {
    const response = await fetch(AUTOFILL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl })
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);

    const data = await response.json();
    return {
      title: data.title || 'IG Reel 靈感',
      topic: data.title || '',
      description: data.desc || data.metadataDescription || '',
      desc: data.desc || '',
      hook: '',
      country: data.country || 'HK',
      region: data.country || 'HK',
      viral_potential: 'medium',
      tags: asStringArray(data.tags),
      platform: data.platform || 'instagram',
      image: data.image || '',
      placeName: data.placeName || '',
      placeAddress: data.placeAddress || '',
      categories: []
    };
  }, []);

  useEffect(() => {
    if (!hasShareIntent || !shareIntent || status !== 'idle') return;

    const sharedUrl = shareIntent.webUrl || extractUrl(shareIntent.text);
    if (!sharedUrl) {
      setStatus('error');
      setErrorMsg('無法讀取分享連結');
      return;
    }

    setUrl(sharedUrl);
    setStatus('ready');
  }, [hasShareIntent, shareIntent, status]);

  async function enrichIdea(ideaId: string, targetUrl: string) {
    try {
      const result = await analyzeUrl(targetUrl);
      const blockedTitle = result.title === 'Instagram' || result.title === 'TikTok' || !result.title;
      const title = blockedTitle ? 'Instagram Reel 靈感' : result.title;
      const placeQuery = result.placeName || result.placeAddress || '';
      const coords = placeQuery ? await geocodePlace(placeQuery, result.country || 'HK') : null;

      await supabase
        .from('ideas')
        .update({
          thumb: result.image || null,
          title,
          topic: title,
          summary: result.description ?? result.desc ?? '',
          script_hook: result.script_hook ?? result.hook ?? '',
          country: result.country ?? 'HK',
          platform: result.platform ?? 'instagram',
          tags: result.tags?.length ? result.tags : ['instagram'],
          categories: result.categories ?? [],
          place_name: result.placeName ?? '',
          place_address: result.placeAddress ?? '',
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          description: result.desc ?? result.description ?? '',
          hook: result.hook ?? '',
          region: result.country ?? 'HK',
          viral_potential: result.viral_potential ?? 'medium'
        })
        .eq('id', ideaId);
    } catch (error) {
      console.warn('[share-idea] background enrich failed', error);
    }
  }

  async function saveIdea() {
    if (!url || !user) return;

    setStatus('saving');
    try {
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
        categories: [],
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
        enrichIdea(data.id, url);
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
