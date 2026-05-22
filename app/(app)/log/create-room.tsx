import { router } from 'expo-router';
import { ComponentProps } from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

export default function CreateTopicRoomScreen() {
  const insets = useSafeAreaInsets();
  const { loading: authLoading, user } = useAuth();
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [angle, setAngle] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const canSubmit = topic.trim().length > 0 && !authLoading && !saving;

  const submit = async () => {
    if (saving || authLoading) return;
    if (!topic.trim()) {
      Alert.alert('未填題材名稱', '請先輸入 Topic Room 嘅題材名稱。');
      return;
    }
    if (!user) {
      Alert.alert('未登入', '請重新登入後再建立 Topic Room。');
      return;
    }

    setSaving(true);
    try {
      const trimmedTopic = topic.trim();
      const { data: room, error: roomError } = await supabase
        .from('topic_rooms')
        .insert({
          name: trimmedTopic,
          topic: trimmedTopic,
          description: description.trim() || null,
          privacy: isOpen ? 'open' : 'private',
          owner_id: user.id
        })
        .select('id')
        .single();

      if (roomError || !room) {
        Alert.alert('建立失敗', roomError?.message ?? '請稍後再試');
        return;
      }

      const { error: memberError } = await supabase.from('topic_room_members').insert({
        room_id: room.id,
        user_id: user.id,
        angle: angle.trim() || null,
        role: 'owner'
      });

      if (memberError) {
        Alert.alert('加入房間失敗', memberError.message);
        return;
      }

      router.replace(`/log/room/${room.id}`);
    } catch (error) {
      Alert.alert('建立失敗', error instanceof Error ? error.message : '請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.cancel}>← 取消</Text>
        </Pressable>
        <Text style={styles.title}>建立 Topic Room</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} keyboardShouldPersistTaps="handled">
        <Field
          label="題材名稱"
          value={topic}
          onChangeText={setTopic}
          placeholder="例如：2026 世界盃報道"
        />
        <Field
          label="描述（選填）"
          value={description}
          onChangeText={setDescription}
          placeholder="呢個 room 係關於咩..."
          multiline
          style={styles.descriptionInput}
        />
        <Field
          label="你的角度"
          value={angle}
          onChangeText={setAngle}
          placeholder="例如：歷史背景、人物故事、數據分析..."
        />

        <View style={styles.privacyCard}>
          <View style={styles.privacyText}>
            <Text style={styles.label}>開放模式</Text>
            <Text style={styles.privacyDescription}>
              {isOpen ? '🌐 Open Studio — fans 可以睇你嘅製作過程' : '🔒 私密 — 只有隊友可以睇'}
            </Text>
          </View>
          <Switch
            value={isOpen}
            onValueChange={setIsOpen}
            trackColor={{ false: colors.bodyBorder, true: colors.primaryLight }}
            thumbColor={isOpen ? colors.primary : colors.textMuted}
          />
        </View>

        <Pressable
          onPress={submit}
          style={({ pressed }) => [styles.submit, (!canSubmit || pressed) && styles.submitDimmed]}
        >
          {saving ? <ActivityIndicator color={colors.textOnDark} /> : <Text style={styles.submitText}>建立 Topic Room</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  style,
  ...inputProps
}: {
  label: string;
} & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        {...inputProps}
        style={[styles.input, inputProps.multiline && styles.multilineInput, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  header: {
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: colors.bodyBorder,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cancel: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  headerSpacer: {
    width: 52
  },
  content: {
    padding: 16,
    gap: 18
  },
  field: {
    gap: 8
  },
  label: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 12,
    backgroundColor: colors.bgBodyCard,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingHorizontal: 14
  },
  multilineInput: {
    paddingTop: 12,
    textAlignVertical: 'top'
  },
  descriptionInput: {
    height: 80
  },
  privacyCard: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 16,
    backgroundColor: colors.bgBodyCard,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  privacyText: {
    flex: 1,
    gap: 6
  },
  privacyDescription: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20
  },
  submit: {
    marginTop: 8,
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  submitDimmed: {
    opacity: 0.5
  },
  submitText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  }
});
