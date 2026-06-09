// SQL migration note:
// CREATE TABLE schedules (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   workspace_id uuid,
//   user_id uuid,
//   title text NOT NULL,
//   type text DEFAULT '拍攝',
//   date date NOT NULL,
//   start_time time,
//   end_time time,
//   location text,
//   notes text,
//   reminder boolean DEFAULT false,
//   status text DEFAULT '即將到來',
//   created_at timestamptz DEFAULT now()
// );

import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
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
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type ScheduleType = '拍攝' | '截止日' | '會議' | '其他';
type ScheduleStatus = '即將到來' | '進行中' | '已完成' | '已取消';
type ViewMode = 'list' | 'calendar';

type ScheduleRecord = {
  id: string;
  workspace_id?: string | null;
  user_id?: string | null;
  title: string;
  type?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  notes?: string | null;
  description?: string | null;
  reminder?: boolean | null;
  status?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  created_at?: string | null;
};

type ScheduleDraft = {
  title: string;
  type: ScheduleType;
  date: Date;
  startTime: Date | null;
  endTime: Date | null;
  location: string;
  notes: string;
  reminder: boolean;
  status: ScheduleStatus;
};

const TYPES: ScheduleType[] = ['拍攝', '截止日', '會議', '其他'];
const STATUSES: ScheduleStatus[] = ['即將到來', '進行中', '已完成', '已取消'];
const TYPE_TABS = ['全部', ...STATUSES] as const;

const typeColors: Record<ScheduleType, { bg: string; text: string }> = {
  拍攝: { bg: '#FBF4EE', text: colors.primary },
  截止日: { bg: '#fff7ed', text: '#ea580c' },
  會議: { bg: '#eff6ff', text: '#2563eb' },
  其他: { bg: '#f3f4f6', text: '#6b7280' }
};

const statusColors: Record<ScheduleStatus, { bg: string; text: string }> = {
  即將到來: { bg: '#eff6ff', text: '#2563eb' },
  進行中: { bg: '#fff7ed', text: '#ea580c' },
  已完成: { bg: '#ecfdf5', text: '#059669' },
  已取消: { bg: '#f3f4f6', text: '#6b7280' }
};

function newDraft(): ScheduleDraft {
  const now = new Date();
  now.setSeconds(0, 0);
  return {
    title: '',
    type: '拍攝',
    date: now,
    startTime: now,
    endTime: null,
    location: '',
    notes: '',
    reminder: false,
    status: '即將到來'
  };
}

function normalizeType(value?: string | null): ScheduleType {
  if (value === '拍攝' || value === '截止日' || value === '會議' || value === '其他') return value;
  if (value === 'shoot') return '拍攝';
  if (value === 'deadline' || value === 'publish') return '截止日';
  if (value === 'meeting') return '會議';
  return '其他';
}

function legacyType(value: ScheduleType) {
  if (value === '拍攝') return 'shoot';
  if (value === '截止日') return 'deadline';
  if (value === '會議') return 'meeting';
  return 'other';
}

