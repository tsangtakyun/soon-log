import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Screen, Title } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { WorkPriority, WorkStatus } from '@/types';

const STATUS_OPTIONS: { value: WorkStatus; label: string }[] = [
  { value: 'todo', label: '待辦' },
  { value: 'in_progress', label: '進行中' },
  { value: 'done', label: '完成' },
  { value: 'blocked', label: '阻塞' }
];

const PRIORITY_OPTIONS: { value: WorkPriority; label: string }[] = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' }
];

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function Segment<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segment}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.segmentButton, active && styles.segmentActive]}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function CreateWorkItemScreen() {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<WorkStatus>('todo');
  const [priority, setPriority] = useState<WorkPriority>('medium');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!user || !title.trim()) return;
    try {
      setLoading(true);
      const fallbackUsername = user.email?.split('@')[0] ?? user.id.slice(0, 8);
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        username: user.user_metadata?.preferred_username ?? fallbackUsername,
        display_name: user.user_metadata?.full_name ?? fallbackUsername,
        avatar_url: user.user_metadata?.avatar_url ?? null,
        region: 'HK'
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (profileError) throw profileError;

      const normalizedTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
      const { error } = await supabase.from('work_items').insert({
        user_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        due_date: dueDate ? isoDate(dueDate) : null,
        tags: normalizedTags
      });

      if (error) throw error;
      router.replace('/work');
    } catch (error) {
      Alert.alert('建立失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Title>新增任務</Title>
            <Pressable onPress={() => router.back()}><Text style={styles.close}>關閉</Text></Pressable>
          </View>

          <Field value={title} onChangeText={setTitle} placeholder="任務標題" />
          <Field value={description} onChangeText={setDescription} placeholder="描述、交付內容、備註" multiline />
          <Segment label="狀態" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
          <Segment label="優先度" value={priority} options={PRIORITY_OPTIONS} onChange={setPriority} />

          <View style={styles.group}>
            <Text style={styles.label}>到期日</Text>
            <Pressable onPress={() => setShowPicker(true)} style={styles.dateButton}>
              <Text style={styles.dateText}>{dueDate ? isoDate(dueDate) : '選擇日期'}</Text>
              {dueDate ? <Pressable onPress={() => setDueDate(null)} hitSlop={8}><Text style={styles.clearDate}>清除</Text></Pressable> : null}
            </Pressable>
            {showPicker ? (
              <DateTimePicker
                value={dueDate ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_, selected) => {
                  if (Platform.OS !== 'ios') setShowPicker(false);
                  if (selected) setDueDate(selected);
                }}
              />
            ) : null}
          </View>

          <Field value={tags} onChangeText={setTags} placeholder="標籤，以逗號分隔" autoCapitalize="none" />
          <Button title="建立任務" onPress={submit} loading={loading} disabled={!title.trim()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 14
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  close: {
    color: colors.accent,
    fontFamily: fonts.bodyMedium,
    fontSize: 15
  },
  group: {
    gap: 8
  },
  label: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    overflow: 'hidden'
  },
  segmentButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  segmentActive: {
    backgroundColor: colors.text
  },
  segmentText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  segmentTextActive: {
    color: colors.bgCard
  },
  dateButton: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  dateText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16
  },
  clearDate: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  }
});
