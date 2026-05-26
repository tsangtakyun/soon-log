import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader } from '@/components/BackHeader';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

type HookKey = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8';
type TransitionKey = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

type Option<T extends string> = {
  key: T;
  title: string;
  description: string;
};

type Draft = {
  brand: string;
  industry: string;
  topic: string;
  background: string;
  hookStyle: HookKey;
  transitionStyle: TransitionKey;
};

const INDUSTRIES = [
  '飲食',
  '旅遊',
  '美妝',
  '時裝穿搭',
  '健身體育',
  '親子',
  '寵物',
  '教育學習',
  '職場',
  '理財',
  '房間裝修',
  '手作DIY',
  '夜生活',
  '書籍閱讀',
  '好物分享',
  '生活',
  '文化',
  '科技',
  '活動',
  '手機攝影'
];

const HOOK_OPTIONS: Option<HookKey>[] = [
  { key: 'H1', title: '極端行動質問', description: '誇張行為/處境問觀眾' },
  { key: 'H2', title: '真定假 — 直接挑戰', description: '質疑廣泛聲稱，邀請驗證' },
  { key: 'H3', title: '聽講 — 半信半疑', description: '借第三者講法引入懸念' },
  { key: 'H4', title: '威官喚起+懸念', description: '啟動威官記憶再加轉折' },
  { key: 'H5', title: '反差驚喜 — 竟然', description: '意想不到對比，情緒跳躍' },
  { key: 'H6', title: '意外自我披露', description: '個人誠實拉近距離' },
  { key: 'H7', title: '荒誕事實', description: '真實但荒謬嘅事，引發驚訝' },
  { key: 'H8', title: '代入感假設', description: '「如果」句式引觀眾想像' }
];

const TRANSITION_OPTIONS: Option<TransitionKey>[] = [
  { key: 'T1', title: '情緒代入 — 同行感', description: '帶持緊張，拉觀眾入狀態' },
  { key: 'T2', title: '轉念 — 入去先信咗', description: '懷疑被現實正面打臉' },
  { key: 'T3', title: '質疑名氣 — 實力存疑', description: '對名氣打預防針' },
  { key: 'T4', title: '實測宣言 — 等我試下', description: '宣佈「我幫你試」' },
  { key: 'T5', title: '場景切割 — 另有真相', description: '意想不到角度重新定義' }
];

const emptyDraft: Draft = {
  brand: '',
  industry: '飲食',
  topic: '',
  background: '',
  hookStyle: 'H1',
  transitionStyle: 'T1'
};

function selectedOption<T extends string>(options: Option<T>[], key: T) {
  return options.find((option) => option.key === key) ?? options[0];
}

