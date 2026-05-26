// SQL migration note:
// CREATE TABLE projects (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   workspace_id uuid,
//   user_id uuid,
//   title text NOT NULL,
//   category text,
//   status text DEFAULT '構思中',
//   shoot_date timestamptz,
//   publish_date timestamptz,
//   assignee text,
//   notes text,
//   created_at timestamptz DEFAULT now()
// );

import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
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

type ProjectStatus = '構思中' | '拍攝中' | '剪接中' | '已完成';
type StatusTab = '全部' | ProjectStatus;

type ProjectRecord = {
  id: string;
  workspace_id?: string | null;
  user_id?: string | null;
  created_by?: string | null;
  title: string;
  category?: string | null;
  status?: string | null;
  shoot_date?: string | null;
  publish_date?: string | null;
  assignee?: string | null;
  owner?: string | null;
  host?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

type ProjectDraft = {
  title: string;
  category: string;
  status: ProjectStatus;
  shootDate: Date | null;
  publishDate: Date | null;
  assignee: string;
  notes: string;
};

const STATUS_TABS: StatusTab[] = ['全部', '構思中', '拍攝中', '剪接中', '已完成'];
const CATEGORIES = ['飲食', '旅遊', '美妝', '時裝', '健身', '親子', '寵物', '教育', '職場', '理財', '生活', '科技', '活動'];
const STATUSES: ProjectStatus[] = ['構思中', '拍攝中', '剪接中', '已完成'];

const emptyDraft: ProjectDraft = {
  title: '',
  category: '飲食',
  status: '構思中',
  shootDate: null,
  publishDate: null,
  assignee: '',
  notes: ''
};

const statusColors: Record<ProjectStatus, { bg: string; text: string }> = {
  構思中: { bg: '#f3f4f6', text: '#6b7280' },
  拍攝中: { bg: '#fff7ed', text: '#ea580c' },
  剪接中: { bg: '#eff6ff', text: '#2563eb' },
  已完成: { bg: '#ecfdf5', text: '#059669' }
};

function normalizeStatus(value?: string | null): ProjectStatus {
  if (value === '拍攝中' || value === '剪接中' || value === '已完成' || value === '構思中') return value;
  if ((value ?? '').includes('完成')) return '已完成';
  if ((value ?? '').includes('剪')) return '剪接中';
  if ((value ?? '').includes('拍')) return '拍攝中';
  return '構思中';
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value?: string | null) {
  const date = parseDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat('zh-HK', { month: 'short', day: 'numeric' }).format(date);
}

function formatDateButton(value: Date | null) {
  if (!value) return '選擇日期';
  return new Intl.DateTimeFormat('zh-HK', { year: 'numeric', month: 'short', day: 'numeric' }).format(value);
}

function draftFromProject(project: ProjectRecord): ProjectDraft {
  return {
    title: project.title ?? '',
    category: project.category ?? '飲食',
    status: normalizeStatus(project.status),
    shootDate: parseDate(project.shoot_date),
    publishDate: parseDate(project.publish_date),
    assignee: project.assignee ?? project.owner ?? project.host ?? '',
    notes: project.notes ?? ''
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

function StatusBadge({ status }: { status: ProjectStatus }) {
  const color = statusColors[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: color.bg }]}>
      <Text style={[styles.statusText, { color: color.text }]}>{status}</Text>
    </View>
  );
}

