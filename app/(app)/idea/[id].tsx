import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
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
            content: `題材：${idea.title}
${idea.summary ? '描述：' + idea.summary : ''}
${idea.script_hook ? 'Hook 參考：' + idea.script_hook : ''}
${idea.place_name ? '地點：' + idea.place_name : ''}
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
          title: idea.title || '題材劇本',
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

            <Text style={styles.title}>{idea.title || '未命名題材'}</Text>

            {idea.summary || idea.description ? (
              <Text style={styles.summary}>{idea.summary || idea.description}</Text>
            ) : null}

            {idea.script_hook || idea.hook ? (
              <View style={styles.hookBox}>
                <Text style={styles.hookLabel}>Hook</Text>
                <Text style={styles.hookText}>{idea.script_hook || idea.hook}</Text>
              </View>
            ) : null}

            {idea.place_name || idea.shop_name || idea.place_address ? (
              <View style={styles.placeBox}>
                <Text style={styles.placeTitle}>📍 到埗發現</Text>
                {idea.place_name || idea.shop_name ? <Text style={styles.placeText}>{idea.place_name || idea.shop_name}</Text> : null}
                {idea.place_address ? <Text style={styles.placeMuted}>{idea.place_address}</Text> : null}
              </View>
            ) : null}

            {idea.notes ? (
              <View style={styles.notesBox}>
                <Text style={styles.notesLabel}>筆記</Text>
                <Text style={styles.notesText}>{idea.notes}</Text>
              </View>
            ) : null}

            {generating ? (
              <View style={styles.generatingBox}>
                <ActivityIndicator color="#5C2A22" />
                <Text style={styles.generatingText}>Mayan 生成緊劇本...</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.generateButton} onPress={generateScript}>
                <Text style={styles.generateButtonText}>🎬 生成劇本</Text>
              </TouchableOpacity>
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
