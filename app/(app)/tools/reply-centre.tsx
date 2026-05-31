import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
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
import { deductCredits, getCredits } from '@/lib/credits';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

type InboxFilter = '全部' | '電郵' | '訊息' | '粉絲';
type StatusFilter = '全部' | '未回覆' | '進行中' | '已解決';
type InboxType = 'email' | 'message' | 'fan';
type ReplyStatus = 'pending' | 'in_progress' | 'resolved';

type ReplyThread = {
  id: string;
  workspace_id?: string | null;
  inbox_type?: string | null;
  sender_name?: string | null;
  sender_handle?: string | null;
  original_message: string;
  ai_reply?: string | null;
  user_edited_reply?: string | null;
  status?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  follow_up_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
};

type MessageDraft = {
  inboxType: InboxType;
  senderName: string;
  senderHandle: string;
  originalMessage: string;
  aiReply: string;
  userEditedReply: string;
  status: ReplyStatus;
  tagsText: string;
  notes: string;
  followUpDate: Date | null;
};

type AnthropicTextBlock = {
  type?: string;
  text?: string;
};

const INBOX_TABS: InboxFilter[] = ['全部', '電郵', '訊息', '粉絲'];
const STATUS_FILTERS: StatusFilter[] = ['全部', '未回覆', '進行中', '已解決'];
const INBOX_OPTIONS: Array<{ label: InboxFilter; value: InboxType }> = [
  { label: '電郵', value: 'email' },
  { label: '訊息', value: 'message' },
  { label: '粉絲', value: 'fan' }
];
const STATUS_OPTIONS: Array<{ label: StatusFilter; value: ReplyStatus }> = [
  { label: '未回覆', value: 'pending' },
  { label: '進行中', value: 'in_progress' },
  { label: '已解決', value: 'resolved' }
];

const inboxColors: Record<InboxType, { bg: string; text: string }> = {
  email: { bg: '#eff6ff', text: '#2563eb' },
  message: { bg: '#f5f3ff', text: '#7c3aed' },
  fan: { bg: '#fdf2f8', text: '#db2777' }
};

const statusColors: Record<ReplyStatus, { bg: string; text: string }> = {
  pending: { bg: '#fef2f2', text: '#dc2626' },
  in_progress: { bg: '#fff7ed', text: '#ea580c' },
  resolved: { bg: '#ecfdf5', text: '#059669' }
};

const emptyDraft: MessageDraft = {
  inboxType: 'fan',
  senderName: '',
  senderHandle: '',
  originalMessage: '',
  aiReply: '',
  userEditedReply: '',
  status: 'pending',
  tagsText: '',
  notes: '',
  followUpDate: null
};

function normalizeInboxType(value?: string | null): InboxType {
  if (value === 'email') return 'email';
  if (value === 'message') return 'message';
  return 'fan';
}

function inboxLabel(value?: string | null) {
  const normalized = normalizeInboxType(value);
  if (normalized === 'email') return '電郵';
  if (normalized === 'message') return '訊息';
  return '粉絲';
}

function normalizeStatus(value?: string | null): ReplyStatus {
  if (value === 'resolved' || value === 'replied' || value === 'done') return 'resolved';
  if (value === 'in_progress' || value === 'follow_up' || value === 'important') return 'in_progress';
  return 'pending';
}

function statusLabel(value?: string | null) {
  const normalized = normalizeStatus(value);
  if (normalized === 'resolved') return '已解決';
  if (normalized === 'in_progress') return '進行中';
  return '未回覆';
}

function filterToInbox(value: InboxFilter) {
  if (value === '電郵') return 'email';
  if (value === '訊息') return 'message';
  if (value === '粉絲') return 'fan';
  return null;
}

function filterToStatus(value: StatusFilter) {
  if (value === '未回覆') return 'pending';
  if (value === '進行中') return 'in_progress';
  if (value === '已解決') return 'resolved';
  return null;
}

