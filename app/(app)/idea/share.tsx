import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useShareIntentContext } from 'expo-share-intent';
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

type Status = 'idle' | 'analyzing' | 'ready' | 'saving' | 'saved' | 'error';

const potentialConfig: Record<ViralPotential, { label: string; color: string; bg: string }> = {
  high: { label: '🔥 高潛力', color: colors.accent, bg: '#FFF0EE' },
  medium: { label: '⚡ 中潛力', color: colors.gold, bg: '#FFF7E8' },
  low: { label: '📊 低潛力', color: colors.textMuted, bg: colors.bgMuted }
};

function normalizePotential(value: unknown): ViralPotential {
  return value === 'high' || value === 'low' || value === 'medium' ? value : 'medium';
}

function extractUrl(text?: string | null) {
  return text?.match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[),.]+$/, '') ?? '';
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export default function IdeaShareScreen() {
  const { shareIntent, hasShareIntent, resetShareIntent } = useShareIntentContext();
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const analyzeUrl = useCallback(async (targetUrl: string) => {
    setStatus('analyzing');
    setErrorMsg('');

    try {
      const response = await fetch(AUTOFILL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);

      const data = await response.json();
      setResult({
        title: data.title || 'Untitled',
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
      });
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setErrorMsg(error instanceof Error ? error.message : '分析失敗');
    }
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
    analyzeUrl(sharedUrl);
  }, [analyzeUrl, hasShareIntent, shareIntent, status]);

  const potential = useMemo(() => potentialConfig[result?.viral_potential ?? 'medium'], [result?.viral_potential]);

  async function saveIdea() {
    if (!result || !user) return;
    setStatus('saving');

    const { error } = await supabase.from('ideas').insert({
      user_id: user.id,
      url,
      thumb: result.image || null,
      title: result.title,
      topic: result.topic ?? result.title,
      summary: result.description ?? result.desc ?? '',
      script_hook: result.script_hook ?? result.hook ?? '',
      country: result.country ?? 'HK',
      platform: result.platform ?? 'instagram',
      tags: result.tags ?? [],
      categories: result.categories ?? [],
      place_name: result.placeName ?? '',
      place_address: result.placeAddress ?? '',
      viral_score: 0,
      ai_viral_base: 0,
      date: new Date().toISOString(),
      notes: '',
      description: result.desc ?? result.description ?? '',
      hook: result.hook ?? '',
      region: result.country ?? 'HK',
      viral_potential: result.viral_potential ?? 'medium',
      source_url: url
    });

    if (error) {
      Alert.alert('儲存失敗', error.message);
      setStatus('ready');
      return;
    }

    setStatus('saved');
    resetShareIntent();
    setTimeout(() => router.replace('/idea/library'), 1200);
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
          <Text style={styles.title}>SOON Idea</Text>
        </View>
        <Pressable onPress={dismiss} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {url ? <Text numberOfLines={2} style={styles.urlPill}>{url}</Text> : null}

        {status === 'analyzing' ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.gold} />
            <Text style={styles.centerText}>AI 分析緊...</Text>
          </View>
        ) : null}

        {status === 'error' ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>分析失敗</Text>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable onPress={() => url ? analyzeUrl(url) : dismiss()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{url ? '再試一次' : '返回動態'}</Text>
            </Pressable>
          </View>
        ) : null}

        {status === 'saved' ? (
          <View style={styles.centerState}>
            <Text style={styles.savedIcon}>◈</Text>
            <Text style={styles.savedText}>已儲存入題材庫</Text>
          </View>
        ) : null}

        {(status === 'ready' || status === 'saving') && result ? (
          <View style={styles.card}>
            <View style={styles.metaRow}>
              <Text style={[styles.potentialBadge, { color: potential.color, backgroundColor: potential.bg }]}>{potential.label}</Text>
              <Text style={styles.platformBadge}>{result.platform}</Text>
            </View>

            <Text style={styles.ideaTitle}>{result.title}</Text>

            {result.hook ? (
              <View style={styles.hookBox}>
                <Text style={styles.hookLabel}>核心 Hook</Text>
                <Text style={styles.hookText}>{result.hook}</Text>
              </View>
            ) : null}

            {result.description ? <Text style={styles.description}>{result.description}</Text> : null}

            <View style={styles.detailRow}>
              <Text style={styles.region}>{result.region || result.country || 'HK'}</Text>
              {result.tags.slice(0, 5).map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}
            </View>

            <Pressable disabled={status === 'saving'} onPress={saveIdea} style={({ pressed }) => [styles.saveButton, (pressed || status === 'saving') && styles.pressed]}>
              {status === 'saving' ? <ActivityIndicator color={colors.text} /> : <Text style={styles.saveButtonText}>◈ 儲存入題材庫</Text>}
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
    backgroundColor: colors.gold
  },
  saveButtonText: {
    color: colors.text,
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
