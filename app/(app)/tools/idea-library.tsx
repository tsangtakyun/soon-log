import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHeader } from '@/components/BackHeader';
import ClipPlayer from '@/components/ClipPlayer';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type IdeaType = 'all' | 'instagram' | 'blog' | 'social';
type RegionKey = 'HK' | 'TW' | 'JP' | 'KR' | 'US';

type IdeaRecord = {
  id: string;
  user_id?: string | null;
  workspace_id?: string | null;
  title: string | null;
  topic: string | null;
  platform: string | null;
  region: string | null;
  country: string | null;
  notes: string | null;
  summary?: string | null;
  description?: string | null;
  url?: string | null;
  source_url?: string | null;
  thumb?: string | null;
  video_url?: string | null;
  place_name?: string | null;
  place_address?: string | null;
  shop_name?: string | null;
  lat?: number | null;
  lng?: number | null;
  tags: string[] | null;
  categories?: string[] | null;
  created_at: string;
};

type IdeaDraft = {
  title: string;
  topic: string;
  type: Exclude<IdeaType, 'all'>;
  regions: RegionKey[];
  notes: string;
};

const TYPE_FILTERS: Array<{ key: IdeaType; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'instagram', label: 'IG REEL' },
  { key: 'blog', label: '文章 BLOG' },
  { key: 'social', label: 'SOCIAL' }
];

const REGIONS: Array<{ key: RegionKey; label: string }> = [
  { key: 'HK', label: '🇭🇰 HK' },
  { key: 'TW', label: '🇹🇼 TW' },
  { key: 'JP', label: '🇯🇵 JP' },
  { key: 'KR', label: '🇰🇷 KR' },
  { key: 'US', label: '🇺🇸 US' }
];

const emptyDraft: IdeaDraft = {
  title: '',
  topic: '',
  type: 'instagram',
  regions: ['HK'],
  notes: ''
};

const screenWidth = Dimensions.get('window').width;

function normalizeType(value?: string | null): Exclude<IdeaType, 'all'> {
  const lower = (value ?? '').toLowerCase();
  if (lower.includes('blog') || lower.includes('article')) return 'blog';
  if (lower.includes('social')) return 'social';
  return 'instagram';
}

function typeLabel(value?: string | null) {
  const type = normalizeType(value);
  if (type === 'blog') return '文章 BLOG';
  if (type === 'social') return 'SOCIAL';
  return 'IG REEL';
}

