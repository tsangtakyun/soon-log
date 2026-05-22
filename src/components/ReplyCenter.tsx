import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type InboxType = 'email' | 'message' | 'fans';
type ThreadStatus = 'pending' | 'replied' | 'ignored' | 'follow_up' | 'important' | 'done';
type ReplyThread = {
  id: string;
  workspace_id: string | null;
  inbox_type: InboxType;
  sender_name: string | null;
  sender_handle: string | null;
  original_message: string;
  ai_reply: string | null;
  user_edited_reply: string | null;
  status: ThreadStatus;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};
type ReplySettings = {
  assistant_name?: string | null;
  tone?: string | null;
  reply_length?: string | null;
  creator_context?: string | null;
  avoid_topics?: string | null;
};

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
const inboxLabels: Record<InboxType, string> = {
  email: '電郵',
  message: '訊息',
  fans: '粉絲'
};
const inboxColors: Record<InboxType, string> = {
  email: colors.info,
  message: colors.success,
  fans: '#ec4899'
};
const statusMeta: Record<string, { label: string; color: string }> = {
  pending: { label: '待回覆', color: colors.warning },
  replied: { label: '已回覆', color: colors.success },
  ignored: { label: '已忽略', color: colors.textMuted },
  follow_up: { label: '待跟進', color: colors.warning },
  important: { label: '重要', color: colors.error },
  done: { label: '已完成', color: colors.textMuted }
};