function relativeTime(value?: string | null) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小時前`;
  return `${Math.floor(hours / 24)}日前`;
}

function firstLetter(value?: string | null) {
  const clean = value?.trim();
  return clean ? clean.slice(0, 1).toUpperCase() : '?';
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: Date | null) {
  if (!value) return '選擇日期';
  return new Intl.DateTimeFormat('zh-HK', { year: 'numeric', month: 'short', day: 'numeric' }).format(value);
}

function dateKey(value: Date | null) {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function tagsToText(tags?: string[] | null) {
  return (tags ?? []).join(', ');
}

function textToTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function draftFromThread(thread: ReplyThread): MessageDraft {
  const aiReply = thread.ai_reply ?? '';
  return {
    inboxType: normalizeInboxType(thread.inbox_type),
    senderName: thread.sender_name ?? '',
    senderHandle: thread.sender_handle ?? '',
    originalMessage: thread.original_message ?? '',
    aiReply,
    userEditedReply: thread.user_edited_reply || aiReply,
    status: normalizeStatus(thread.status),
    tagsText: tagsToText(thread.tags),
    notes: thread.notes ?? '',
    followUpDate: parseDate(thread.follow_up_date)
  };
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

function Badge({ label, color }: { label: string; color: { bg: string; text: string } }) {
  return (
    <View style={[styles.badge, { backgroundColor: color.bg }]}>
      <Text style={[styles.badgeText, { color: color.text }]}>{label}</Text>
    </View>
  );
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
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function MessageCard({ thread, onPress }: { thread: ReplyThread; onPress: () => void }) {
  const inbox = normalizeInboxType(thread.inbox_type);
  const status = normalizeStatus(thread.status);
  const hasAi = Boolean(thread.ai_reply);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.86} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{firstLetter(thread.sender_name)}</Text>
        </View>
        <View style={styles.senderBlock}>
          <Text numberOfLines={1} style={styles.senderName}>{thread.sender_name || '未命名'}</Text>
          {thread.sender_handle ? <Text numberOfLines={1} style={styles.senderHandle}>{thread.sender_handle}</Text> : null}
        </View>
        <Text style={styles.timeText}>{relativeTime(thread.updated_at || thread.created_at)}</Text>
      </View>

      <Text numberOfLines={2} style={styles.messagePreview}>{thread.original_message}</Text>

      <View style={styles.cardFooter}>
        <Badge label={statusLabel(status)} color={statusColors[status]} />
        <Badge label={inboxLabel(inbox)} color={inboxColors[inbox]} />
        {hasAi ? (
          <View style={styles.aiBadge}>
            <Feather name="zap" size={12} color={colors.primary} />
            <Text style={styles.aiBadgeText}>AI</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function MessageSheet({
  visible,
  mode,
  draft,
  saving,
  deleting,
  generating,
  onChange,
  onClose,
  onSave,
  onDelete,
  onGenerate
}: {
  visible: boolean;
  mode: 'add' | 'detail';
  draft: MessageDraft;
  saving: boolean;
  deleting?: boolean;
  generating?: boolean;
  onChange: (draft: MessageDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  onGenerate?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [showDatePicker, setShowDatePicker] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetKeyboard}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>{mode === 'add' ? '新增訊息' : '訊息詳情'}</Text>
                <Text style={styles.sheetSubtitle}>{mode === 'add' ? '貼上 fans 或客戶訊息' : '生成、編輯同跟進回覆'}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Feather name="x" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <FieldLabel>訊息來源</FieldLabel>
              <View style={styles.chipWrap}>
                {INBOX_OPTIONS.map((option) => (
                  <Chip key={option.value} label={option.label} active={draft.inboxType === option.value} onPress={() => onChange({ ...draft, inboxType: option.value })} />
                ))}
              </View>

              <FieldLabel>發送者名稱</FieldLabel>
              <TextInput
                value={draft.senderName}
                onChangeText={(senderName) => onChange({ ...draft, senderName })}
                placeholder="例如：Tommy / 客戶名稱"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <FieldLabel>發送者帳號</FieldLabel>
              <TextInput
                value={draft.senderHandle}
                onChangeText={(senderHandle) => onChange({ ...draft, senderHandle })}
                placeholder="@handle"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                style={styles.input}
              />

              <FieldLabel>訊息內容</FieldLabel>
              <TextInput
                value={draft.originalMessage}
                onChangeText={(originalMessage) => onChange({ ...draft, originalMessage })}
                placeholder="貼上原始訊息..."
                placeholderTextColor="#9ca3af"
                style={[styles.input, styles.messageInput]}
                multiline
                textAlignVertical="top"
                editable={mode === 'add'}
              />

              {mode === 'detail' ? (
                <>
                  <View style={styles.sectionDivider} />
                  <Text style={styles.sectionTitle}>AI 回覆</Text>
                  {draft.aiReply ? <Text style={styles.aiReplyText}>{draft.aiReply}</Text> : <Text style={styles.emptyHint}>未有 AI 回覆</Text>}
                  <TouchableOpacity onPress={onGenerate} disabled={generating} style={[styles.generateButton, generating && styles.disabledButton]}>
                    {generating ? <ActivityIndicator color="#ffffff" /> : (
                      <>
                        <Feather name="zap" size={15} color="#ffffff" />
                        <Text style={styles.generateButtonText}>AI 生成回覆</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.creditHint}>每次 AI 生成扣 10 Credits</Text>

                  <FieldLabel>我的回覆</FieldLabel>
                  <TextInput
                    value={draft.userEditedReply}
                    onChangeText={(userEditedReply) => onChange({ ...draft, userEditedReply })}
                    placeholder="你可以直接編輯 AI 回覆..."
                    placeholderTextColor="#9ca3af"
                    style={[styles.input, styles.replyInput]}
                    multiline
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    onPress={async () => {
                      await Clipboard.setStringAsync(draft.userEditedReply || draft.aiReply);
                      Alert.alert('已複製', '回覆已複製到剪貼板');
                    }}
                    style={styles.copyButton}
                  >
                    <Feather name="copy" size={15} color={colors.primary} />
                    <Text style={styles.copyButtonText}>複製回覆</Text>
                  </TouchableOpacity>

                  <FieldLabel>更新狀態</FieldLabel>
                  <View style={styles.chipWrap}>
                    {STATUS_OPTIONS.map((option) => (
                      <Chip key={option.value} label={option.label} active={draft.status === option.value} onPress={() => onChange({ ...draft, status: option.value })} />
                    ))}
                  </View>
                </>
              ) : null}

              <FieldLabel>標籤</FieldLabel>
              <TextInput
                value={draft.tagsText}
                onChangeText={(tagsText) => onChange({ ...draft, tagsText })}
                placeholder="合作, 報價, 急件"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <FieldLabel>備註</FieldLabel>
              <TextInput
                value={draft.notes}
                onChangeText={(notes) => onChange({ ...draft, notes })}
                placeholder="內部備註、跟進方向..."
                placeholderTextColor="#9ca3af"
                style={[styles.input, styles.notesInput]}
                multiline
                textAlignVertical="top"
              />

              <FieldLabel>跟進日期</FieldLabel>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
                <Text style={styles.dateButtonText}>{formatDate(draft.followUpDate)}</Text>
                {draft.followUpDate ? (
                  <TouchableOpacity onPress={() => onChange({ ...draft, followUpDate: null })} hitSlop={8}>
                    <Text style={styles.clearDate}>清除</Text>
                  </TouchableOpacity>
                ) : <Feather name="calendar" size={16} color={colors.textMuted} />}
              </TouchableOpacity>

              {showDatePicker ? (
                <DateTimePicker
                  value={draft.followUpDate ?? new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={(_, selected) => {
                    if (Platform.OS !== 'ios') setShowDatePicker(false);
                    if (selected) onChange({ ...draft, followUpDate: selected });
                  }}
                />
              ) : null}

              <TouchableOpacity onPress={onSave} disabled={saving} style={[styles.saveButton, saving && styles.disabledButton]}>
                {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveButtonText}>{mode === 'add' ? '新增訊息' : '儲存'}</Text>}
              </TouchableOpacity>

              {mode === 'detail' && onDelete ? (
                <TouchableOpacity onPress={onDelete} disabled={deleting} style={styles.deleteButton}>
                  {deleting ? <ActivityIndicator color={colors.error} /> : <Text style={styles.deleteText}>刪除</Text>}
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function ReplyCentreToolScreen() {
  const { user } = useAuth();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ReplyThread[]>([]);
  const [activeInbox, setActiveInbox] = useState<InboxFilter>('全部');
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('全部');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedThread, setSelectedThread] = useState<ReplyThread | null>(null);
  const [draft, setDraft] = useState<MessageDraft>(emptyDraft);

  const counts = useMemo(() => {
    return INBOX_TABS.reduce<Record<InboxFilter, number>>((acc, tab) => {
      const inbox = filterToInbox(tab);
      acc[tab] = inbox ? threads.filter((thread) => normalizeInboxType(thread.inbox_type) === inbox).length : threads.length;
      return acc;
    }, { 全部: 0, 電郵: 0, 訊息: 0, 粉絲: 0 });
  }, [threads]);

  const filteredThreads = useMemo(() => {
    const inbox = filterToInbox(activeInbox);
    const status = filterToStatus(activeStatus);
    const needle = query.trim().toLowerCase();

    return threads.filter((thread) => {
      if (inbox && normalizeInboxType(thread.inbox_type) !== inbox) return false;
      if (status && normalizeStatus(thread.status) !== status) return false;
      if (!needle) return true;
      return [
        thread.sender_name,
        thread.sender_handle,
        thread.original_message
      ].some((value) => (value ?? '').toLowerCase().includes(needle));
    });
  }, [activeInbox, activeStatus, query, threads]);

  const loadThreads = useCallback(async (showLoader = true) => {
    if (!user) return;
    if (showLoader) setLoading(true);

    try {
      const id = workspaceId ?? await resolveWorkspaceId(user.id, user.email);
      setWorkspaceId(id);

      const queryBuilder = supabase
        .from('reply_threads')
        .select('*')
        .order('created_at', { ascending: false });

      const { data, error } = id
        ? await queryBuilder.eq('workspace_id', id)
        : await queryBuilder.eq('created_by', user.id);

      if (error) throw error;
      setThreads((data ?? []) as ReplyThread[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '載入失敗';
      Alert.alert('回覆中心載入失敗', message);
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [user, workspaceId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

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
      // Credit display should not block reply generation.
    }
  }, [user?.email]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadThreads(false);
    } finally {
      setRefreshing(false);
    }
  }

  function openAddModal() {
    setDraft(emptyDraft);
    setShowAddModal(true);
  }

  function openDetail(thread: ReplyThread) {
    setSelectedThread(thread);
    setDraft(draftFromThread(thread));
  }

  function payloadFromDraft() {
    return {
      inbox_type: draft.inboxType,
      sender_name: draft.senderName.trim() || '未命名',
      sender_handle: draft.senderHandle.trim() || null,
      original_message: draft.originalMessage.trim(),
      ai_reply: draft.aiReply.trim() || null,
      user_edited_reply: draft.userEditedReply.trim() || null,
      status: draft.status,
      tags: textToTags(draft.tagsText),
      notes: draft.notes.trim() || null,
      follow_up_date: dateKey(draft.followUpDate)
    };
  }

  async function saveNewMessage() {
    if (!user) return;
    if (!draft.originalMessage.trim()) {
      Alert.alert('請輸入訊息內容');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('reply_threads').insert({
        ...payloadFromDraft(),
        workspace_id: workspaceId,
        created_by: user.id
      });
      if (error) throw error;
      setShowAddModal(false);
      await loadThreads(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('新增失敗', message);
    } finally {
      setSaving(false);
    }
  }

  async function updateMessage() {
    if (!selectedThread) return;
    if (!draft.originalMessage.trim()) {
      Alert.alert('訊息內容不能留空');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('reply_threads')
        .update({
          ...payloadFromDraft(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedThread.id);
      if (error) throw error;
      setSelectedThread(null);
      await loadThreads(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('儲存失敗', message);
    } finally {
      setSaving(false);
    }
  }

  async function generateReply() {
    if (!selectedThread) return;
    if (!ANTHROPIC_KEY) {
      Alert.alert('未設定 AI Key', '請先設定 EXPO_PUBLIC_ANTHROPIC_KEY。');
      return;
    }

    setGenerating(true);
    try {
      const email = user?.email?.trim().toLowerCase();
      if (email) {
        const creditResult = await deductCredits(email, 'ai_generate');
        setCreditBalance(creditResult.balance);

        if (!creditResult.success && creditResult.error === 'insufficient_credits') {
          Alert.alert('Credits 不足', `需要 10 Credits 生成回覆\n現有：${creditResult.balance} Credits`, [{ text: '了解' }]);
          return;
        }
      }

      const prompt = `你係一個專業香港創作者助手。以下係一條來自${inboxLabel(draft.inboxType)}嘅訊息，請用廣東話口語幫我生成一個友善、專業嘅回覆。訊息：${draft.originalMessage}`;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'AI 生成失敗');
      const reply = (data.content as AnthropicTextBlock[] | undefined)
        ?.map((block) => block.text)
        .filter(Boolean)
        .join('\n')
        .trim();
      if (!reply) throw new Error('AI 沒有返回內容');

      setDraft((current) => ({
        ...current,
        aiReply: reply,
        userEditedReply: current.userEditedReply || reply,
        status: current.status === 'pending' ? 'in_progress' : current.status
      }));
      await refreshCreditBalance();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('AI 生成失敗', message);
    } finally {
      setGenerating(false);
    }
  }

  function confirmDeleteMessage() {
    if (!selectedThread) return;
    Alert.alert('刪除訊息', '確定要刪除這條訊息？', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const { error } = await supabase.from('reply_threads').delete().eq('id', selectedThread.id);
            if (error) throw error;
            setSelectedThread(null);
            await loadThreads(false);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '請稍後再試';
            Alert.alert('刪除失敗', message);
          } finally {
            setDeleting(false);
          }
        }
      }
    ]);
  }

  return (
    <View style={styles.screen}>
      <BackHeader
        title="回覆中心"
        backTo="/(app)/tools"
        rightElement={
          <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ 新增訊息</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.headerText}>
        <View>
          <Text style={styles.title}>回覆中心</Text>
          <Text style={styles.subtitle}>AI 幫你覆 fans 同客</Text>
        </View>
        <Text style={[styles.creditText, (creditBalance ?? 10) < 10 && styles.creditWarning]}>
          🪙 {creditBalance ?? '...'} Credits
        </Text>
      </View>

      <View style={styles.inboxTabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inboxTabsContent}>
          {INBOX_TABS.map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveInbox(tab)} style={styles.inboxTabButton}>
              <View style={styles.tabLabelRow}>
                <Text style={[styles.inboxTabText, activeInbox === tab && styles.inboxTabTextActive]}>{tab}</Text>
                <View style={[styles.countBadge, activeInbox === tab && styles.countBadgeActive]}>
                  <Text style={[styles.countBadgeText, activeInbox === tab && styles.countBadgeTextActive]}>{counts[tab]}</Text>
                </View>
              </View>
              {activeInbox === tab ? <View style={styles.tabUnderline} /> : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusChips}>
        {STATUS_FILTERS.map((status) => (
          <TouchableOpacity key={status} onPress={() => setActiveStatus(status)} style={[styles.statusFilterChip, activeStatus === status && styles.statusFilterChipActive]}>
            <Text style={[styles.statusFilterText, activeStatus === status && styles.statusFilterTextActive]}>{status}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.searchBox}>
        <Feather name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜尋發送者、帳號或訊息內容"
          placeholderTextColor="#9ca3af"
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filteredThreads}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={filteredThreads.length === 0 ? styles.emptyList : styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="message-circle" size={40} color="#d1d5db" />
              <Text style={styles.emptyTitle}>未有訊息</Text>
              <Text style={styles.emptyBody}>點擊 + 新增訊息</Text>
            </View>
          }
          renderItem={({ item }) => <MessageCard thread={item} onPress={() => openDetail(item)} />}
        />
      )}

      <MessageSheet
        visible={showAddModal}
        mode="add"
        draft={draft}
        saving={saving}
        onChange={setDraft}
        onClose={() => setShowAddModal(false)}
        onSave={saveNewMessage}
      />

      <MessageSheet
        visible={!!selectedThread}
        mode="detail"
        draft={draft}
        saving={saving}
        deleting={deleting}
        generating={generating}
        onChange={setDraft}
        onClose={() => setSelectedThread(null)}
        onSave={updateMessage}
        onDelete={confirmDeleteMessage}
        onGenerate={generateReply}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F3EA'
  },
  headerText: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    fontWeight: '800'
  },
  subtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  creditText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    paddingBottom: 1
  },
  creditWarning: {
    color: '#b45309'
  },
  addButton: {
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  addButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  inboxTabs: {
    borderBottomWidth: 1,
    borderBottomColor: '#eadfd4'
  },
  inboxTabsContent: {
    paddingHorizontal: 16,
    gap: 20
  },
  inboxTabButton: {
    paddingTop: 8,
    paddingBottom: 10,
    alignItems: 'center'
  },
  tabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  inboxTabText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 15
  },
  inboxTabTextActive: {
    color: colors.primary,
    fontFamily: fonts.bodyBold
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  countBadgeActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  countBadgeText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 10
  },
  countBadgeTextActive: {
    color: '#ffffff'
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    width: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary
  },
  statusChips: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8
  },
  statusFilterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: '#ffffff',
    paddingHorizontal: 13,
    paddingVertical: 7
  },
  statusFilterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  statusFilterText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  statusFilterTextActive: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold
  },
  searchBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  list: {
    padding: 16,
    paddingBottom: 110
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 120
  },
  emptyState: {
    alignItems: 'center'
  },
  emptyTitle: {
    marginTop: 12,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  emptyBody: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: '#ffffff',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  senderBlock: {
    flex: 1
  },
  senderName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  senderHandle: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  timeText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  messagePreview: {
    marginTop: 12,
    color: '#3A3A3A',
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20
  },
  cardFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  badgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11
  },
  aiBadge: {
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  aiBadgeText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 11
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end'
  },
  sheetKeyboard: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  sheet: {
    maxHeight: '94%',
    minHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 10
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d1d5db',
    marginBottom: 12
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    fontWeight: '800'
  },
  sheetSubtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  fieldLabel: {
    marginTop: 14,
    marginBottom: 7,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15
  },
  messageInput: {
    minHeight: 118,
    lineHeight: 21
  },
  replyInput: {
    minHeight: 140,
    lineHeight: 21
  },
  notesInput: {
    minHeight: 90,
    lineHeight: 21
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: '#ffffff',
    paddingHorizontal: 13,
    paddingVertical: 8
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  chipText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  chipTextActive: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.bodyBorder,
    marginTop: 18,
    marginBottom: 14
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    marginBottom: 10
  },
  aiReplyText: {
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    padding: 12,
    color: '#3A3A3A',
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21
  },
  emptyHint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14
  },
  generateButton: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7
  },
  generateButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  creditHint: {
    color: '#888888',
    fontFamily: fonts.body,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 6
  },
  copyButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  copyButtonText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  dateButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  dateButtonText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15
  },
  clearDate: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  saveButton: {
    marginTop: 22,
    borderRadius: 14,
    backgroundColor: colors.primary,
    paddingVertical: 15,
    alignItems: 'center'
  },
  disabledButton: {
    opacity: 0.65
  },
  saveButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  deleteButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 13
  },
  deleteText: {
    color: colors.error,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  }
});