function ideaRegions(idea: IdeaRecord): RegionKey[] {
  const values = [
    idea.region,
    idea.country,
    ...(Array.isArray(idea.tags) ? idea.tags : []),
    ...(Array.isArray(idea.categories) ? idea.categories : [])
  ].filter(Boolean) as string[];
  const matched = REGIONS.map((region) => region.key).filter((key) => values.includes(key));
  return matched.length > 0 ? matched : ['HK'];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-HK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

function draftFromIdea(idea: IdeaRecord): IdeaDraft {
  return {
    title: idea.title ?? '',
    topic: idea.topic ?? '',
    type: normalizeType(idea.platform),
    regions: ideaRegions(idea),
    notes: idea.notes ?? idea.summary ?? ''
  };
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

function FormSheet({
  visible,
  title,
  draft,
  saving,
  onChange,
  onClose,
  onSave
}: {
  visible: boolean;
  title: string;
  draft: IdeaDraft;
  saving: boolean;
  onChange: (draft: IdeaDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const insets = useSafeAreaInsets();

  function toggleRegion(region: RegionKey) {
    const hasRegion = draft.regions.includes(region);
    const next = hasRegion
      ? draft.regions.filter((item) => item !== region)
      : [...draft.regions, region];
    onChange({ ...draft, regions: next.length > 0 ? next : [region] });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetKeyboard}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Feather name="x" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>標題</Text>
              <TextInput
                value={draft.title}
                onChangeText={(value) => onChange({ ...draft, title: value })}
                placeholder="例如：世界盃街訪 Reel"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>主題</Text>
              <TextInput
                value={draft.topic}
                onChangeText={(value) => onChange({ ...draft, topic: value })}
                placeholder="例如：2026 世界盃"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>類型</Text>
              <View style={styles.selectorRow}>
                {TYPE_FILTERS.filter((type) => type.key !== 'all').map((type) => (
                  <Chip
                    key={type.key}
                    label={type.label.replace(' BLOG', '')}
                    active={draft.type === type.key}
                    onPress={() => onChange({ ...draft, type: type.key as Exclude<IdeaType, 'all'> })}
                  />
                ))}
              </View>

              <Text style={styles.fieldLabel}>地區</Text>
              <View style={styles.selectorRow}>
                {REGIONS.map((region) => (
                  <Chip
                    key={region.key}
                    label={region.label}
                    active={draft.regions.includes(region.key)}
                    onPress={() => toggleRegion(region.key)}
                  />
                ))}
              </View>

              <Text style={styles.fieldLabel}>備註</Text>
              <TextInput
                value={draft.notes}
                onChangeText={(value) => onChange({ ...draft, notes: value })}
                placeholder="記低拍法、hook、參考資料..."
                placeholderTextColor="#9ca3af"
                style={[styles.input, styles.textarea]}
                multiline
                textAlignVertical="top"
              />

              <TouchableOpacity onPress={onSave} disabled={saving} style={[styles.saveButton, saving && styles.disabledButton]}>
                {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveButtonText}>儲存題材</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function IdeaDetailSheet({
  idea,
  onClose,
  onEdit
}: {
  idea: IdeaRecord | null;
  onClose: () => void;
  onEdit: (idea: IdeaRecord) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!idea) return null;

  const currentIdea = idea;
  const sourceUrl = currentIdea.source_url || currentIdea.url || '';
  const imageUrl = currentIdea.thumb || '';
  const videoUrl = currentIdea.video_url || '';
  const placeName = currentIdea.place_name || currentIdea.shop_name || '';
  const description = currentIdea.notes || currentIdea.summary || currentIdea.description || '';
  const hasMap = typeof currentIdea.lat === 'number' && typeof currentIdea.lng === 'number';
  const categories = Array.isArray(currentIdea.categories) ? currentIdea.categories : [];
  const heroHeight = Math.round(screenWidth * 1.18);

  async function openSource() {
    if (!sourceUrl) return;
    await Linking.openURL(sourceUrl);
  }

  async function openMap() {
    if (!hasMap) return;
    const label = encodeURIComponent(placeName || currentIdea.title || 'Saved idea');
    const appleUrl = `http://maps.apple.com/?ll=${currentIdea.lat},${currentIdea.lng}&q=${label}`;
    const googleUrl = `https://www.google.com/maps/search/?api=1&query=${currentIdea.lat},${currentIdea.lng}`;
    const canOpenApple = await Linking.canOpenURL(appleUrl);
    await Linking.openURL(canOpenApple ? appleUrl : googleUrl);
  }

  async function shareIdea() {
    const message = [currentIdea.title, placeName, sourceUrl].filter(Boolean).join('\n');
    if (message) await Share.share({ message });
  }

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailScreen}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.detailContent, { paddingBottom: insets.bottom + 42 }]}
        >
          <View style={[styles.detailHero, { height: heroHeight }]}>
            {videoUrl ? (
              <ClipPlayer
                clip={{
                  id: idea.id,
                  video_url: videoUrl,
                  media_urls: imageUrl ? [imageUrl] : []
                }}
                width={screenWidth}
                height={heroHeight}
              />
            ) : imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.detailHeroImage} resizeMode="cover" />
            ) : (
              <View style={styles.detailHeroEmpty}>
                <Feather name="bookmark" size={42} color="rgba(255,255,255,0.45)" />
                <Text style={styles.detailHeroEmptyText}>{idea.title || 'IG Reel 靈感'}</Text>
              </View>
            )}

            <View style={[styles.detailTopNav, { paddingTop: insets.top + 10 }]}>
              <TouchableOpacity onPress={onClose} style={styles.detailRoundButton}>
                <Feather name="chevron-left" size={30} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.detailBody}>
            <View style={styles.detailActions}>
              <TouchableOpacity onPress={openSource} disabled={!sourceUrl} style={styles.detailIconButton}>
                <Feather name={normalizeType(idea.platform) === 'instagram' ? 'instagram' : 'external-link'} size={24} color="#111827" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onEdit(idea)} style={styles.detailIconButton}>
                <Feather name="more-horizontal" size={25} color="#111827" />
              </TouchableOpacity>
              <View style={styles.detailActionSpacer} />
              <TouchableOpacity onPress={() => onEdit(idea)} style={styles.addToBoardButton}>
                <Feather name="plus" size={19} color="#111827" />
                <Text style={styles.addToBoardText}>加入分類</Text>
              </TouchableOpacity>
            </View>

            {placeName ? (
              <View style={styles.placeRow}>
                <Text style={styles.placePin}>📍</Text>
                <Text style={styles.placeName}>{placeName}</Text>
              </View>
            ) : null}

            <Text style={styles.detailTitle}>{idea.title || '未命名題材'}</Text>

            {description ? <Text style={styles.detailDescription}>{description}</Text> : null}

            {categories.length > 0 ? (
              <View style={styles.detailCategories}>
                {categories.map((category) => (
                  <Text key={category} style={styles.detailCategoryPill}>{category}</Text>
                ))}
              </View>
            ) : null}

            <View style={styles.detailMetaCard}>
              <Text style={styles.detailMetaLabel}>題材資料</Text>
              <Text style={styles.detailMetaText}>類型：{typeLabel(idea.platform)}</Text>
              <Text style={styles.detailMetaText}>地區：{ideaRegions(idea).join(' / ')}</Text>
              <Text style={styles.detailMetaText}>建立：{formatDate(idea.created_at)}</Text>
              {sourceUrl ? (
                <TouchableOpacity onPress={openSource} style={styles.sourceLinkRow}>
                  <Feather name="link" size={15} color="#ffffff" />
                  <Text numberOfLines={1} style={styles.sourceLinkText}>{sourceUrl}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.feedbackRow}>
              <TouchableOpacity style={styles.feedbackButton}>
                <Feather name="heart" size={24} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.feedbackButton}>
                <Feather name="thumbs-up" size={24} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.feedbackButton}>
                <Feather name="thumbs-down" size={24} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={shareIdea} style={styles.feedbackButton}>
                <Feather name="send" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {hasMap ? (
              <View style={styles.mapSection}>
                <MapView
                  style={styles.detailMap}
                  pointerEvents="none"
                  customMapStyle={darkMapStyle}
                  initialRegion={{
                    latitude: idea.lat!,
                    longitude: idea.lng!,
                    latitudeDelta: 0.012,
                    longitudeDelta: 0.012
                  }}
                >
                  <Marker
                    coordinate={{ latitude: idea.lat!, longitude: idea.lng! }}
                    title={placeName || idea.title || 'Saved idea'}
                  />
                </MapView>
                <TouchableOpacity onPress={openMap} style={styles.viewMapButton}>
                  <Text style={styles.viewMapButtonText}>在地圖開啟</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.noMapCard}>
                <Feather name="map-pin" size={20} color="rgba(255,255,255,0.55)" />
                <Text style={styles.noMapText}>未有地點資料。你可以編輯題材補充地點，之後就會顯示地圖。</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#17212f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ca0b3' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#27364a' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9fb2c8' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f2634' }] }
];

export default function ToolsIdeaLibraryScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<IdeaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState<IdeaType>('all');
  const [regionFilter, setRegionFilter] = useState<RegionKey | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<IdeaRecord | null>(null);
  const [editingIdea, setEditingIdea] = useState<IdeaRecord | null>(null);
  const [draft, setDraft] = useState<IdeaDraft>(emptyDraft);

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

    await supabase
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

    return created.id as string;
  }, [user]);

  const loadIdeas = useCallback(async (showLoader = true) => {
    if (!user) return;
    if (showLoader) setLoading(true);

    try {
      const id = workspaceId ?? await resolveWorkspace();
      setWorkspaceId(id);

      let query = supabase
        .from('ideas')
        .select('*')
        .order('created_at', { ascending: false });

      query = id ? query.eq('workspace_id', id) : query.eq('user_id', user.id);

      const { data, error } = await query;
      if (error) throw error;
      setIdeas((data ?? []) as IdeaRecord[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '載入失敗';
      Alert.alert('題材庫載入失敗', message);
      setIdeas([]);
    } finally {
      setLoading(false);
    }
  }, [resolveWorkspace, user, workspaceId]);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  const filteredIdeas = useMemo(() => {
    return ideas.filter((idea) => {
      const matchesType = typeFilter === 'all' || normalizeType(idea.platform) === typeFilter;
      const matchesRegion = !regionFilter || ideaRegions(idea).includes(regionFilter);
      return matchesType && matchesRegion;
    });
  }, [ideas, regionFilter, typeFilter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadIdeas(false);
    } finally {
      setRefreshing(false);
    }
  }, [loadIdeas]);

  function openAddModal() {
    setDraft(emptyDraft);
    setShowAddModal(true);
  }

  function openDetailModal(idea: IdeaRecord) {
    setSelectedIdea(idea);
  }

  function openEditModal(idea: IdeaRecord) {
    setDraft(draftFromIdea(idea));
    setEditingIdea(idea);
  }

  async function saveNewIdea() {
    if (!user) return;
    if (!draft.title.trim()) {
      Alert.alert('請輸入標題');
      return;
    }

    setSaving(true);
    try {
      const primaryRegion = draft.regions[0] ?? 'HK';
      const { error } = await supabase.from('ideas').insert({
        user_id: user.id,
        workspace_id: workspaceId,
        title: draft.title.trim(),
        topic: draft.topic.trim() || draft.title.trim(),
        platform: draft.type,
        region: primaryRegion,
        country: primaryRegion,
        notes: draft.notes.trim(),
        summary: draft.notes.trim(),
        tags: draft.regions,
        categories: draft.regions,
        viral_score: 0,
        ai_viral_base: 0,
        viral_potential: 'medium',
        date: new Date().toISOString()
      });

      if (error) throw error;
      setShowAddModal(false);
      await loadIdeas(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('新增失敗', message);
    } finally {
      setSaving(false);
    }
  }

  async function saveSelectedIdea() {
    if (!editingIdea) return;
    if (!draft.title.trim()) {
      Alert.alert('請輸入標題');
      return;
    }

    setSaving(true);
    try {
      const primaryRegion = draft.regions[0] ?? 'HK';
      const { error } = await supabase
        .from('ideas')
        .update({
          title: draft.title.trim(),
          topic: draft.topic.trim() || draft.title.trim(),
          platform: draft.type,
          region: primaryRegion,
          country: primaryRegion,
          notes: draft.notes.trim(),
          summary: draft.notes.trim(),
          tags: draft.regions,
          categories: draft.regions
        })
        .eq('id', editingIdea.id);

      if (error) throw error;
      setEditingIdea(null);
      await loadIdeas(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('儲存失敗', message);
    } finally {
      setSaving(false);
    }
  }

  function renderIdea({ item }: { item: IdeaRecord }) {
    const regions = ideaRegions(item);
    return (
      <Pressable onPress={() => openDetailModal(item)} style={({ pressed }) => [styles.ideaCard, pressed && styles.pressed]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title || '未命名題材'}</Text>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </View>
        <Text style={styles.cardTopic} numberOfLines={1}>{item.topic || '未設定主題'}</Text>
        <View style={styles.cardTags}>
          <Text style={styles.typeTag}>{typeLabel(item.platform)}</Text>
          {regions.map((region) => <Text key={region} style={styles.regionTag}>{region}</Text>)}
        </View>
        <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <BackHeader
        title="題材庫"
        backTo="/(app)/tools"
        rightElement={
          <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ 新增</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.hero}>
        <Text style={styles.title}>題材庫</Text>
        <Text style={styles.subtitle}>IG Reel 靈感</Text>
      </View>

      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {TYPE_FILTERS.map((filter) => (
            <Chip
              key={filter.key}
              label={filter.label}
              active={typeFilter === filter.key}
              onPress={() => setTypeFilter(filter.key)}
            />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {REGIONS.map((region) => (
            <Chip
              key={region.key}
              label={region.label}
              active={regionFilter === region.key}
              onPress={() => setRegionFilter((current) => current === region.key ? null : region.key)}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredIdeas}
          keyExtractor={(item) => item.id}
          renderItem={renderIdea}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 110 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="bookmark" size={36} color="#d1d5db" />
              <Text style={styles.emptyText}>未有題材，點擊 + 新增你的第一個靈感</Text>
            </View>
          }
        />
      )}

      <FormSheet
        visible={showAddModal}
        title="新增題材"
        draft={draft}
        saving={saving}
        onChange={setDraft}
        onClose={() => setShowAddModal(false)}
        onSave={saveNewIdea}
      />

      <FormSheet
        visible={Boolean(editingIdea)}
        title="題材詳情"
        draft={draft}
        saving={saving}
        onChange={setDraft}
        onClose={() => setEditingIdea(null)}
        onSave={saveSelectedIdea}
      />

      <IdeaDetailSheet
        idea={selectedIdea}
        onClose={() => setSelectedIdea(null)}
        onEdit={openEditModal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F3EE'
  },
  detailScreen: {
    flex: 1,
    backgroundColor: '#060606'
  },
  detailContent: {
    backgroundColor: '#060606'
  },
  detailHero: {
    width: '100%',
    backgroundColor: '#101010'
  },
  detailHeroImage: {
    width: '100%',
    height: '100%'
  },
  detailHeroEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28
  },
  detailHeroEmptyText: {
    marginTop: 14,
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center'
  },
  detailTopNav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18
  },
  detailRoundButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)'
  },
  detailBody: {
    paddingHorizontal: 20,
    paddingTop: 18
  },
  detailActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 22
  },
  detailIconButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff'
  },
  detailActionSpacer: {
    flex: 1
  },
  addToBoardButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18
  },
  addToBoardText: {
    color: '#111827',
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: '800'
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 14
  },
  placePin: {
    fontSize: 24
  },
  placeName: {
    flex: 1,
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 19,
    fontWeight: '800'
  },
  detailTitle: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 31,
    marginBottom: 12
  },
  detailDescription: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 25
  },
  detailCategories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16
  },
  detailCategoryPill: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  detailMetaCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#2E0F1F',
    padding: 16,
    marginTop: 24
  },
  detailMetaLabel: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10
  },
  detailMetaText: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21
  },
  sourceLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    marginTop: 14,
    paddingTop: 12
  },
  sourceLinkText: {
    flex: 1,
    color: '#ffffff',
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
    marginTop: 22,
    marginBottom: 22
  },
  feedbackButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mapSection: {
    marginTop: 6
  },
  detailMap: {
    height: 300,
    borderRadius: 16,
    overflow: 'hidden'
  },
  viewMapButton: {
    borderRadius: 999,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 14
  },
  viewMapButtonText: {
    color: '#111827',
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: '800'
  },
  noMapCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    marginTop: 6
  },
  noMapText: {
    flex: 1,
    color: 'rgba(255,255,255,0.68)',
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 30,
    fontWeight: '800'
  },
  subtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14
  },
  addButton: {
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  addButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: '700'
  },
  filterWrap: {
    gap: 8,
    paddingVertical: 8
  },
  filterContent: {
    gap: 8,
    paddingHorizontal: 16
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBody,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  chipActive: {
    borderColor: '#8B0000',
    backgroundColor: '#8B0000'
  },
  chipText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    fontWeight: '600'
  },
  chipTextActive: {
    color: '#ffffff'
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8
  },
  ideaCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DED6',
    backgroundColor: '#ffffff',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23
  },
  cardTopic: {
    marginTop: 7,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14
  },
  cardTags: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  typeTag: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  regionTag: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  cardDate: {
    marginTop: 12,
    color: '#9ca3af',
    fontFamily: fonts.body,
    fontSize: 12
  },
  pressed: {
    opacity: 0.72
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 80
  },
  emptyText: {
    marginTop: 12,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  sheetKeyboard: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  sheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 10
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d1d5db',
    marginBottom: 12
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    fontWeight: '800'
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgBodyMuted
  },
  fieldLabel: {
    marginBottom: 7,
    marginTop: 12,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    fontWeight: '700'
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  textarea: {
    minHeight: 110,
    lineHeight: 22
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  saveButton: {
    marginTop: 20,
    borderRadius: 14,
    backgroundColor: '#8B0000',
    alignItems: 'center',
    paddingVertical: 14
  },
  disabledButton: {
    opacity: 0.55
  },
  saveButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: '700'
  }
});
