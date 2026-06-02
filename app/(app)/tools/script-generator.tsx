import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { generateAiText } from '@/lib/aiGenerate';
import { deductCredits, getCredits } from '@/lib/credits';
import { resolveScriptOwnerId } from '@/lib/scriptIdentity';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type HookKey = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8';
type TransitionKey = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8';
type EndingKey = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'E7';

type Option<T extends string> = {
  key: T;
  title: string;
  description: string;
};

type ScriptOption = Option<HookKey> | Option<TransitionKey> | Option<EndingKey>;
type OptionPickerKind = 'hook' | 'transition' | 'ending';

type Draft = {
  brand: string;
  industry: string;
  topic: string;
  background: string;
  hookStyle: HookKey;
  transitionStyle: TransitionKey;
  endingStyle: EndingKey;
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
  { key: 'T5', title: '場景切割 — 另有真相', description: '意想不到角度重新定義' },
  { key: 'T6', title: '第一眼唔吸引', description: '由低期待轉入實測' },
  { key: 'T7', title: '重點係另一樣', description: '表面賣點之外另有核心' },
  { key: 'T8', title: '動作到領悟', description: '由一個動作帶出觀察' }
];

const ENDING_OPTIONS: Option<EndingKey>[] = [
  { key: 'E1', title: '坦白留白', description: '唔過度結論，留一點真實餘地' },
  { key: 'E2', title: '直接回應開場', description: '結尾扣返開場問題' },
  { key: 'E3', title: '真實力', description: '用實測感受落判斷' },
  { key: 'E4', title: '自嘲幽默', description: '用輕鬆自嘲收尾' },
  { key: 'E5', title: '詩意短句', description: '用一個短句留下畫面' },
  { key: 'E6', title: '升華人生', description: '由食物/體驗帶到生活感悟' },
  { key: 'E7', title: '哲學重量', description: '較有份量但不說教' }
];

const emptyDraft: Draft = {
  brand: '',
  industry: '飲食',
  topic: '',
  background: '',
  hookStyle: 'H1',
  transitionStyle: 'T1',
  endingStyle: 'E1'
};

function paramString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

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

function OptionSelectButton({
  option,
  onPress
}: {
  option: ScriptOption;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={styles.optionSelectButton}>
      <View style={styles.optionSelectCopy}>
        <Text style={styles.optionKey}>{option.key}</Text>
        <Text style={styles.optionTitle}>{option.title}</Text>
        <Text style={styles.optionDescription}>{option.description}</Text>
      </View>
      <Feather name="chevron-down" size={22} color={colors.primary} />
    </TouchableOpacity>
  );
}