function useKeyboardInset(safeBottom: number) {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardInset(Math.max(0, event.endCoordinates.height - safeBottom));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardInset(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [safeBottom]);

  return keyboardInset;
}

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 日前`;
}

export function ReplyCenter() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset(insets.bottom);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ReplyThread[]>([]);
  const [activeTab, setActiveTab] = useState('全部');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newSheetVisible, setNewSheetVisible] = useState(false);
  const [selectedThread, setSelectedThread] = useState<ReplyThread | null>(null);

  const resolveWorkspace = useCallback(async () => {
    if (!user) return null;

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (membership?.workspace_id) return membership.workspace_id as string;

    const { data: created, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        name: 'SOON-LOG',
        type: 'mixed',
        owner: user.email ?? null,
        owner_id: user.id
      })
      .select('id')
      .maybeSingle();

    if (workspaceError || !created?.id) return null;

    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: created.id,
        user_id: user.id,
        email: user.email ?? null,
        display_name: user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'SOON',
        role: 'owner',
        status: 'active',
        invited_by: user.id
      });

    if (memberError) return null;
    return created.id as string;
  }, [user]);

  const loadThreads = useCallback(async (showLoader = true) => {
    if (!user) return;
    if (showLoader) setLoading(true);
    try {
      const id = workspaceId ?? await resolveWorkspace();
      setWorkspaceId(id);

      const query = supabase
        .from('reply_threads')
        .select('*')
        .order('created_at', { ascending: false });

      const { data, error } = id
        ? await query.eq('workspace_id', id)
        : await query.is('workspace_id', null);

      if (error) throw error;
      setThreads((data ?? []) as ReplyThread[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '載入失敗';
      Alert.alert('回覆中心載入失敗', message);
    } finally {
      setLoading(false);
    }
  }, [resolveWorkspace, user, workspaceId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadThreads(false);
    } finally {
      setRefreshing(false);
    }
  }, [loadThreads]);

  const filteredThreads = useMemo(
    () => {
      const tabToInbox: Record<string, InboxType | null> = {
        全部: null,
        電郵: 'email',
        訊息: 'message',
        粉絲: 'fans'
      };
      const inboxType = tabToInbox[activeTab];
      return threads.filter((thread) => !inboxType || thread.inbox_type === inboxType);
    },
    [activeTab, threads]
  );

  async function createThread(draft: {
    inbox_type: InboxType;
    sender_name: string;
    original_message: string;
  }) {
    if (!user) return;
    const { error } = await supabase.from('reply_threads').insert({
      workspace_id: workspaceId ?? null,
      inbox_type: draft.inbox_type,
      sender_name: draft.sender_name.trim() || '未命名',
      original_message: draft.original_message.trim(),
      status: 'pending',
      created_by: user.id
    });

    if (error) {
      Alert.alert('建立失敗', error.message);
      return;
    }

    setNewSheetVisible(false);
    await loadThreads(false);
  }

  async function updateThreadLocally(threadId: string, patch: Partial<ReplyThread>) {
    setThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, ...patch } : thread));
    setSelectedThread((current) => current?.id === threadId ? { ...current, ...patch } : current);
  }

  function renderThread({ item }: { item: ReplyThread }) {
    const status = statusMeta[item.status] ?? statusMeta.pending;
    const hasReply = Boolean(item.user_edited_reply || item.ai_reply);

    return (
      <Pressable style={styles.threadCard} onPress={() => setSelectedThread(item)}>
        <View style={styles.threadHeader}>
          <View style={[styles.inboxBadge, { backgroundColor: inboxColors[item.inbox_type] }]}>
            <Text style={styles.inboxBadgeText}>{inboxLabels[item.inbox_type]}</Text>
          </View>
          <Text numberOfLines={1} style={styles.senderName}>{item.sender_name || '未命名'}</Text>
          <Text style={styles.threadTime}>{relativeTime(item.updated_at || item.created_at)}</Text>
        </View>
        <Text numberOfLines={2} style={styles.originalPreview}>{item.original_message}</Text>
        <View style={styles.threadFooter}>
          <View style={[styles.statusBadge, { backgroundColor: `${status.color}22` }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
          {hasReply ? <Text style={styles.replyReady}>✓ 已有回覆草稿</Text> : null}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ 
          paddingHorizontal: 16, 
          paddingVertical: 8,
          gap: 8,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        {['全部', '電郵', '訊息', '粉絲'].map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: activeTab === tab ? '#5C2A22' : '#f9fafb',
              borderWidth: 1,
              borderColor: activeTab === tab ? '#5C2A22' : '#e5e7eb',
            }}
          >
            <Text style={{
              fontSize: 13,
              color: activeTab === tab ? '#ffffff' : '#6b7280',
              fontWeight: activeTab === tab ? '600' : '400',
            }}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredThreads}
          keyExtractor={(item) => item.id}
          renderItem={renderThread}
          contentContainerStyle={filteredThreads.length ? styles.listContent : styles.emptyContent}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyTitle}>仲未有訊息</Text>
              <Text style={styles.emptySubtitle}>
                貼上 fans 或客戶嘅訊息{'\n'}
                Mayan 幫你生成最佳回覆
              </Text>
              <TouchableOpacity style={styles.emptyCTA} onPress={() => setNewSheetVisible(true)}>
                <Text style={styles.emptyCTAText}>+ 新增訊息</Text>
              </TouchableOpacity>
            </View>
          )}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setNewSheetVisible(true)}>
        <Text style={styles.fabText}>+ 新增訊息</Text>
      </TouchableOpacity>

      <NewThreadSheet
        visible={newSheetVisible}
        onClose={() => setNewSheetVisible(false)}
        onCreate={createThread}
        keyboardInset={keyboardInset}
      />
      <ThreadDetailSheet
        thread={selectedThread}
        onClose={() => setSelectedThread(null)}
        onRefresh={loadThreads}
        onLocalUpdate={updateThreadLocally}
        keyboardInset={keyboardInset}
      />
    </View>
  );
}

function NewThreadSheet({
  visible,
  onClose,
  onCreate,
  keyboardInset
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (draft: { inbox_type: InboxType; sender_name: string; original_message: string }) => Promise<void>;
  keyboardInset: number;
}) {
  const insets = useSafeAreaInsets();
  const [inboxType, setInboxType] = useState<InboxType>('fans');
  const [senderName, setSenderName] = useState('');
  const [originalMessage, setOriginalMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!originalMessage.trim()) {
      Alert.alert('請輸入原始訊息');
      return;
    }
    setSaving(true);
    await onCreate({ inbox_type: inboxType, sender_name: senderName, original_message: originalMessage });
    setSaving(false);
    setSenderName('');
    setOriginalMessage('');
    setInboxType('fans');
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoiding}
      >
        <View style={[styles.sheet, { bottom: keyboardInset, paddingBottom: insets.bottom + 18 }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>新增訊息</Text>
              <TouchableOpacity onPress={onClose}><Text style={styles.closeText}>×</Text></TouchableOpacity>
            </View>
            <View style={styles.typeSelector}>
              {(['email', 'message', 'fans'] as InboxType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typePill, inboxType === type && styles.typePillActive]}
                  onPress={() => setInboxType(type)}
                >
                  <Text style={[styles.typePillText, inboxType === type && styles.typePillTextActive]}>
                    {inboxLabels[type]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>發送者名稱</Text>
            <TextInput
              value={senderName}
              onChangeText={setSenderName}
              placeholder="例如：@username 或 粉絲名字"
              placeholderTextColor={colors.textMuted}
              style={styles.sheetInput}
            />
            <Text style={styles.inputLabel}>原始訊息</Text>
            <TextInput
              value={originalMessage}
              onChangeText={setOriginalMessage}
              placeholder="貼上 fan 或客戶嘅訊息..."
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.sheetInput, styles.messageInput]}
            />
            <TouchableOpacity style={[styles.primaryButton, saving && styles.disabled]} disabled={saving} onPress={submit}>
              <Text style={styles.primaryButtonText}>{saving ? '建立中...' : '建立'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ThreadDetailSheet({
  thread,
  onClose,
  onRefresh,
  onLocalUpdate,
  keyboardInset
}: {
  thread: ReplyThread | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onLocalUpdate: (threadId: string, patch: Partial<ReplyThread>) => Promise<void>;
  keyboardInset: number;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [replyText, setReplyText] = useState('');
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setReplyText(thread?.user_edited_reply || thread?.ai_reply || '');
    setNotes(thread?.notes || '');
  }, [thread]);

  useEffect(() => {
    if (!thread) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase
        .from('reply_threads')
        .update({ user_edited_reply: replyText, notes })
        .eq('id', thread.id);
      await onLocalUpdate(thread.id, { user_edited_reply: replyText, notes });
    }, 800);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [notes, onLocalUpdate, replyText, thread]);

  if (!thread) return null;

  async function generateReply() {
    if (!user || !thread) return;
    if (!ANTHROPIC_KEY) {
      Alert.alert('未設定 AI Key', '請先設定 EXPO_PUBLIC_ANTHROPIC_KEY。');
      return;
    }

    setGenerating(true);
    try {
      const { data: settings } = await supabase
        .from('reply_settings')
        .select('*')
        .eq('user_id', user.id)
        .eq('inbox_type', thread.inbox_type)
        .maybeSingle();

      const typedSettings = settings as ReplySettings | null;
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
          system: `你係 ${typedSettings?.assistant_name || 'Mayan'}，係創作者嘅虛擬助理。