function ProjectSheet({
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
  draft: ProjectDraft;
  saving: boolean;
  deleting?: boolean;
  onChange: (draft: ProjectDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [pickerField, setPickerField] = useState<'shootDate' | 'publishDate' | null>(null);
  const pickerValue = pickerField === 'publishDate' ? draft.publishDate : draft.shootDate;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetKeyboard}>
          <View style={[styles.sheet, mode === 'detail' && styles.fullSheet, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>{mode === 'add' ? '新增項目' : '項目詳情'}</Text>
                <Text style={styles.sheetSubtitle}>{mode === 'add' ? '建立新的內容製作項目' : '所有欄位都可以直接編輯'}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Feather name="x" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <FieldLabel>題目</FieldLabel>
              <TextInput
                value={draft.title}
                onChangeText={(title) => onChange({ ...draft, title })}
                placeholder="例如：世界盃街訪短片"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <FieldLabel>類別</FieldLabel>
              <View style={styles.chipWrap}>
                {CATEGORIES.map((category) => (
                  <Chip key={category} label={category} active={draft.category === category} onPress={() => onChange({ ...draft, category })} />
                ))}
              </View>

              <FieldLabel>狀態</FieldLabel>
              <View style={styles.chipWrap}>
                {STATUSES.map((status) => (
                  <Chip key={status} label={status} active={draft.status === status} onPress={() => onChange({ ...draft, status })} />
                ))}
              </View>

              <FieldLabel>拍攝日期</FieldLabel>
              <TouchableOpacity onPress={() => setPickerField('shootDate')} style={styles.dateButton}>
                <Text style={styles.dateButtonText}>{formatDateButton(draft.shootDate)}</Text>
                {draft.shootDate ? (
                  <TouchableOpacity onPress={() => onChange({ ...draft, shootDate: null })} hitSlop={8}>
                    <Text style={styles.clearDate}>清除</Text>
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>

              <FieldLabel>發佈時間</FieldLabel>
              <TouchableOpacity onPress={() => setPickerField('publishDate')} style={styles.dateButton}>
                <Text style={styles.dateButtonText}>{formatDateButton(draft.publishDate)}</Text>
                {draft.publishDate ? (
                  <TouchableOpacity onPress={() => onChange({ ...draft, publishDate: null })} hitSlop={8}>
                    <Text style={styles.clearDate}>清除</Text>
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>

              {pickerField ? (
                <DateTimePicker
                  value={pickerValue ?? new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={(_, selected) => {
                    if (Platform.OS !== 'ios') setPickerField(null);
                    if (!selected) return;
                    if (pickerField === 'shootDate') onChange({ ...draft, shootDate: selected });
                    if (pickerField === 'publishDate') onChange({ ...draft, publishDate: selected });
                  }}
                />
              ) : null}

              <FieldLabel>負責人</FieldLabel>
              <TextInput
                value={draft.assignee}
                onChangeText={(assignee) => onChange({ ...draft, assignee })}
                placeholder="例如：Tommy"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <FieldLabel>備註</FieldLabel>
              <TextInput
                value={draft.notes}
                onChangeText={(notes) => onChange({ ...draft, notes })}
                placeholder="拍攝方向、交付要求、剪接重點..."
                placeholderTextColor="#9ca3af"
                style={[styles.input, styles.textarea]}
                multiline
                textAlignVertical="top"
              />

              <TouchableOpacity onPress={onSave} disabled={saving} style={[styles.saveButton, saving && styles.disabledButton]}>
                {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveButtonText}>{mode === 'add' ? '新增項目' : '更新'}</Text>}
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

function ProjectCard({ project, onPress }: { project: ProjectRecord; onPress: () => void }) {
  const status = normalizeStatus(project.status);
  const shootDate = formatDate(project.shoot_date);
  const assignee = project.assignee ?? project.owner ?? project.host;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.84} style={styles.card}>
      <View style={styles.cardTop}>
        <Text numberOfLines={2} style={styles.cardTitle}>{project.title}</Text>
        <StatusBadge status={status} />
      </View>
      <View style={styles.metaRow}>
        {project.category ? <Text style={styles.categoryBadge}>{project.category}</Text> : null}
        {shootDate ? <Text style={styles.metaText}>📅 {shootDate}</Text> : null}
      </View>
      {assignee ? <Text style={styles.assignee}>負責人：{assignee}</Text> : null}
      {project.notes ? <Text numberOfLines={2} style={styles.notesPreview}>{project.notes}</Text> : null}
    </TouchableOpacity>
  );
}

export default function WorkBoardToolScreen() {
  const { user } = useAuth();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeTab, setActiveTab] = useState<StatusTab>('全部');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);

  const loadProjects = useCallback(async (showLoader = true) => {
    if (!user) return;
    if (showLoader) setLoading(true);

    try {
      const id = workspaceId ?? await resolveWorkspaceId(user.id, user.email);
      setWorkspaceId(id);

      let query = supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      query = id ? query.eq('workspace_id', id) : query.eq('user_id', user.id);

      const { data, error } = await query;
      if (error) throw error;
      setProjects((data ?? []) as ProjectRecord[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '載入失敗';
      Alert.alert('工作板載入失敗', message);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [user, workspaceId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    if (activeTab === '全部') return projects;
    return projects.filter((project) => normalizeStatus(project.status) === activeTab);
  }, [activeTab, projects]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadProjects(false);
    } finally {
      setRefreshing(false);
    }
  }

  function openAddModal() {
    setDraft(emptyDraft);
    setShowAddModal(true);
  }

  function openDetail(project: ProjectRecord) {
    setSelectedProject(project);
    setDraft(draftFromProject(project));
  }

  function payloadFromDraft() {
    return {
      title: draft.title.trim(),
      category: draft.category,
      status: draft.status,
      shoot_date: draft.shootDate ? draft.shootDate.toISOString() : null,
      publish_date: draft.publishDate ? draft.publishDate.toISOString() : null,
      assignee: draft.assignee.trim() || null,
      owner: draft.assignee.trim() || null,
      notes: draft.notes.trim() || null
    };
  }

  async function saveNewProject() {
    if (!user) return;
    if (!draft.title.trim()) {
      Alert.alert('請輸入題目');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...payloadFromDraft(),
        workspace_id: workspaceId,
        user_id: user.id,
        created_by: user.id,
        type: 'instagram',
        current_stage: draft.status,
        pipeline_step: 'idea'
      };

      let { error } = await supabase.from('projects').insert(payload);
      if (error) {
        ({ error } = await supabase.from('projects').insert({
          workspace_id: workspaceId,
          created_by: user.id,
          title: draft.title.trim(),
          category: draft.category,
          status: draft.status,
          shoot_date: draft.shootDate ? draft.shootDate.toISOString().slice(0, 10) : null,
          publish_date: draft.publishDate ? draft.publishDate.toISOString().slice(0, 10) : null,
          owner: draft.assignee.trim() || null,
          current_stage: draft.status,
          type: 'instagram',
          pipeline_step: 'idea'
        }));
      }
      if (error) throw error;
      setShowAddModal(false);
      await loadProjects(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('新增失敗', message);
    } finally {
      setSaving(false);
    }
  }

  async function updateProject() {
    if (!selectedProject) return;
    if (!draft.title.trim()) {
      Alert.alert('請輸入題目');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...payloadFromDraft(),
        current_stage: draft.status
      };

      let { error } = await supabase.from('projects').update(payload).eq('id', selectedProject.id);
      if (error) {
        ({ error } = await supabase.from('projects').update({
          title: draft.title.trim(),
          category: draft.category,
          status: draft.status,
          shoot_date: draft.shootDate ? draft.shootDate.toISOString().slice(0, 10) : null,
          publish_date: draft.publishDate ? draft.publishDate.toISOString().slice(0, 10) : null,
          owner: draft.assignee.trim() || null,
          current_stage: draft.status
        }).eq('id', selectedProject.id));
      }
      if (error) throw error;
      setSelectedProject(null);
      await loadProjects(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('更新失敗', message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteProject() {
    if (!selectedProject) return;
    Alert.alert('刪除項目', '確定要刪除這個製作項目？', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const { error } = await supabase.from('projects').delete().eq('id', selectedProject.id);
            if (error) throw error;
            setSelectedProject(null);
            await loadProjects(false);
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
        title="工作板"
        backTo="/(app)/tools"
        rightElement={
          <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ 新項目</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.headerText}>
        <Text style={styles.title}>工作板</Text>
        <Text style={styles.subtitle}>內容製作追蹤</Text>
      </View>

      <View style={styles.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          {STATUS_TABS.map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={styles.tabButton}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              {activeTab === tab ? <View style={styles.tabUnderline} /> : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filteredProjects}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={filteredProjects.length === 0 ? styles.emptyList : styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="clipboard" size={40} color="#d1d5db" />
              <Text style={styles.emptyTitle}>未有項目</Text>
              <Text style={styles.emptyBody}>點擊 + 新增你的第一個製作項目</Text>
            </View>
          }
          renderItem={({ item }) => <ProjectCard project={item} onPress={() => openDetail(item)} />}
        />
      )}

      <ProjectSheet
        visible={showAddModal}
        mode="add"
        draft={draft}
        saving={saving}
        onChange={setDraft}
        onClose={() => setShowAddModal(false)}
        onSave={saveNewProject}
      />

      <ProjectSheet
        visible={!!selectedProject}
        mode="detail"
        draft={draft}
        saving={saving}
        deleting={deleting}
        onChange={setDraft}
        onClose={() => setSelectedProject(null)}
        onSave={updateProject}
        onDelete={confirmDeleteProject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F4EF'
  },
  headerText: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    fontWeight: '700'
  },
  subtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#8B1A1A'
  },
  addButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  tabs: {
    borderBottomWidth: 1,
    borderBottomColor: colors.bodyBorder
  },
  tabsContent: {
    paddingHorizontal: 16,
    gap: 20
  },
  tabButton: {
    paddingTop: 14,
    paddingBottom: 10,
    alignItems: 'center'
  },
  tabText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 15
  },
  tabTextActive: {
    color: '#8B1A1A',
    fontFamily: fonts.bodyBold
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    width: '100%',
    borderRadius: 1,
    backgroundColor: '#8B1A1A'
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  list: {
    padding: 16,
    paddingBottom: 110,
    gap: 12
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24
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
    marginTop: 6,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center'
  },
  card: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    lineHeight: 23
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  statusText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11
  },
  metaRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  categoryBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  metaText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  assignee: {
    marginTop: 10,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  notesPreview: {
    marginTop: 8,
    color: '#4b5563',
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  sheetKeyboard: {
    justifyContent: 'flex-end'
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingTop: 10
  },
  fullSheet: {
    maxHeight: '96%'
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d1d5db',
    marginBottom: 14
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  sheetSubtitle: {
    marginTop: 3,
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
    marginBottom: 8,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15
  },
  textarea: {
    minHeight: 104,
    lineHeight: 22
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
    backgroundColor: colors.bgBodyMuted,
    paddingHorizontal: 13,
    paddingVertical: 8
  },
  chipActive: {
    borderColor: '#8B1A1A',
    backgroundColor: '#8B1A1A'
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
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
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
    color: '#8B1A1A',
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  saveButton: {
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: '#8B1A1A',
    paddingVertical: 14,
    alignItems: 'center'
  },
  disabledButton: {
    opacity: 0.68
  },
  saveButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  deleteButton: {
    marginTop: 10,
    paddingVertical: 14,
    alignItems: 'center'
  },
  deleteText: {
    color: colors.error,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  }
});
