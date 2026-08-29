import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { deriveIdeaTitle, stripCitationMarkup } from '@/lib/textSanitizer';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Idea } from '@/types';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

type Script = {
  hook: string;
  background: string;
  test: string;
  ending: string;
  duration: number;
};

export default function IdeaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadIdea = useCallback(async () => {
    if (!id || !user) return;

    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return;
    }

    setIdea(data as Idea | null);
  }, [id, user]);

  useEffect(() => {
    loadIdea();
  }, [loadIdea]);

  const sourceUrl = idea?.url || idea?.source_url;
  const cleanSummary = stripCitationMarkup(idea?.summary || idea?.description);
  const cleanHook = stripCitationMarkup(idea?.script_hook || idea?.hook);
  const cleanPlaceName = stripCitationMarkup(idea?.place_name || idea?.shop_name);
  const cleanPlaceAddress = stripCitationMarkup(idea?.place_address);
  const cleanShopHighlights = stripCitationMarkup(idea?.shop_highlights);
  const cleanNotes = stripCitationMarkup(idea?.notes);
  const cleanTopic = deriveIdeaTitle(idea?.topic);
  const cleanTitle = deriveIdeaTitle(idea?.title, cleanTopic, cleanPlaceName, cleanSummary);

  function openScriptGenerator() {
    if (!idea) return;

    const background = [
      cleanSummary ? `題材描述：${cleanSummary}` : '',
      cleanPlaceName ? `店舖／地點：${cleanPlaceName}` : '',
      cleanPlaceAddress ? `地址：${cleanPlaceAddress}` : '',
      cleanShopHighlights ? `出名／推薦：${cleanShopHighlights}` : '',
      sourceUrl ? `來源：${sourceUrl}` : ''
    ].filter(Boolean).join('\n').slice(0, 1800);

    router.push({
      pathname: '/(app)/tools/script-generator',
      params: {
        brand: cleanPlaceName || cleanTitle || '',
        industry: '飲食',
        topic: cleanTitle || cleanPlaceName || cleanTopic || 'IG Reel 題材',
        background
      }
    });
  }

  async function generateScript() {
    if (!idea || generating) return;
    if (!ANTHROPIC_KEY) {
      Alert.alert('未設定 AI Key', '請先設定 EXPO_PUBLIC_ANTHROPIC_KEY。');
      return;
    }

    setGenerating(true);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          system: `你係一個專業嘅香港短片創作顧問。
根據用戶提供嘅題材，生成一個 60 秒 IG Reel 劇本。
劇本分 4 個部分：Hook、Background、Test、Ending。
用廣東話書面語寫，自然生動。
只返回 JSON，格式如下，唔好加任何其他文字：
{
  "hook": "開場白（5-10秒，吸引眼球）",
  "background": "背景介紹（10-15秒）",
  "test": "主要內容/測試/體驗（30-35秒）",
  "ending": "結尾 CTA（5-10秒）",
  "duration": 60
}`,
          messages: [{
            role: 'user',
	            content: `題材：${cleanTitle || cleanPlaceName || cleanTopic || 'IG Reel 題材'}
	${cleanSummary ? '描述：' + cleanSummary : ''}
	${cleanHook ? 'Hook 參考：' + cleanHook : ''}
	${cleanPlaceName ? '地點：' + cleanPlaceName : ''}
	${idea.country ? '地區：' + idea.country : ''}
	${idea.tags?.length ? '標籤：' + idea.tags.join(', ') : ''}`
          }]
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message ?? '生成失敗');
      const text = data?.content?.[0]?.text ?? '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean) as Script;
      router.push({
        pathname: '/(app)/idea/script',
        params: {
          hook: parsed.hook,
          background: parsed.background,
          test: parsed.test,
          ending: parsed.ending,
	          title: cleanTitle || cleanPlaceName || cleanTopic || '題材劇本',
        }
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '生成失敗';
      Alert.alert('生成失敗', message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Screen>
      <BackHeader title="題材詳情" />

      <ScrollView contentContainerStyle={styles.content}>
        {idea ? (
          <>
            <View style={styles.metaRow}>
              <Text style={styles.platform}>{idea.platform || 'web'}</Text>
              <Text style={styles.country}>{idea.country || idea.region || 'HK'}</Text>
            </View>

            <Text style={styles.title}>{cleanTitle || '未命名題材'}</Text>

            {cleanSummary ? (
              <Text style={styles.summary}>{cleanSummary}</Text>
            ) : null}

            {cleanHook ? (
              <View style={styles.hookBox}>
                <Text style={styles.hookLabel}>Hook</Text>
                <Text style={styles.hookText}>{cleanHook}</Text>
              </View>
            ) : null}

            {cleanPlaceName || cleanPlaceAddress ? (
              <View style={styles.placeBox}>
                <Text style={styles.placeTitle}>📍 到埗發現</Text>
                {cleanPlaceName ? <Text style={styles.placeText}>{cleanPlaceName}</Text> : null}
                {cleanPlaceAddress ? <Text style={styles.placeMuted}>{cleanPlaceAddress}</Text> : null}
                {cleanShopHighlights ? (
                  <View style={styles.highlightBox}>
                    <Text style={styles.highlightLabel}>出名／推薦</Text>
                    <Text style={styles.highlightText}>{cleanShopHighlights}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {cleanNotes ? (
              <View style={styles.notesBox}>
                <Text style={styles.notesLabel}>筆記</Text>
                <Text style={styles.notesText}>{cleanNotes}</Text>
              </View>
            ) : null}

            {generating ? (
              <View style={styles.generatingBox}>
                <ActivityIndicator color="#5C2A22" />
                <Text style={styles.generatingText}>Mayan 生成緊劇本...</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.pushScriptButton} onPress={openScriptGenerator}>
                  <Text style={styles.pushScriptButtonText}>推上劇本生成</Text>
                  <Text style={styles.pushScriptButtonSubtext}>帶入題材、店名同背景資料</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.generateButton} onPress={generateScript}>
                  <Text style={styles.generateButtonText}>🎬 生成劇本</Text>
                </TouchableOpacity>
              </>
            )}

            {sourceUrl ? (
              <Pressable onPress={() => Linking.openURL(sourceUrl)} style={styles.sourceButton}>
                <Text style={styles.sourceButtonText}>打開原始連結</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Text style={styles.empty}>搵唔到呢個題材。</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    paddingBottom: 40,
    gap: 16
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8
  },
  platform: {
    color: '#FFFFFF',
    backgroundColor: colors.accent,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  country: {
    color: colors.textMuted,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  title: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 34,
    lineHeight: 40
  },
  summary: {
    color: '#3A3A3A',
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 25
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
  placeBox: {
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 5
  },
  placeTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  placeText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15
  },
  placeMuted: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  highlightBox: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#FBF4EE',
    padding: 12,
    gap: 4
  },
  highlightLabel: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  highlightText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21
  },
  notesBox: {
    borderRadius: 14,
    backgroundColor: colors.bgMuted,
    padding: 14,
    gap: 6
  },
  notesLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  notesText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23
  },
  sourceButton: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold
  },
  sourceButtonText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  generateButton: {
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#5C2A22',
    paddingVertical: 14
  },
  generateButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  pushScriptButton: {
    borderRadius: 14,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 16
  },
  pushScriptButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  pushScriptButtonSubtext: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.72)',
    fontFamily: fonts.body,
    fontSize: 12
  },
  generatingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
    backgroundColor: '#FBF4EE',
    paddingVertical: 14
  },
  generatingText: {
    color: '#5C2A22',
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  empty: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15
  }
});
