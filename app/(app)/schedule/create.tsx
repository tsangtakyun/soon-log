import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Screen, Title } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { scheduleTypes } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Log, ScheduleType } from '@/types';

const TYPE_OPTIONS: { value: ScheduleType; label: string }[] = [
  { value: 'shoot', label: '拍攝' },
  { value: 'meeting', label: '會議' },
  { value: 'deadline', label: '截止' },
  { value: 'publish', label: '發布' },
  { value: 'other', label: '其他' }
];

function combineDateTime(date: Date, time: Date) {
  const next = new Date(date);
  next.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return next;
}

function displayDateTime(date: Date | null) {
  if (!date) return '未設定';
  return new Intl.DateTimeFormat('zh-HK', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

export default function CreateScheduleScreen() {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ScheduleType>('shoot');
  const [startDate, setStartDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState<'startDate' | 'startTime' | 'endDate' | 'endTime' | null>(null);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [logs, setLogs] = useState<Log[]>([]);
  const [logQuery, setLogQuery] = useState('');
  const [relatedLogId, setRelatedLogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (error) {
          return;
        }
        setLogs((data ?? []) as Log[]);
      });
  }, [user]);

  const startAt = useMemo(() => combineDateTime(startDate, startTime), [startDate, startTime]);
  const endAt = useMemo(() => endDate && endTime ? combineDateTime(endDate, endTime) : null, [endDate, endTime]);
  const selectedLog = logs.find((log) => log.id === relatedLogId) ?? null;
  const filteredLogs = logs.filter((log) => {
    const text = `${log.title ?? ''} ${log.body}`.toLowerCase();
    return text.includes(logQuery.toLowerCase());
  });

  const submit = async () => {
    if (!user || !title.trim()) return;
    if (endAt && endAt < startAt) {
      Alert.alert('時間未正確', '結束時間需要遲過開始時間。');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.from('schedules').insert({
        user_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        start_at: startAt.toISOString(),
        end_at: endAt ? endAt.toISOString() : null,
        type,
        related_log_id: relatedLogId
      });

      if (error) throw error;
      router.replace('/schedule');
    } catch (error) {
      Alert.alert('加入失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  const renderPicker = () => {
    if (!showPicker) return null;
    const isTime = showPicker.endsWith('Time');
    const value =
      showPicker === 'startDate' ? startDate :
      showPicker === 'startTime' ? startTime :
      showPicker === 'endDate' ? (endDate ?? startDate) :
      (endTime ?? startTime);

    return (
      <DateTimePicker
        value={value}
        mode={isTime ? 'time' : 'date'}
        display={Platform.OS === 'ios' ? (isTime ? 'spinner' : 'inline') : 'default'}
        onChange={(_, selected) => {
          if (Platform.OS !== 'ios') setShowPicker(null);
          if (!selected) return;
          if (showPicker === 'startDate') setStartDate(selected);
          if (showPicker === 'startTime') setStartTime(selected);
          if (showPicker === 'endDate') setEndDate(selected);
          if (showPicker === 'endTime') setEndTime(selected);
        }}
      />
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Title>新增日程</Title>
            <Pressable onPress={() => router.back()}><Text style={styles.close}>關閉</Text></Pressable>
          </View>

          <Field value={title} onChangeText={setTitle} placeholder="日程標題" />

          <View style={styles.group}>
            <Text style={styles.label}>類型</Text>
            <View style={styles.segment}>
              {TYPE_OPTIONS.map((option) => {
                const active = option.value === type;
                return (
                  <Pressable key={option.value} onPress={() => setType(option.value)} style={[styles.segmentButton, active && { backgroundColor: scheduleTypes[option.value].color }]}>
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.label}>開始時間</Text>
            <View style={styles.dateGrid}>
              <Pressable onPress={() => setShowPicker('startDate')} style={styles.dateButton}>
                <Text style={styles.dateText}>{displayDateTime(startAt).split(' ')[0]}</Text>
              </Pressable>
              <Pressable onPress={() => setShowPicker('startTime')} style={styles.dateButton}>
                <Text style={styles.dateText}>{displayDateTime(startAt).split(' ').slice(-1)[0]}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.group}>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>結束時間（選填）</Text>
              {endDate || endTime ? <Pressable onPress={() => { setEndDate(null); setEndTime(null); }}><Text style={styles.clear}>清除</Text></Pressable> : null}
            </View>
            <View style={styles.dateGrid}>
              <Pressable onPress={() => setShowPicker('endDate')} style={styles.dateButton}>
                <Text style={styles.dateText}>{endDate ? displayDateTime(endDate).split(' ')[0] : '日期'}</Text>
              </Pressable>
              <Pressable onPress={() => setShowPicker('endTime')} style={styles.dateButton}>
                <Text style={styles.dateText}>{endTime ? displayDateTime(endTime).split(' ').slice(-1)[0] : '時間'}</Text>
              </Pressable>
            </View>
          </View>

          {renderPicker()}

          <Field value={location} onChangeText={setLocation} placeholder="地點" />
          <Field value={description} onChangeText={setDescription} placeholder="描述、準備事項、備註" multiline />

          <View style={styles.group}>
            <Text style={styles.label}>關聯 Log</Text>
            <Field value={logQuery} onChangeText={setLogQuery} placeholder={selectedLog?.title ?? '搜尋自己嘅 Log'} />
            <View style={styles.logList}>
              {selectedLog ? (
                <Pressable onPress={() => setRelatedLogId(null)} style={styles.logOption}>
                  <Text style={styles.logTitle}>已選：{selectedLog.title ?? selectedLog.body.slice(0, 24)}</Text>
                  <Text style={styles.clear}>取消</Text>
                </Pressable>
              ) : filteredLogs.slice(0, 5).map((log) => (
                <Pressable key={log.id} onPress={() => setRelatedLogId(log.id)} style={styles.logOption}>
                  <Text numberOfLines={1} style={styles.logTitle}>{log.title ?? log.body.slice(0, 36)}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Button title="加入日程" onPress={submit} loading={loading} disabled={!title.trim()} />
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
    color: colors.purple,
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
    paddingHorizontal: 4
  },
  segmentText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  segmentTextActive: {
    color: colors.bgCard
  },
  dateGrid: {
    flexDirection: 'row',
    gap: 10
  },
  dateButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  dateText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  clear: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  logList: {
    gap: 8
  },
  logOption: {
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  logTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  }
});