async function resolveWorkspaceId(userId: string, email?: string | null) {
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (membership?.workspace_id) return membership.workspace_id as string;

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', userId)
    .limit(1)
    .maybeSingle();

  if (workspace?.id) return workspace.id as string;

  const { data: created, error } = await supabase
    .from('workspaces')
    .insert({
      name: 'SOON-LOG',
      type: 'mixed',
      owner: email ?? null,
      owner_id: userId
    })
    .select('id')
    .maybeSingle();

  if (error || !created?.id) return null;

  await supabase.from('workspace_members').insert({
    workspace_id: created.id,
    user_id: userId,
    email: email ?? null,
    role: 'owner',
    status: 'active',
    invited_by: userId
  });

  return created.id as string;
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function Chip({
  label,
  active,
  onPress
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.industryChip, active && styles.industryChipActive]}>
      <Text style={[styles.industryChipText, active && styles.industryChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function OptionCard<T extends string>({
  option,
  active,
  onPress
}: {
  option: Option<T>;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.optionCard, active && styles.optionCardActive]}>
      <Text style={[styles.optionKey, active && styles.optionTextActive]}>{option.key}</Text>
      <Text style={[styles.optionTitle, active && styles.optionTextActive]}>{option.title}</Text>
      <Text style={[styles.optionDescription, active && styles.optionDescriptionActive]}>{option.description}</Text>
    </TouchableOpacity>
  );
}

export default function ScriptGeneratorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [generatedScript, setGeneratedScript] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const hook = useMemo(() => selectedOption(HOOK_OPTIONS, draft.hookStyle), [draft.hookStyle]);
  const transition = useMemo(() => selectedOption(TRANSITION_OPTIONS, draft.transitionStyle), [draft.transitionStyle]);

  const prompt = useMemo(() => `你係一個專業香港 IG Reel 劇本創作師。根據以下資料，生成一個完整嘅 IG Reel 劇本：

品牌/名稱：${draft.brand || '未提供'}
行業：${draft.industry}
主題：${draft.topic || '未提供'}
背景資料：${draft.background || '未提供'}
Hook 風格：${hook.key} ${hook.title} - ${hook.description}
轉場風格：${transition.key} ${transition.title} - ${transition.description}

劇本格式：
- Hook（開場3秒，用選定嘅Hook風格）
- 中段發展（用選定嘅轉場風格）
- 結尾 CTA

用廣東話口語寫作，自然流暢，適合 IG Reel 節奏。`, [draft.background, draft.brand, draft.industry, draft.topic, hook, transition]);

  async function generateScript() {
    if (generating) return;
    if (!draft.topic.trim()) {
      Alert.alert('請輸入主題', '要有主題先可以生成劇本。');
      return;
    }
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
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1800,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message ?? '生成失敗');
      const text = data?.content?.map((block: { text?: string }) => block.text).filter(Boolean).join('\n\n') ?? '';
      setGeneratedScript(text.trim());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('生成失敗', message);
    } finally {
      setGenerating(false);
    }
  }

  async function saveScript() {
    if (!user) return;
    if (!generatedScript.trim()) {
      Alert.alert('未有劇本', '請先生成劇本。');
      return;
    }

    setSaving(true);
    try {
      const workspaceId = await resolveWorkspaceId(user.id, user.email);
      const metadata = {
        brand: draft.brand,
        industry: draft.industry,
        topic: draft.topic,
        background: draft.background,
        hook_style: draft.hookStyle,
        hook_description: `${hook.title} - ${hook.description}`,
        transition_style: draft.transitionStyle,
        transition_description: `${transition.title} - ${transition.description}`
      };
      const basePayload = {
        user_id: user.id,
        workspace_id: workspaceId,
        title: draft.topic.trim() || draft.brand.trim() || 'IG Reel 劇本',
        content: generatedScript.trim()
      };
      const fullPayload = {
        ...basePayload,
        brand: draft.brand.trim() || null,
        industry: draft.industry,
        topic: draft.topic.trim() || null,
        background: draft.background.trim() || null,
        hook_style: draft.hookStyle,
        transition_style: draft.transitionStyle,
        metadata
      };

      let { error } = await supabase.from('scripts').insert(fullPayload);
      if (error) {
        ({ error } = await supabase.from('scripts').insert({ ...basePayload, metadata }));
      }
      if (error) {
        ({ error } = await supabase.from('scripts').insert({ user_id: user.id, title: basePayload.title, content: basePayload.content }));
      }
      if (error) throw error;
      Alert.alert('已儲存', '劇本已加入歷史記錄。');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('儲存失敗', message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <BackHeader
        title="劇本創作"
        backTo="/(app)/tools"
        rightElement={
          <TouchableOpacity onPress={() => router.push('/(app)/tools/script-history' as never)} style={styles.historyButton}>
            <Text style={styles.historyText}>歷史記錄</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        >
          <Text style={styles.subtitle}>IG Reel 劇本工作台</Text>

          <View style={styles.formCard}>
            <FieldLabel>01 品牌 / 個人名稱</FieldLabel>
            <TextInput
              value={draft.brand}
              onChangeText={(brand) => setDraft((prev) => ({ ...prev, brand }))}
              placeholder="例：One Bite、丁丁、Hilary Travels"
              placeholderTextColor="#9ca3af"
              style={styles.input}
            />

            <FieldLabel>02 行業 / 類型</FieldLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {INDUSTRIES.map((industry) => (
                <Chip
                  key={industry}
                  label={industry}
                  active={draft.industry === industry}
                  onPress={() => setDraft((prev) => ({ ...prev, industry }))}
                />
              ))}
            </ScrollView>

            <FieldLabel>03 主題</FieldLabel>
            <TextInput
              value={draft.topic}
              onChangeText={(topic) => setDraft((prev) => ({ ...prev, topic }))}
              placeholder="例：最強宵夜滷肉飯？全世界最靚聖誕市集？"
              placeholderTextColor="#9ca3af"
              style={styles.input}
            />

            <FieldLabel>04 完整背景資料</FieldLabel>
            <TextInput
              value={draft.background}
              onChangeText={(background) => setDraft((prev) => ({ ...prev, background }))}
              placeholder="例：係老字號，成立1920年，主打豬油糕同老婆餅..."
              placeholderTextColor="#9ca3af"
              style={[styles.input, styles.textarea]}
              multiline
              textAlignVertical="top"
            />

            <FieldLabel>05 Hook 風格</FieldLabel>
            <View style={styles.optionGrid}>
              {HOOK_OPTIONS.map((option) => (
                <OptionCard
                  key={option.key}
                  option={option}
                  active={draft.hookStyle === option.key}
                  onPress={() => setDraft((prev) => ({ ...prev, hookStyle: option.key }))}
                />
              ))}
            </View>

            <FieldLabel>06 轉場風格</FieldLabel>
            <View style={styles.optionGrid}>
              {TRANSITION_OPTIONS.map((option) => (
                <OptionCard
                  key={option.key}
                  option={option}
                  active={draft.transitionStyle === option.key}
                  onPress={() => setDraft((prev) => ({ ...prev, transitionStyle: option.key }))}
                />
              ))}
            </View>
          </View>

          <TouchableOpacity onPress={generateScript} disabled={generating} style={[styles.generateButton, generating && styles.disabledButton]}>
            {generating ? (
              <View style={styles.generateLoading}>
                <ActivityIndicator color="#ffffff" />
                <Text style={styles.generateButtonText}>AI 生成中...</Text>
              </View>
            ) : (
              <Text style={styles.generateButtonText}>✨ 生成劇本</Text>
            )}
          </TouchableOpacity>

          {generatedScript ? (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultTitle}>生成結果</Text>
                <Feather name="file-text" size={18} color={colors.primary} />
              </View>
              <Text style={styles.scriptText}>{generatedScript}</Text>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={async () => {
                    await Clipboard.setStringAsync(generatedScript);
                    Alert.alert('已複製', '劇本已複製到剪貼板。');
                  }}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>複製</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveScript} disabled={saving} style={styles.secondaryButton}>
                  {saving ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryButtonText}>儲存</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={generateScript} disabled={generating} style={styles.regenerateButton}>
                  <Text style={styles.regenerateButtonText}>重新生成</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F4EF'
  },
  keyboard: {
    flex: 1
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    marginBottom: 12
  },
  historyButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.primaryLight
  },
  historyText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  content: {
    padding: 16,
    gap: 16
  },
  formCard: {
    backgroundColor: colors.bgBodyCard,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }
  },
  label: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    marginTop: 16,
    marginBottom: 8
  },
  input: {
    backgroundColor: colors.bgBodyMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15
  },
  textarea: {
    minHeight: 112,
    lineHeight: 22
  },
  chipsRow: {
    gap: 8,
    paddingRight: 16
  },
  industryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted
  },
  industryChipActive: {
    backgroundColor: '#8B1A1A',
    borderColor: '#8B1A1A'
  },
  industryChipText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  industryChipTextActive: {
    color: '#ffffff'
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  optionCard: {
    width: '48%',
    minHeight: 118,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    padding: 12
  },
  optionCardActive: {
    backgroundColor: '#8B1A1A',
    borderColor: '#8B1A1A'
  },
  optionKey: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  optionTitle: {
    marginTop: 6,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    lineHeight: 18
  },
  optionDescription: {
    marginTop: 5,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16
  },
  optionTextActive: {
    color: '#ffffff'
  },
  optionDescriptionActive: {
    color: 'rgba(255,255,255,0.72)'
  },
  generateButton: {
    borderRadius: 16,
    backgroundColor: '#8B1A1A',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  disabledButton: {
    opacity: 0.68
  },
  generateLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  generateButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  resultCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  resultTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  scriptText: {
    color: '#1f2937',
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 24
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 11,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  regenerateButton: {
    flex: 1.4,
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 11,
    alignItems: 'center'
  },
  regenerateButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 13
  }
});