語氣：${typedSettings?.tone || '友善'}
背景：${typedSettings?.creator_context || ''}
唔可以討論：${typedSettings?.avoid_topics || ''}
請自動偵測訊息語言，用同一語言回覆。
唔好透露你係 AI。保持自然、真誠。`,
          messages: [{ role: 'user', content: thread.original_message }]
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message ?? 'AI 生成失敗');
      const reply = data?.content?.[0]?.text ?? '';
      if (!reply) throw new Error('AI 回覆格式不正確');

      const { error } = await supabase
        .from('reply_threads')
        .update({ ai_reply: reply, user_edited_reply: reply })
        .eq('id', thread.id);

      if (error) throw error;
      setReplyText(reply);
      await onLocalUpdate(thread.id, { ai_reply: reply, user_edited_reply: reply });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('生成失敗', message);
    } finally {
      setGenerating(false);
    }
  }

  async function copyReply() {
    if (!replyText.trim()) return;
    const clipboard = (globalThis.navigator as { clipboard?: { writeText: (text: string) => Promise<void> } } | undefined)?.clipboard;
    if (clipboard) {
      await clipboard.writeText(replyText);
      Alert.alert('已複製');
      return;
    }
    await Share.share({ message: replyText });
  }

  async function markReplied() {
    if (!thread) return;
    const { error } = await supabase.from('reply_threads').update({ status: 'replied' }).eq('id', thread.id);
    if (error) {
      Alert.alert('更新失敗', error.message);
      return;
    }
    await onLocalUpdate(thread.id, { status: 'replied' });
    await onRefresh();
  }

  return (
    <Modal animationType="slide" transparent visible={Boolean(thread)} onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoiding}
      >
        <View style={[styles.detailSheet, { bottom: keyboardInset, paddingBottom: insets.bottom + 16 }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.detailTitleWrap}>
                <Text numberOfLines={1} style={styles.sheetTitle}>{thread.sender_name || '未命名'}</Text>
                <View style={[styles.inboxBadge, { backgroundColor: inboxColors[thread.inbox_type] }]}>
                  <Text style={styles.inboxBadgeText}>{inboxLabels[thread.inbox_type]}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose}><Text style={styles.closeText}>×</Text></TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>原始訊息</Text>
            <Text style={styles.originalBox}>{thread.original_message}</Text>

            <Text style={styles.sectionTitle}>AI 回覆</Text>
            {!replyText ? (
              <TouchableOpacity style={[styles.primaryButton, generating && styles.disabled]} disabled={generating} onPress={generateReply}>
                <Text style={styles.primaryButtonText}>{generating ? '生成中...' : '🤖 生成 AI 回覆'}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TextInput
                  value={replyText}
                  onChangeText={setReplyText}
                  multiline
                  style={styles.replyInput}
                />
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.actionButton} disabled={generating} onPress={generateReply}>
                    <Text style={styles.actionText}>🔄 重新生成</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={copyReply}>
                    <Text style={styles.actionText}>📋 複製</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionButton} onPress={markReplied}>
                    <Text style={styles.actionText}>✓ 標記已回覆</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <Text style={styles.sectionTitle}>標籤 + 備註</Text>
            <View style={styles.tagRow}>
              {(thread.tags ?? []).length > 0
                ? thread.tags?.map((tag) => <Text key={tag} style={styles.tagPill}>{tag}</Text>)
                : <Text style={styles.mutedText}>未有標籤</Text>}
            </View>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="備註"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.sheetInput, styles.notesInput]}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 96
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 96
  },
  threadCard: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyCard,
    padding: 14
  },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  inboxBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  inboxBadgeText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 11
  },
  senderName: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  threadTime: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  originalPreview: {
    marginTop: 10,
    color: '#3A3A3A',
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19
  },
  threadFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  statusText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  replyReady: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 28
  },
  emptyIcon: {
    fontSize: 42
  },
  emptyTitle: {
    marginTop: 10,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  emptySubtitle: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  emptyCTA: {
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 11
  },
  emptyCTAText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 18,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 13,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  fabText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  keyboardAvoiding: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end'
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.bgBody,
    padding: 20
  },
  detailSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.bgBody,
    padding: 20
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  detailTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  closeText: {
    color: colors.textMuted,
    fontSize: 28,
    lineHeight: 30
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16
  },
  typePill: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    paddingVertical: 9
  },
  typePillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  typePillText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  typePillTextActive: {
    color: colors.textOnDark
  },
  inputLabel: {
    marginBottom: 7,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  sheetInput: {
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14
  },
  messageInput: {
    minHeight: 120,
    textAlignVertical: 'top'
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingVertical: 14
  },
  primaryButtonText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  disabled: {
    opacity: 0.55
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 8,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  originalBox: {
    borderRadius: 8,
    backgroundColor: colors.bgBodyMuted,
    padding: 12,
    color: '#3A3A3A',
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21
  },
  replyInput: {
    minHeight: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    padding: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    textAlignVertical: 'top'
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12
  },
  actionButton: {
    borderRadius: 999,
    backgroundColor: colors.bgBodyMuted,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  actionText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10
  },
  tagPill: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  mutedText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top'
  }
});
