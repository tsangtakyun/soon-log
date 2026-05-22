import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type InboxType = 'email' | 'message' | 'fans';
type ReplySetting = {
  assistant_name: string;
  tone: string;
  reply_length: string;
  creator_context: string;
  avoid_topics: string;
};

const inboxTabs: Array<{ key: InboxType; label: string }> = [
  { key: 'email', label: '電郵' },
  { key: 'message', label: '訊息' },
  { key: 'fans', label: '粉絲' }
];
const toneOptions = ['友善', '專業', '輕鬆', '正式'];
const lengthOptions = ['簡短', '適中', '詳細'];
const defaultSetting: ReplySetting = {
  assistant_name: 'Mayan',
  tone: '友善',
  reply_length: '適中',
  creator_context: '',
  avoid_topics: ''
};

export default function ReplySettingsScreen() {
  const { user } = useAuth();
  const [activeInbox, setActiveInbox] = useState<InboxType>('email');
  const [settings, setSettings] = useState<Record<InboxType, ReplySetting>>({
    email: defaultSetting,
    message: defaultSetting,
    fans: defaultSetting
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('reply_settings')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      Alert.alert('載入失敗', error.message);
      setLoading(false);
      return;
    }

    const next: Record<InboxType, ReplySetting> = {
      email: { ...defaultSetting },
      message: { ...defaultSetting },
      fans: { ...defaultSetting }
    };

    (data ?? []).forEach((row) => {
      const inbox = row.inbox_type as InboxType;
      if (inbox in next) {
        next[inbox] = {
          assistant_name: row.assistant_name || 'Mayan',
          tone: row.tone || '友善',
          reply_length: row.reply_length || '適中',
          creator_context: row.creator_context || '',
          avoid_topics: row.avoid_topics || ''
        };
      }
    });

    setSettings(next);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function updateActive(patch: Partial<ReplySetting>) {
    setSettings((current) => ({
      ...current,
      [activeInbox]: {
        ...current[activeInbox],
        ...patch
      }
    }));
  }

  async function saveSettings() {
    if (!user) return;
    setSaving(true);
    const rows = inboxTabs.map((tab) => ({
      user_id: user.id,
      inbox_type: tab.key,
      ...settings[tab.key]
    }));

    const { error } = await supabase
      .from('reply_settings')
      .upsert(rows, { onConflict: 'user_id,inbox_type' });

    setSaving(false);
    if (error) {
      Alert.alert('儲存失敗', error.message);
      return;
    }

    Alert.alert('已儲存', 'AI 回覆設定已更新。');
  }

  const current = settings[activeInbox];

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← 返回</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>AI 回覆設定</Text>
            <Text style={styles.subtitle}>設定 Mayan 嘅回覆風格</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.tabs}>
              {inboxTabs.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tab, activeInbox === tab.key && styles.tabActive]}
                  onPress={() => setActiveInbox(tab.key)}
                >
                  <Text style={[styles.tabText, activeInbox === tab.key && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Assistant name</Text>
            <TextInput
              value={current.assistant_name}
              onChangeText={(text) => updateActive({ assistant_name: text })}
              placeholder="Mayan"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Tone</Text>
            <View style={styles.pillRow}>
              {toneOptions.map((tone) => (
                <TouchableOpacity
                  key={tone}
                  style={[styles.pill, current.tone === tone && styles.pillActive]}
                  onPress={() => updateActive({ tone })}
                >
                  <Text style={[styles.pillText, current.tone === tone && styles.pillTextActive]}>{tone}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Reply length</Text>
            <View style={styles.pillRow}>
              {lengthOptions.map((reply_length) => (
                <TouchableOpacity
                  key={reply_length}
                  style={[styles.pill, current.reply_length === reply_length && styles.pillActive]}
                  onPress={() => updateActive({ reply_length })}
                >
                  <Text style={[styles.pillText, current.reply_length === reply_length && styles.pillTextActive]}>{reply_length}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Creator context</Text>
            <TextInput
              value={current.creator_context}
              onChangeText={(text) => updateActive({ creator_context: text })}
              placeholder="關於創作者嘅背景資料，幫助 AI 更好地代表你回覆"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, styles.multiline]}
            />

            <Text style={styles.label}>Avoid topics</Text>
            <TextInput
              value={current.avoid_topics}
              onChangeText={(text) => updateActive({ avoid_topics: text })}
              placeholder="唔想討論嘅話題"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} disabled={saving} onPress={saveSettings}>
              <Text style={styles.saveButtonText}>{saving ? '儲存中...' : '儲存設定'}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  container: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.bodyBorder
  },
  backText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center'
  },
  headerSpacer: {
    width: 52
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  subtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    padding: 16,
    paddingBottom: 40
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    paddingVertical: 9
  },
  tabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  tabText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  tabTextActive: {
    color: colors.textOnDark
  },
  label: {
    marginBottom: 8,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  input: {
    marginBottom: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14
  },
  multiline: {
    minHeight: 120,
    textAlignVertical: 'top'
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  pillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  pillText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  pillTextActive: {
    color: colors.textOnDark
  },
  saveButton: {
    marginTop: 8,
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingVertical: 15
  },
  saveButtonText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  disabled: {
    opacity: 0.55
  }
});