function normalizeStatus(item: ScheduleRecord): ScheduleStatus {
  const value = item.status;
  if (value === '即將到來' || value === '進行中' || value === '已完成' || value === '已取消') return value;
  const start = getScheduleDate(item);
  const end = getEndDate(item);
  const now = new Date();
  if (end && end < now) return '已完成';
  if (start <= now && (!end || end >= now)) return '進行中';
  return '即將到來';
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function timeValue(date: Date | null) {
  if (!date) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;
}

function combineDateAndTime(date: Date, time: Date | null) {
  const next = new Date(date);
  if (time) {
    next.setHours(time.getHours(), time.getMinutes(), 0, 0);
  } else {
    next.setHours(0, 0, 0, 0);
  }
  return next;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateOnly(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTime(value?: string | null, fallbackDate = new Date()) {
  if (!value) return null;
  const [hour, minute] = value.split(':').map((part) => Number(part));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  const next = new Date(fallbackDate);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function getScheduleDate(item: ScheduleRecord) {
  const date = parseDateOnly(item.date) ?? parseDate(item.start_at) ?? parseDate(item.created_at) ?? new Date();
  const time = parseTime(item.start_time, date);
  return item.date ? combineDateAndTime(date, time) : date;
}

function getEndDate(item: ScheduleRecord) {
  const base = parseDateOnly(item.date) ?? parseDate(item.start_at) ?? new Date();
  const time = parseTime(item.end_time, base);
  if (time) return combineDateAndTime(base, time);
  return parseDate(item.end_at);
}

function formatDateHeader(date: Date) {
  return new Intl.DateTimeFormat('zh-HK', { month: 'short', day: 'numeric', weekday: 'long' }).format(date);
}

function formatCardDateTime(item: ScheduleRecord) {
  const date = getScheduleDate(item);
  const dateText = new Intl.DateTimeFormat('zh-HK', { month: 'short', day: 'numeric' }).format(date);
  const hasTime = !!(item.start_time || item.start_at);
  if (!hasTime) return dateText;
  const timeText = new Intl.DateTimeFormat('zh-HK', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  return `${dateText} ${timeText}`;
}

function formatButtonDate(date: Date) {
  return new Intl.DateTimeFormat('zh-HK', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function formatButtonTime(date: Date | null, fallback = '選擇時間') {
  if (!date) return fallback;
  return new Intl.DateTimeFormat('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function draftFromSchedule(item: ScheduleRecord): ScheduleDraft {
  const date = parseDateOnly(item.date) ?? parseDate(item.start_at) ?? new Date();
  return {
    title: item.title ?? '',
    type: normalizeType(item.type),
    date,
    startTime: parseTime(item.start_time, date) ?? parseDate(item.start_at),
    endTime: parseTime(item.end_time, date) ?? parseDate(item.end_at),
    location: item.location ?? '',
    notes: item.notes ?? item.description ?? '',
    reminder: !!item.reminder,
    status: normalizeStatus(item)
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

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
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

function ScheduleCard({ item, onPress }: { item: ScheduleRecord; onPress: () => void }) {
  const type = normalizeType(item.type);
  const status = normalizeStatus(item);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.86} style={styles.card}>
      <View style={styles.cardTop}>
        <Text numberOfLines={2} style={styles.cardTitle}>{item.title}</Text>
        <Badge label={status} color={statusColors[status]} />
      </View>
      <View style={styles.metaRow}>
        <Badge label={type} color={typeColors[type]} />
        <Text style={styles.dateText}>{formatCardDateTime(item)}</Text>
      </View>
      {item.location ? (
        <View style={styles.inlineMeta}>
          <Feather name="map-pin" size={13} color={colors.textMuted} />
          <Text numberOfLines={1} style={styles.metaText}>{item.location}</Text>
        </View>
      ) : null}
      {(item.notes || item.description) ? <Text numberOfLines={2} style={styles.notesText}>{item.notes ?? item.description}</Text> : null}
    </TouchableOpacity>
  );
}

function ScheduleSheet({
  visible,
  mode,
  draft,
  saving,
  deleting,
  onChange,
  onClose,
  onSave,
  onDelete
}: {
  visible: boolean;
  mode: 'add' | 'detail';
  draft: ScheduleDraft;
  saving: boolean;
  deleting?: boolean;
  onChange: (draft: ScheduleDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [picker, setPicker] = useState<'date' | 'startTime' | 'endTime' | null>(null);

  const pickerValue = picker === 'date' ? draft.date : picker === 'endTime' ? draft.endTime ?? draft.startTime ?? new Date() : draft.startTime ?? new Date();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetKeyboard}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>{mode === 'add' ? '建立行程' : '行程詳情'}</Text>
                <Text style={styles.sheetSubtitle}>{mode === 'add' ? '安排拍攝、會議或截止日' : '所有欄位都可以直接編輯'}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Feather name="x" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <FieldLabel>標題</FieldLabel>
              <TextInput
                value={draft.title}
                onChangeText={(title) => onChange({ ...draft, title })}
                placeholder="例如：旺角街訪拍攝"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <FieldLabel>類型</FieldLabel>
              <View style={styles.chipWrap}>
                {TYPES.map((type) => <Chip key={type} label={type} active={draft.type === type} onPress={() => onChange({ ...draft, type })} />)}
              </View>

              <FieldLabel>狀態</FieldLabel>
              <View style={styles.chipWrap}>
                {STATUSES.map((status) => <Chip key={status} label={status} active={draft.status === status} onPress={() => onChange({ ...draft, status })} />)}
              </View>

              <FieldLabel>日期</FieldLabel>
              <TouchableOpacity onPress={() => setPicker('date')} style={styles.dateButton}>
                <Text style={styles.dateButtonText}>{formatButtonDate(draft.date)}</Text>
                <Feather name="calendar" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              <FieldLabel>時間</FieldLabel>
              <TouchableOpacity onPress={() => setPicker('startTime')} style={styles.dateButton}>
                <Text style={styles.dateButtonText}>{formatButtonTime(draft.startTime)}</Text>
                {draft.startTime ? (
                  <TouchableOpacity onPress={() => onChange({ ...draft, startTime: null })} hitSlop={8}>
                    <Text style={styles.clearDate}>清除</Text>
                  </TouchableOpacity>
                ) : <Feather name="clock" size={16} color={colors.textMuted} />}
              </TouchableOpacity>

              <FieldLabel>截止時間</FieldLabel>
              <TouchableOpacity onPress={() => setPicker('endTime')} style={styles.dateButton}>
                <Text style={styles.dateButtonText}>{formatButtonTime(draft.endTime, '選擇截止時間')}</Text>
                {draft.endTime ? (
                  <TouchableOpacity onPress={() => onChange({ ...draft, endTime: null })} hitSlop={8}>
                    <Text style={styles.clearDate}>清除</Text>
                  </TouchableOpacity>
                ) : <Feather name="clock" size={16} color={colors.textMuted} />}
              </TouchableOpacity>

              {picker ? (
                <DateTimePicker
                  value={pickerValue}
                  mode={picker === 'date' ? 'date' : 'time'}
                  display={Platform.OS === 'ios' ? (picker === 'date' ? 'inline' : 'spinner') : 'default'}
                  onChange={(_, selected) => {
                    if (Platform.OS !== 'ios') setPicker(null);
                    if (!selected) return;
                    if (picker === 'date') onChange({ ...draft, date: selected });
                    if (picker === 'startTime') onChange({ ...draft, startTime: selected });
                    if (picker === 'endTime') onChange({ ...draft, endTime: selected });
                  }}
                />
              ) : null}

              <FieldLabel>地點</FieldLabel>
              <TextInput
                value={draft.location}
                onChangeText={(location) => onChange({ ...draft, location })}
                placeholder="例如：銅鑼灣 / Zoom"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <FieldLabel>備註</FieldLabel>
              <TextInput
                value={draft.notes}
                onChangeText={(notes) => onChange({ ...draft, notes })}
                placeholder="拍攝內容、準備事項、提醒..."
                placeholderTextColor="#9ca3af"
                style={[styles.input, styles.textarea]}
                multiline
                textAlignVertical="top"
              />

              <TouchableOpacity onPress={() => onChange({ ...draft, reminder: !draft.reminder })} style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>提醒</Text>
                <View style={[styles.toggle, draft.reminder && styles.toggleActive]}>
                  <View style={[styles.toggleKnob, draft.reminder && styles.toggleKnobActive]} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity onPress={onSave} disabled={saving} style={[styles.saveButton, saving && styles.disabledButton]}>
                {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveButtonText}>{mode === 'add' ? '建立行程' : '更新'}</Text>}
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

function CalendarGrid({
  month,
  schedules,
  selectedDate,
  onMonthChange,
  onSelectDate
}: {
  month: Date;
  schedules: ScheduleRecord[];
  selectedDate: Date;
  onMonthChange: (date: Date) => void;
  onSelectDate: (date: Date) => void;
}) {
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const next = new Date(gridStart);
      next.setDate(gridStart.getDate() + index);
      return next;
    });
  }, [month]);

  const eventKeys = useMemo(() => new Set(schedules.map((item) => dateKey(getScheduleDate(item)))), [schedules]);
  const monthLabel = new Intl.DateTimeFormat('zh-HK', { year: 'numeric', month: 'long' }).format(month);

  return (
    <View style={styles.calendarCard}>
      <View style={styles.calendarHeader}>
        <TouchableOpacity onPress={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <Feather name="chevron-left" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.calendarTitle}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <Feather name="chevron-right" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.weekdayRow}>
        {['日', '一', '二', '三', '四', '五', '六'].map((day) => <Text key={day} style={styles.weekdayText}>{day}</Text>)}
      </View>
      <View style={styles.calendarGrid}>
        {days.map((day) => {
          const key = dateKey(day);
          const active = key === dateKey(selectedDate);
          const inMonth = day.getMonth() === month.getMonth();
          const hasEvents = eventKeys.has(key);
          return (
            <TouchableOpacity key={key} onPress={() => onSelectDate(day)} style={[styles.dayCell, active && styles.dayCellActive]}>
              <Text style={[styles.dayText, !inMonth && styles.dayMuted, active && styles.dayTextActive]}>{day.getDate()}</Text>
              <View style={[styles.eventDot, hasEvents && styles.eventDotActive, active && styles.eventDotActiveSelected]} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function ScheduleToolScreen() {
  const { user } = useAuth();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeStatus, setActiveStatus] = useState<typeof TYPE_TABS[number]>('全部');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [visibleMonth, setVisibleMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleRecord | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft>(newDraft());

  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => {
      const statusA = normalizeStatus(a);
      const statusB = normalizeStatus(b);
      if (statusA === '已完成' && statusB !== '已完成') return 1;
      if (statusB === '已完成' && statusA !== '已完成') return -1;
      return getScheduleDate(a).getTime() - getScheduleDate(b).getTime();
    });
  }, [schedules]);

  const filteredSchedules = useMemo(() => {
    if (activeStatus === '全部') return sortedSchedules;
    return sortedSchedules.filter((item) => normalizeStatus(item) === activeStatus);
  }, [activeStatus, sortedSchedules]);

  const listRows = useMemo(() => {
    const rows: Array<{ kind: 'header'; key: string; title: string } | { kind: 'item'; key: string; item: ScheduleRecord }> = [];
    let previous = '';
    filteredSchedules.forEach((item) => {
      const date = getScheduleDate(item);
      const key = dateKey(date);
      if (key !== previous) {
        rows.push({ kind: 'header', key: `header-${key}`, title: formatDateHeader(date) });
        previous = key;
      }
      rows.push({ kind: 'item', key: item.id, item });
    });
    return rows;
  }, [filteredSchedules]);

  const selectedDaySchedules = useMemo(() => {
    const selectedKey = dateKey(selectedDate);
    return sortedSchedules.filter((item) => dateKey(getScheduleDate(item)) === selectedKey);
  }, [selectedDate, sortedSchedules]);

  const loadSchedules = useCallback(async (showLoader = true) => {
    if (!user) return;
    if (showLoader) setLoading(true);

    try {
      const id = workspaceId ?? await resolveWorkspaceId(user.id, user.email);
      setWorkspaceId(id);

      let data: ScheduleRecord[] | null = null;
      let error: unknown = null;

      if (id) {
        const result = await supabase
          .from('schedules')
          .select('*')
          .eq('workspace_id', id)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true });
        data = result.data as ScheduleRecord[] | null;
        error = result.error;
      }

      if (error || !id) {
        const result = await supabase
          .from('schedules')
          .select('*')
          .eq('user_id', user.id)
          .order('start_at', { ascending: true });
        data = result.data as ScheduleRecord[] | null;
        error = result.error;
      }

      if (error) throw error;
      setSchedules(data ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '載入失敗';
      Alert.alert('日程載入失敗', message);
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [user, workspaceId]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  useFocusEffect(
    useCallback(() => {
      loadSchedules(false);
    }, [loadSchedules])
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadSchedules(false);
    } finally {
      setRefreshing(false);
    }
  }

  function openAddModal() {
    setDraft(newDraft());
    setShowAddModal(true);
  }

  function openDetail(item: ScheduleRecord) {
    setSelectedSchedule(item);
    setDraft(draftFromSchedule(item));
  }

  function payloadFromDraft() {
    return {
      title: draft.title.trim(),
      type: draft.type,
      date: dateKey(draft.date),
      start_time: timeValue(draft.startTime),
      end_time: timeValue(draft.endTime),
      location: draft.location.trim() || null,
      notes: draft.notes.trim() || null,
      reminder: draft.reminder,
      status: draft.status
    };
  }

  async function saveNewSchedule() {
    if (!user) return;
    if (!draft.title.trim()) {
      Alert.alert('請輸入標題');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...payloadFromDraft(),
        workspace_id: workspaceId,
        user_id: user.id
      };
      let { error } = await supabase.from('schedules').insert(payload);

      if (error) {
        const startAt = combineDateAndTime(draft.date, draft.startTime);
        const endAt = draft.endTime ? combineDateAndTime(draft.date, draft.endTime) : null;
        ({ error } = await supabase.from('schedules').insert({
          user_id: user.id,
          title: draft.title.trim(),
          description: draft.notes.trim() || null,
          location: draft.location.trim() || null,
          start_at: startAt.toISOString(),
          end_at: endAt ? endAt.toISOString() : null,
          type: legacyType(draft.type)
        }));
      }

      if (error) throw error;
      setShowAddModal(false);
      await loadSchedules(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('建立失敗', message);
    } finally {
      setSaving(false);
    }
  }

  async function updateSchedule() {
    if (!selectedSchedule) return;
    if (!draft.title.trim()) {
      Alert.alert('請輸入標題');
      return;
    }

    setSaving(true);
    try {
      let { error } = await supabase.from('schedules').update(payloadFromDraft()).eq('id', selectedSchedule.id);
      if (error) {
        const startAt = combineDateAndTime(draft.date, draft.startTime);
        const endAt = draft.endTime ? combineDateAndTime(draft.date, draft.endTime) : null;
        ({ error } = await supabase.from('schedules').update({
          title: draft.title.trim(),
          description: draft.notes.trim() || null,
          location: draft.location.trim() || null,
          start_at: startAt.toISOString(),
          end_at: endAt ? endAt.toISOString() : null,
          type: legacyType(draft.type)
        }).eq('id', selectedSchedule.id));
      }

      if (error) throw error;
      setSelectedSchedule(null);
      await loadSchedules(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('更新失敗', message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteSchedule() {
    if (!selectedSchedule) return;
    Alert.alert('刪除行程', '確定要刪除這個行程？', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const { error } = await supabase.from('schedules').delete().eq('id', selectedSchedule.id);
            if (error) throw error;
            setSelectedSchedule(null);
            await loadSchedules(false);
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
        title="日程"
        backTo="/(app)/tools"
        rightElement={
          <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ 建立行程</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.headerText}>
        <Text style={styles.title}>日程</Text>
        <Text style={styles.subtitle}>拍攝行程同截止日</Text>
      </View>

      <View style={styles.viewToggle}>
        {[
          { key: 'list', label: '列表' },
          { key: 'calendar', label: '日曆' }
        ].map((item) => (
          <TouchableOpacity
            key={item.key}
            onPress={() => setViewMode(item.key as ViewMode)}
            style={[styles.viewToggleButton, viewMode === item.key && styles.viewToggleButtonActive]}
          >
            <Text style={[styles.viewToggleText, viewMode === item.key && styles.viewToggleTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : viewMode === 'list' ? (
        <>
          <View style={styles.statusTabs}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusTabsContent}>
              {TYPE_TABS.map((tab) => (
                <TouchableOpacity key={tab} onPress={() => setActiveStatus(tab)} style={styles.statusTabButton}>
                  <Text style={[styles.statusTabText, activeStatus === tab && styles.statusTabTextActive]}>{tab}</Text>
                  {activeStatus === tab ? <View style={styles.statusTabUnderline} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <FlatList
            data={listRows}
            keyExtractor={(item) => item.key}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            contentContainerStyle={listRows.length === 0 ? styles.emptyList : styles.list}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Feather name="calendar" size={40} color="#d1d5db" />
                <Text style={styles.emptyTitle}>未有行程</Text>
                <Text style={styles.emptyBody}>點擊 + 建立你的第一個行程</Text>
              </View>
            }
            renderItem={({ item }) => item.kind === 'header'
              ? <Text style={styles.dateHeader}>{item.title}</Text>
              : <ScheduleCard item={item.item} onPress={() => openDetail(item.item)} />}
          />
        </>
      ) : (
        <ScrollView
          contentContainerStyle={styles.calendarContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <CalendarGrid
            month={visibleMonth}
            schedules={schedules}
            selectedDate={selectedDate}
            onMonthChange={setVisibleMonth}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
            }}
          />
          <Text style={styles.selectedDayTitle}>{formatDateHeader(selectedDate)}</Text>
          {selectedDaySchedules.length === 0 ? (
            <View style={styles.calendarEmpty}>
              <Text style={styles.calendarEmptyText}>這天未有行程</Text>
            </View>
          ) : selectedDaySchedules.map((item) => <ScheduleCard key={item.id} item={item} onPress={() => openDetail(item)} />)}
        </ScrollView>
      )}

      <ScheduleSheet
        visible={showAddModal}
        mode="add"
        draft={draft}
        saving={saving}
        onChange={setDraft}
        onClose={() => setShowAddModal(false)}
        onSave={saveNewSchedule}
      />

      <ScheduleSheet
        visible={!!selectedSchedule}
        mode="detail"
        draft={draft}
        saving={saving}
        deleting={deleting}
        onChange={setDraft}
        onClose={() => setSelectedSchedule(null)}
        onSave={updateSchedule}
        onDelete={confirmDeleteSchedule}
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
  viewToggle: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    padding: 4
  },
  viewToggleButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 9,
    paddingVertical: 9
  },
  viewToggleButtonActive: {
    backgroundColor: colors.primary
  },
  viewToggleText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  viewToggleTextActive: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold
  },
  statusTabs: {
    backgroundColor: '#F8F3EA',
    borderBottomWidth: 1,
    borderBottomColor: '#eadfd4'
  },
  statusTabsContent: {
    paddingHorizontal: 16,
    gap: 18
  },
  statusTabButton: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 10
  },
  statusTabText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  statusTabTextActive: {
    color: colors.primary,
    fontFamily: fonts.bodyBold
  },
  statusTabUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 999
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
    fontSize: 14,
    textAlign: 'center'
  },
  dateHeader: {
    marginTop: 14,
    marginBottom: 8,
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: 'uppercase'
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
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    lineHeight: 23
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 10
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
  dateText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  inlineMeta: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  metaText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  notesText: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
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
    maxHeight: '92%',
    minHeight: '84%',
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
  textarea: {
    minHeight: 110,
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
  toggleRow: {
    marginTop: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  toggleLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  toggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#d1d5db',
    padding: 3
  },
  toggleActive: {
    backgroundColor: colors.primary
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff'
  },
  toggleKnobActive: {
    transform: [{ translateX: 20 }]
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
  },
  calendarContent: {
    padding: 16,
    paddingBottom: 110
  },
  calendarCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: '#ffffff',
    padding: 14,
    marginBottom: 16
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  calendarTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12
  },
  dayCellActive: {
    backgroundColor: colors.primaryLight
  },
  dayText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  dayMuted: {
    color: '#c1c7d0'
  },
  dayTextActive: {
    color: colors.primary,
    fontFamily: fonts.bodyBold
  },
  eventDot: {
    marginTop: 4,
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'transparent'
  },
  eventDotActive: {
    backgroundColor: colors.primary
  },
  eventDotActiveSelected: {
    backgroundColor: colors.primary
  },
  selectedDayTitle: {
    marginBottom: 10,
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  calendarEmpty: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: '#ffffff',
    padding: 18,
    alignItems: 'center'
  },
  calendarEmptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14
  }
});
