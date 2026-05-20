import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Profile, WorkItem, WorkPriority, WorkStatus } from '@/types';

const STATUSES: { value: WorkStatus; label: string; color: string }[] = [
  { value: 'todo', label: '待辦', color: '#888880' },
  { value: 'in_progress', label: '進行中', color: '#E8614A' },
  { value: 'done', label: '完成', color: '#4ACC7A' },
  { value: 'blocked', label: '阻塞', color: '#CC4444' }
];

const PRIORITIES: WorkPriority[] = ['low', 'medium', 'high'];

function statusConfig(status: WorkStatus) {
  return STATUSES.find((item) => item.value === status) ?? STATUSES[0];
}

function nextStatus(status: WorkStatus) {
  const index = STATUSES.findIndex((item) => item.value === status);
  return STATUSES[(index + 1) % STATUSES.length].value;
}

function nextPriority(priority: WorkPriority) {
  const index = PRIORITIES.indexOf(priority);
  return PRIORITIES[(index + 1) % PRIORITIES.length];
}

function formatDate(value: string | null) {
  if (!value) return '未設定';
  return new Intl.DateTimeFormat('zh-HK', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function Avatar({ profile }: { profile?: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null }) {
  const name = profile?.display_name ?? profile?.username ?? 'S';
  if (profile?.avatar_url) {
    return <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />;
  }
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export default function WorkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workId = Array.isArray(id) ? id[0] : id;
  const { user } = useAuth();
  const [item, setItem] = useState<WorkItem | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadItem = useCallback(async () => {
    if (!workId) return;
    const { data, error } = await supabase
      .from('work_items')
      .select('*, assignee:profiles!work_items_assignee_id_fkey(id, username, display_name, avatar_url)')
      .eq('id', workId)
      .single();

    if (error) {
      Alert.alert('載入失敗', error.message);
      return;
    }

    const nextItem = data as WorkItem;
    setItem(nextItem);
    setTitle(nextItem.title);
    setDescription(nextItem.description ?? '');
    setTagsText(nextItem.tags.join(', '));
    loadedRef.current = true;
  }, [workId]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  const savePatch = useCallback(async (patch: Partial<WorkItem>) => {
    if (!workId) return;
    setSaving(true);
    const { error } = await supabase
      .from('work_items')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', workId);

    if (error) {
      Alert.alert('儲存失敗', error.message);
    }
    setSaving(false);
  }, [workId]);

  useEffect(() => {
    if (!loadedRef.current || !item) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(() => {
      const nextTags = tagsText.split(',').map((tag) => tag.trim()).filter(Boolean);
      savePatch({
        title: title.trim() || item.title,
        description: description.trim() || null,
        tags: nextTags
      }).then(() => {
        setItem((current) => current ? {
          ...current,
          title: title.trim() || current.title,
          description: description.trim() || null,
          tags: nextTags
        } : current);
      });
    }, 500);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [description, item, savePatch, tagsText, title]);

  const updateStatus = async (status: WorkStatus) => {
    if (!item) return;
    setItem({ ...item, status });
    await savePatch({ status });
  };

  const updatePriority = async () => {
    if (!item) return;
    const priority = nextPriority(item.priority);
    setItem({ ...item, priority });
    await savePatch({ priority });
  };

  const deleteItem = () => {
    if (!item) return;
    Alert.alert('刪除任務', '確定要刪除呢個任務？', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('work_items').delete().eq('id', item.id);
          if (error) {
            Alert.alert('刪除失敗', error.message);
            return;
          }
          router.replace('/work');
        }
      }
    ]);
  };

  const statusPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -60) updateStatus('done');
    }
  }), [item]);

  if (!item) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>載入任務...</Text>
        </View>
      </Screen>
    );
  }

  const status = statusConfig(item.status);
  const assigneeName = item.assignee?.display_name ?? item.assignee?.username ?? '未指派';
  const ownerLabel = user?.id === item.user_id ? '你建立' : '團隊任務';

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable onPress={() => router.back()}><Text style={styles.back}>返回</Text></Pressable>
            <Text style={styles.saveState}>{saving ? '儲存中' : '已同步'}</Text>
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="任務標題"
            placeholderTextColor={colors.textMuted}
            style={styles.titleInput}
            multiline
          />

          <Pressable
            onPress={() => updateStatus(nextStatus(item.status))}
            style={[styles.statusCard, { borderColor: status.color }]}
            {...statusPanResponder.panHandlers}
          >
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <View style={styles.statusTextWrap}>
              <Text style={styles.statusLabel}>{status.label}</Text>
              <Text style={styles.statusHint}>點按切換狀態，向左掃即完成</Text>
            </View>
          </Pressable>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>描述</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="加入任務細節"
              placeholderTextColor={colors.textMuted}
              style={styles.descriptionInput}
              multiline
            />
          </View>

          <View style={styles.grid}>
            <Pressable onPress={updatePriority} style={styles.infoCard}>
              <Text style={styles.fieldLabel}>優先度</Text>
              <PriorityBadge priority={item.priority} />
            </Pressable>
            <View style={styles.infoCard}>
              <Text style={styles.fieldLabel}>到期日</Text>
              <Text style={styles.infoText}>{formatDate(item.due_date)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>指派</Text>
            <View style={styles.assigneeRow}>
              {item.assignee ? <Avatar profile={item.assignee} /> : null}
              <Text style={styles.infoText}>{assigneeName}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>標籤</Text>
            <TextInput
              value={tagsText}
              onChangeText={setTagsText}
              placeholder="標籤，以逗號分隔"
              placeholderTextColor={colors.textMuted}
              style={styles.tagsInput}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>記錄</Text>
            <Text style={styles.infoText}>{ownerLabel}</Text>
            <Text style={styles.metaText}>建立：{new Date(item.created_at).toLocaleString('zh-HK')}</Text>
            <Text style={styles.metaText}>更新：{new Date(item.updated_at).toLocaleString('zh-HK')}</Text>
          </View>

          <Pressable onPress={deleteItem} style={styles.deleteButton}>
            <Text style={styles.deleteText}>刪除任務</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 46,
    gap: 14
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 15
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  back: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  saveState: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  titleInput: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 34,
    lineHeight: 39,
    padding: 0
  },
  statusCard: {
    minHeight: 70,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: colors.bgCard,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  statusTextWrap: {
    flex: 1
  },
  statusLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  statusHint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2
  },
  card: {
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    padding: 16,
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 1
  },
  grid: {
    flexDirection: 'row',
    gap: 12
  },
  infoCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    padding: 16,
    gap: 10
  },
  fieldLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  descriptionInput: {
    minHeight: 118,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: 'top'
  },
  tagsInput: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16
  },
  infoText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  metaText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bgMuted
  },
  avatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMuted
  },
  avatarText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  deleteButton: {
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0EE'
  },
  deleteText: {
    color: '#CC4444',
    fontFamily: fonts.bodyBold,
    fontSize: 15
  }
});