function OptionPickerSheet({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onClose
}: {
  visible: boolean;
  title: string;
  options: ScriptOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={[styles.optionSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.sheetCloseButton}>
              <Feather name="x" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetList}>
            {options.map((option) => {
              const active = option.key === selectedKey;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => {
                    onSelect(option.key);
                    onClose();
                  }}
                  activeOpacity={0.86}
                  style={[styles.sheetOption, active && styles.sheetOptionActive]}
                >
                  <View style={styles.optionSelectCopy}>
                    <Text style={[styles.sheetOptionKey, active && styles.optionTextActive]}>{option.key}</Text>
                    <Text style={[styles.sheetOptionTitle, active && styles.optionTextActive]}>{option.title}</Text>
                    <Text style={[styles.sheetOptionDescription, active && styles.optionDescriptionActive]}>{option.description}</Text>
                  </View>
                  {active ? <Feather name="check" size={20} color="#ffffff" /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function ScriptGeneratorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    brand?: string;
    industry?: string;
    topic?: string;
    background?: string;
  }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [generatedScript, setGeneratedScript] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [optionPicker, setOptionPicker] = useState<OptionPickerKind | null>(null);

  const hook = useMemo(() => selectedOption(HOOK_OPTIONS, draft.hookStyle), [draft.hookStyle]);
  const transition = useMemo(() => selectedOption(TRANSITION_OPTIONS, draft.transitionStyle), [draft.transitionStyle]);
  const ending = useMemo(() => selectedOption(ENDING_OPTIONS, draft.endingStyle), [draft.endingStyle]);
  const optionPickerConfig = useMemo(() => {
    if (optionPicker === 'hook') {
      return {
        title: '05 Hook 風格',
        options: HOOK_OPTIONS,
        selectedKey: draft.hookStyle,
        onSelect: (key: string) => setDraft((prev) => ({ ...prev, hookStyle: key as HookKey }))
      };
    }
    if (optionPicker === 'transition') {
      return {
        title: '06 轉場風格',
        options: TRANSITION_OPTIONS,
        selectedKey: draft.transitionStyle,
        onSelect: (key: string) => setDraft((prev) => ({ ...prev, transitionStyle: key as TransitionKey }))
      };
    }
    if (optionPicker === 'ending') {
      return {
        title: '07 Ending 風格',
        options: ENDING_OPTIONS,
        selectedKey: draft.endingStyle,
        onSelect: (key: string) => setDraft((prev) => ({ ...prev, endingStyle: key as EndingKey }))
      };
    }
    return null;
  }, [draft.endingStyle, draft.hookStyle, draft.transitionStyle, optionPicker]);

  useEffect(() => {
    const brand = paramString(params.brand).trim();
    const industry = paramString(params.industry).trim();
    const topic = paramString(params.topic).trim();
    const background = paramString(params.background).trim();

    if (!brand && !industry && !topic && !background) return;

    setDraft((prev) => ({
      ...prev,
      brand: brand || prev.brand,
      industry: industry || prev.industry,
      topic: topic || prev.topic,
      background: background || prev.background
    }));
  }, [params.background, params.brand, params.industry, params.topic]);

  useEffect(() => {
    const email = user?.email?.trim().toLowerCase();
    if (!email) {
      setCreditBalance(null);
      return;
    }

    getCredits(email)
      .then(setCreditBalance)
      .catch(() => setCreditBalance(null));
  }, [user?.email]);

  const refreshCreditBalance = useCallback(async () => {
    const email = user?.email?.trim().toLowerCase();
    if (!email) return;
    try {
      setCreditBalance(await getCredits(email));
    } catch {
      // Credit display should not block generation flow.
    }
  }, [user?.email]);

  const prompt = useMemo(() => `你係廣東話短片 script 寫手，幫 content creator 寫 IG Reel / YouTube Short。
廣東話口語，短句，坦白，唔 oversell，每句有目的。

結構：
1.【Opening Hook】一句，5秒
2.【舖頭資料】如有舖頭名稱 / 地址就原文列出，方便試拍現場導航
3.【背景 VO】根據題目、地址同題材想法，由 AI 總結成 50-80 字背景資料
4.【轉場】一句，10秒
5.【實測內容】4項，每項獨立分段：名稱、拍攝、內容、現場調整
6.【Ending】一句5秒＋主持1-2句感想

實測內容規則：
- 唔好每一 part 都寫成「旁白」。
- 每一 part 用「內容：」取代「旁白：」。
- 「內容」要 AI 化身成主持，寫成現場試食/試玩/試用時會講同會做嘅內容，大概 45-60 字。
- 每一 part 都要加「現場調整：主持到場後按真實味道、環境、人流、排隊、價錢或服務再微調。」
- 拍攝提示同內容要分開，方便現場 crew 睇。

Hook：H1誇張行為問觀眾｜H2挑戰廣泛聲稱｜H3借第三者引懸念｜H4感官記憶+轉折｜H5意外對比｜H6個人披露｜H7荒誕事實｜H8如果句式
轉場：T1主持緊張同行｜T2懷疑被打臉｜T3對名氣存疑｜T4宣佈親自試｜T5意外角度｜T6第一眼唔吸引｜T7重點係另一樣｜T8動作到領悟
Ending：E1坦白留白｜E2直接回應開場｜E3真實力｜E4自嘲幽默｜E5詩意短句｜E6升華人生｜E7哲學重量

品牌：${draft.brand || '未提供'}
類型：${draft.industry}
主題：${draft.topic || '未提供'}
Idea Brainstorm 想法 / 補充資料：${draft.background || '未提供'}
Hook：${hook.key} ${hook.title}｜轉場：${transition.key} ${transition.title}｜Ending：${ending.key} ${ending.title}

請即刻輸出完整 script，唔好加前言。
【舖頭資料】要獨立列出舖頭名稱同地址；【背景 VO】要由你根據主題、舖頭資料同 Idea Brainstorm 想法重新總結 50-80 字背景資料，唔好照抄原文。
內容實測每一 part 一定要用「內容：」同「現場調整：」，唔好用「旁白：」。

輸出格式：

【Opening Hook】
（一句）

【舖頭資料】
名稱：（如有就列出；如無就寫：未提供）
地址：（如有就列出；如無就寫：未提供）

【背景 VO】
（50-80字。唔好照抄題材想法，要整理成可直接旁白嘅背景資料）

【轉場】
（一句）

【實測內容】
1. 名稱
   拍攝：
   內容：
   現場調整：

2. 名稱
   拍攝：
   內容：
   現場調整：

3. 名稱
   拍攝：
   內容：
   現場調整：

4. 名稱
   拍攝：
   內容：
   現場調整：

【Ending】
（一句）
＋ 主持1-2句感想`, [draft.background, draft.brand, draft.industry, draft.topic, ending, hook, transition]);

  async function generateScript() {
    if (generating) return;
    if (!draft.topic.trim()) {
      Alert.alert('請輸入主題', '要有主題先可以生成劇本。');
      return;
    }
    setGenerating(true);
    try {
      const email = user?.email?.trim().toLowerCase();
      if (email) {
        const creditResult = await deductCredits(email, 'ai_generate');
        setCreditBalance(creditResult.balance);

        if (!creditResult.success && creditResult.error === 'insufficient_credits') {
          Alert.alert('Credits 不足', `需要 10 Credits 生成劇本\n現有：${creditResult.balance} Credits`, [{ text: '了解' }]);
          return;
        }
      }

      const text = await generateAiText({
        prompt,
        model: 'claude-sonnet-4-20250514',
        maxTokens: 2600
      });

      setGeneratedScript(text.trim());
      await refreshCreditBalance();
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
      const scriptOwnerId = await resolveScriptOwnerId(user.id, user.email);
      const workspaceId = await resolveWorkspaceId(scriptOwnerId, user.email);
      const payload = {
        user_id: scriptOwnerId,
        workspace_id: workspaceId,
        title: draft.topic.trim() || draft.brand.trim() || 'IG Reel 劇本',
        brand: draft.brand.trim() || null,
        industry: draft.industry,
        topic: draft.topic.trim() || null,
        background: draft.background.trim() || null,
        hook_code: draft.hookStyle,
        trans_code: draft.transitionStyle,
        ending_code: draft.endingStyle,
        ai_draft: generatedScript.trim(),
        qc_final: generatedScript.trim(),
        model: 'claude-sonnet-4-20250514',
        generated_at: new Date().toISOString()
      };

      let { error } = await supabase.from('scripts').insert(payload);
      if (error) {
        ({ error } = await supabase.from('scripts').insert({
          user_id: scriptOwnerId,
          workspace_id: workspaceId,
          title: payload.title,
          brand: payload.brand,
          industry: payload.industry,
          topic: payload.topic,
          background: payload.background,
          hook_code: payload.hook_code,
          trans_code: payload.trans_code,
          ending_code: payload.ending_code,
          ai_draft: payload.ai_draft,
          qc_final: payload.qc_final
        }));
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

  async function scheduleScript() {
    if (!user) return;
    if (!generatedScript.trim()) {
      Alert.alert('未有劇本', '請先生成劇本。');
      return;
    }

    setScheduling(true);
    try {
      const workspaceId = await resolveWorkspaceId(user.id, user.email);
      const title = draft.topic.trim() || draft.brand.trim() || 'IG Reel 劇本';
      const notes = [
        draft.brand.trim() ? `品牌 / 店名：${draft.brand.trim()}` : '',
        draft.background.trim() ? `題材背景：${draft.background.trim()}` : '',
        '',
        '劇本：',
        generatedScript.trim()
      ].filter((line) => line !== '').join('\n');

      const payload = {
        workspace_id: workspaceId,
        user_id: user.id,
        created_by: user.id,
        title,
        category: draft.industry,
        status: '構思中',
        current_stage: '構思中',
        pipeline_step: 'script',
        type: 'instagram',
        notes
      };

      let { error } = await supabase.from('projects').insert(payload);
      if (error) {
        ({ error } = await supabase.from('projects').insert({
          workspace_id: workspaceId,
          created_by: user.id,
          title,
          category: draft.industry,
          status: '構思中',
          current_stage: '構思中',
          pipeline_step: 'script',
          type: 'instagram'
        }));
      }
      if (error) throw error;

      Alert.alert('已加入工作板', '已建立新項目。');
      router.push('/(app)/tools/work-board' as never);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('排程失敗', message);
    } finally {
      setScheduling(false);
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
          <Text style={[styles.creditText, (creditBalance ?? 10) < 10 && styles.creditWarning]}>
            🪙 {creditBalance ?? '...'} Credits
          </Text>

          <View style={styles.formCard}>
            <FieldLabel>01 品牌 / 個人名稱</FieldLabel>
            <TextInput
              value={draft.brand}
              onChangeText={(brand) => setDraft((prev) => ({ ...prev, brand }))}
              placeholder="例：Renee"
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
            <OptionSelectButton option={hook} onPress={() => setOptionPicker('hook')} />

            <FieldLabel>06 轉場風格</FieldLabel>
            <OptionSelectButton option={transition} onPress={() => setOptionPicker('transition')} />

            <FieldLabel>07 Ending 風格</FieldLabel>
            <OptionSelectButton option={ending} onPress={() => setOptionPicker('ending')} />
          </View>

          <Text style={styles.creditHint}>每次生成扣 10 Credits</Text>
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
                  onPress={scheduleScript}
                  disabled={scheduling}
                  style={styles.secondaryButton}
                >
                  {scheduling ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryButtonText}>排程</Text>}
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
      {optionPickerConfig ? (
        <OptionPickerSheet
          visible={Boolean(optionPicker)}
          title={optionPickerConfig.title}
          options={optionPickerConfig.options}
          selectedKey={optionPickerConfig.selectedKey}
          onSelect={optionPickerConfig.onSelect}
          onClose={() => setOptionPicker(null)}
        />
      ) : null}
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
  creditText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    marginTop: -6,
    marginBottom: 4
  },
  creditWarning: {
    color: '#b45309'
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
  optionSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    padding: 14
  },
  optionSelectCopy: {
    flex: 1
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
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.36)'
  },
  optionSheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#F8F4EF',
    paddingTop: 10,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -8 }
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 99,
    backgroundColor: '#d8cec5',
    marginBottom: 12
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  sheetCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sheetList: {
    gap: 10,
    paddingBottom: 10
  },
  sheetOption: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: '#ffffff',
    padding: 14
  },
  sheetOptionActive: {
    backgroundColor: '#8B1A1A',
    borderColor: '#8B1A1A'
  },
  sheetOptionKey: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  sheetOptionTitle: {
    marginTop: 6,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 20
  },
  sheetOptionDescription: {
    marginTop: 5,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18
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
  creditHint: {
    color: '#888888',
    fontFamily: fonts.body,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: -8
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
