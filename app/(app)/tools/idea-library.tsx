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
import { loadLocalIdeaBoards, mergeLocalIdeaBoards } from '@/lib/ideaBoards';
import { enrichIdeaFromUrl } from '@/lib/ideaEnrichment';
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
const ideaGridCardWidth = Math.floor((screenWidth - 44) / 2);
const ideaCardPreviewHeight = Math.round((ideaGridCardWidth * 16) / 9);
const enrichingIdeaIds = new Set<string>();

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

function ideaBoards(idea: IdeaRecord) {
  const regionKeys = new Set<string>(REGIONS.map((region) => region.key));
  return (Array.isArray(idea.categories) ? idea.categories : [])
    .filter((category) => category && !regionKeys.has(category));
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

function mergeRegionsAndBoards(regions: RegionKey[], boards: string[]) {
  return Array.from(new Set([...regions, ...boards].filter(Boolean)));
}

function ideaSourceUrl(idea: IdeaRecord) {
  return idea.source_url || idea.url || '';
}

function ideaPreviewImage(idea: IdeaRecord) {
  return idea.thumb || '';
}

function isPlayableVideoUrl(value?: string | null) {
  if (!value) return false;
  const url = value.toLowerCase();
  return url.includes('.mp4') || url.includes('.mov') || url.includes('.m3u8') || url.includes('supabase') || url.includes('cloudinary') || url.includes('mux');
}

function ideaSearchText(idea: IdeaRecord) {
  return [
    idea.title,
    idea.topic,
    idea.summary,
    idea.description,
    idea.notes,
    idea.place_name,
    idea.place_address,
    idea.shop_name,
    ideaSourceUrl(idea),
    ...(Array.isArray(idea.tags) ? idea.tags : []),
    ...(Array.isArray(idea.categories) ? idea.categories : [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function ideaNeedsEnrichment(idea: IdeaRecord) {
  const sourceUrl = ideaSourceUrl(idea);
  if (!sourceUrl) return false;
  if (enrichingIdeaIds.has(idea.id)) return false;

  const tags = Array.isArray(idea.tags) ? idea.tags : [];
  const hasPendingTag = tags.includes('待分析');
  const hasGenericTitle = !idea.title || idea.title === 'IG Reel 靈感' || idea.title === 'Instagram Reel 靈感';
  const missingUsefulPreview = !idea.thumb && !idea.summary && !idea.description;
  const missingMediaPreview = !idea.thumb && !idea.video_url;

  return hasPendingTag || hasGenericTitle || missingUsefulPreview || missingMediaPreview;
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

function BoardPickerSheet({
  idea,
  boards,
  saving,
  newBoardName,
  onNewBoardNameChange,
  onClose,
  onSave
}: {
  idea: IdeaRecord | null;
  boards: string[];
  saving: boolean;
  newBoardName: string;
  onNewBoardNameChange: (value: string) => void;
  onClose: () => void;
  onSave: (idea: IdeaRecord, nextBoards: string[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const [selectedBoards, setSelectedBoards] = useState<string[]>([]);

  useEffect(() => {
    setSelectedBoards(idea ? ideaBoards(idea) : []);
  }, [idea]);

  if (!idea) return null;

  const allBoards = Array.from(new Set([...boards, ...selectedBoards].filter(Boolean))).sort((a, b) => a.localeCompare(b));

  function toggleBoard(board: string) {
    setSelectedBoards((current) =>
      current.includes(board) ? current.filter((item) => item !== board) : [...current, board]
    );
  }

  function addNewBoard() {
    const name = newBoardName.trim();
    if (!name) return;
    setSelectedBoards((current) => current.includes(name) ? current : [...current, name]);
    onNewBoardNameChange('');
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.boardSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>加入分類</Text>
              <Text style={styles.boardSheetSubtitle} numberOfLines={1}>{idea.title || '未命名題材'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>現有分類</Text>
          {allBoards.length > 0 ? (
            <View style={styles.boardRows}>
              {allBoards.map((board) => {
                const active = selectedBoards.includes(board);
                return (
                  <TouchableOpacity key={board} onPress={() => toggleBoard(board)} style={[styles.boardRow, active && styles.boardRowActive]}>
                    <View style={styles.boardIconBox}>
                      <Feather name="folder" size={18} color={active ? '#ffffff' : colors.primary} />
                    </View>
                    <Text style={[styles.boardRowText, active && styles.boardRowTextActive]}>{board}</Text>
                    <Feather name={active ? 'check' : 'plus'} size={18} color={active ? '#ffffff' : colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.noBoardsCard}>
              <Feather name="folder-plus" size={22} color={colors.textMuted} />
              <Text style={styles.noBoardsText}>未有分類，下面可以新增第一個。</Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>新增分類</Text>
          <View style={styles.newBoardRow}>
            <TextInput
              value={newBoardName}
              onChangeText={onNewBoardNameChange}
              placeholder="例如：香港靈感、餐廳、旅行"
              placeholderTextColor="#9ca3af"
              style={styles.newBoardInput}
            />
            <TouchableOpacity onPress={addNewBoard} style={styles.newBoardButton}>
              <Feather name="plus" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => onSave(idea, selectedBoards)}
            disabled={saving}
            style={[styles.saveButton, saving && styles.disabledButton]}
          >
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveButtonText}>儲存分類</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function FilterSheet({
  visible,
  boards,
  boardFilter,
  regionFilter,
  viewMode,
  onBoardChange,
  onRegionChange,
  onViewModeChange,
  onClose
}: {
  visible: boolean;
  boards: string[];
  boardFilter: string | null;
  regionFilter: RegionKey | null;
  viewMode: 'list' | 'map';
  onBoardChange: (board: string | null) => void;
  onRegionChange: (region: RegionKey | null) => void;
  onViewModeChange: (mode: 'list' | 'map') => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>篩選顯示</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>顯示方式</Text>
          <View style={styles.selectorRow}>
            <Chip label="清單" active={viewMode === 'list'} onPress={() => onViewModeChange('list')} />
            <Chip label="地圖" active={viewMode === 'map'} onPress={() => onViewModeChange('map')} />
          </View>

          <Text style={styles.fieldLabel}>地區</Text>
          <View style={styles.selectorRow}>
            <Chip label="全部地區" active={!regionFilter} onPress={() => onRegionChange(null)} />
            {REGIONS.map((region) => (
              <Chip
                key={region.key}
                label={region.label}
                active={regionFilter === region.key}
                onPress={() => onRegionChange(region.key)}
              />
            ))}
          </View>

          {boards.length > 0 ? (
            <>
              <Text style={styles.fieldLabel}>分類</Text>
              <View style={styles.selectorRow}>
                <Chip label="全部" active={!boardFilter} onPress={() => onBoardChange(null)} />
                {boards.map((board) => (
                  <Chip
                    key={board}
                    label={board}
                    active={boardFilter === board}
                    onPress={() => onBoardChange(board)}
                  />
                ))}
              </View>
            </>
          ) : null}

          <TouchableOpacity onPress={onClose} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>完成</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function IdeaDetailSheet({
  idea,
  onClose,
  onEdit,
  onManageBoards
}: {
  idea: IdeaRecord | null;
  onClose: () => void;
  onEdit: (idea: IdeaRecord) => void;
  onManageBoards: (idea: IdeaRecord) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!idea) return null;

  const currentIdea = idea;
  const sourceUrl = currentIdea.source_url || currentIdea.url || '';
  const imageUrl = currentIdea.thumb || '';
  const videoUrl = isPlayableVideoUrl(currentIdea.video_url) ? currentIdea.video_url || '' : '';
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
              <TouchableOpacity onPress={() => onManageBoards(idea)} style={styles.addToBoardButton}>
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
  const [regionFilter, setRegionFilter] = useState<RegionKey | null>(null);
  const [searchText, setSearchText] = useState('');
  const [boardFilter, setBoardFilter] = useState<string | null>(null);
  const [localBoards, setLocalBoards] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<IdeaRecord | null>(null);
  const [editingIdea, setEditingIdea] = useState<IdeaRecord | null>(null);
  const [boardIdea, setBoardIdea] = useState<IdeaRecord | null>(null);
  const [newBoardName, setNewBoardName] = useState('');
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

  const loadIdeas = useCallback(async (showLoader = true, autoEnrich = true) => {
    if (!user) return;
    if (showLoader) setLoading(true);

    try {
      const id = workspaceId ?? await resolveWorkspace();
      setWorkspaceId(id);

      let query = supabase
        .from('ideas')
        .select('*')
        .order('created_at', { ascending: false });

      query = id ? query.or(`workspace_id.eq.${id},user_id.eq.${user.id}`) : query.eq('user_id', user.id);

      const { data, error } = await query;
      if (error) throw error;
      const nextIdeas = (data ?? []) as IdeaRecord[];
      setIdeas(nextIdeas);
      setLocalBoards(await loadLocalIdeaBoards());

      if (autoEnrich) {
        const pending = nextIdeas.filter(ideaNeedsEnrichment).slice(0, 4);
        if (pending.length > 0) {
          pending.forEach((idea) => enrichingIdeaIds.add(idea.id));
          Promise.allSettled(
            pending.map((idea) =>
              enrichIdeaFromUrl(idea.id, ideaSourceUrl(idea), Array.isArray(idea.categories) ? idea.categories : [])
                .finally(() => enrichingIdeaIds.delete(idea.id))
            )
          ).then(() => loadIdeas(false, false));
        }
      }
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

  const boardOptions = useMemo(() => {
    const categories = new Set<string>();
    localBoards.forEach((board) => {
      if (board) categories.add(board);
    });
    ideas.forEach((idea) => {
      (Array.isArray(idea.categories) ? idea.categories : []).forEach((category) => {
        if (category && !REGIONS.some((region) => region.key === category)) categories.add(category);
      });
    });
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [ideas, localBoards]);

  const filteredIdeas = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return ideas.filter((idea) => {
      const matchesRegion = !regionFilter || ideaRegions(idea).includes(regionFilter);
      const matchesBoard = !boardFilter || (Array.isArray(idea.categories) && idea.categories.includes(boardFilter));
      const matchesSearch = !query || ideaSearchText(idea).includes(query);
      return matchesRegion && matchesBoard && matchesSearch;
    });
  }, [boardFilter, ideas, regionFilter, searchText]);

  const mappableIdeas = useMemo(() => {
    return filteredIdeas.filter((idea) => typeof idea.lat === 'number' && typeof idea.lng === 'number');
  }, [filteredIdeas]);

  const initialMapRegion = useMemo(() => {
    const first = mappableIdeas[0];
    return {
      latitude: first?.lat ?? 22.3193,
      longitude: first?.lng ?? 114.1694,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08
    };
  }, [mappableIdeas]);

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

  function openBoardPicker(idea: IdeaRecord) {
    setNewBoardName('');
    setBoardIdea(idea);
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
      const boardCategories = ideaBoards(editingIdea);
      const nextCategories = mergeRegionsAndBoards(draft.regions, boardCategories);
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
          categories: nextCategories
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

  async function saveIdeaBoards(idea: IdeaRecord, nextBoards: string[]) {
    setSaving(true);
    try {
      const nextCategories = mergeRegionsAndBoards(ideaRegions(idea), nextBoards);
      const { error } = await supabase
        .from('ideas')
        .update({ categories: nextCategories })
        .eq('id', idea.id);

      if (error) throw error;

      const nextIdea = { ...idea, categories: nextCategories };
      setLocalBoards(await mergeLocalIdeaBoards(nextBoards));
      setIdeas((current) => current.map((item) => item.id === idea.id ? { ...item, categories: nextCategories } : item));
      setSelectedIdea((current) => current?.id === idea.id ? nextIdea : current);
      if (boardFilter && !nextCategories.includes(boardFilter)) setBoardFilter(null);
      setBoardIdea(null);
      setNewBoardName('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('儲存分類失敗', message);
    } finally {
      setSaving(false);
    }
  }

  function renderIdea({ item }: { item: IdeaRecord }) {
    const regions = ideaRegions(item);
    const previewImage = ideaPreviewImage(item);
    const playableVideoUrl = isPlayableVideoUrl(item.video_url) ? item.video_url : null;
    const sourceUrl = ideaSourceUrl(item);
    const placeName = item.place_name || item.shop_name;
    return (
      <Pressable onPress={() => openDetailModal(item)} style={({ pressed }) => [styles.ideaCard, pressed && styles.pressed]}>
        <View style={styles.cardMedia}>
          {playableVideoUrl ? (
            <ClipPlayer
              clip={{ id: item.id, video_url: playableVideoUrl, media_urls: previewImage ? [previewImage] : [] }}
              width={ideaGridCardWidth}
              height={ideaCardPreviewHeight}
              thumbnail
            />
          ) : previewImage ? (
            <>
              <Image source={{ uri: previewImage }} style={styles.cardImage} resizeMode="cover" />
              {sourceUrl ? (
                <View pointerEvents="none" style={styles.cardPlayBadge}>
                  <Feather name="play" size={13} color="#ffffff" />
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.cardImageEmpty}>
              <Feather name={sourceUrl ? 'instagram' : 'bookmark'} size={22} color="#c7b8ad" />
              <Text style={styles.cardImageEmptyText}>
                {sourceUrl ? '未能預覽原片' : '未有預覽'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.cardBody}>
          {placeName ? (
            <View style={styles.cardPlaceRow}>
              <Text style={styles.cardPin}>📍</Text>
              <Text style={styles.cardPlaceText} numberOfLines={1}>{placeName}</Text>
            </View>
          ) : null}
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title || '未命名題材'}</Text>
            <Feather name="chevron-right" size={18} color={colors.textMuted} />
          </View>
          <Text style={styles.cardTopic} numberOfLines={1}>{item.topic || item.summary || '未設定主題'}</Text>
          <View style={styles.cardTags}>
            <Text style={styles.typeTag}>{typeLabel(item.platform)}</Text>
            {regions.map((region) => <Text key={region} style={styles.regionTag}>{region}</Text>)}
          </View>
          <Text style={styles.cardDate}>{formatDate(item.created_at)}</Text>
        </View>
      </Pressable>
    );
  }

  function renderMapIdeaCard(item: IdeaRecord) {
    const previewImage = ideaPreviewImage(item);
    const playableVideoUrl = isPlayableVideoUrl(item.video_url) ? item.video_url : null;
    const sourceUrl = ideaSourceUrl(item);
    return (
      <Pressable key={item.id} onPress={() => openDetailModal(item)} style={({ pressed }) => [styles.mapIdeaCard, pressed && styles.pressed]}>
        {playableVideoUrl ? (
          <ClipPlayer
            clip={{ id: item.id, video_url: playableVideoUrl, media_urls: previewImage ? [previewImage] : [] }}
            width={170}
            height={112}
            thumbnail
          />
        ) : previewImage ? (
          <Image source={{ uri: previewImage }} style={styles.mapIdeaImage} resizeMode="cover" />
        ) : (
          <View style={styles.mapIdeaImageEmpty}>
            <Feather name={sourceUrl ? 'instagram' : 'bookmark'} size={20} color="#c7b8ad" />
            <Text style={styles.mapIdeaImageEmptyText}>
              {sourceUrl ? '未能預覽' : '未有預覽'}
            </Text>
          </View>
        )}
        <Text style={styles.mapIdeaTitle} numberOfLines={2}>{item.title || '未命名題材'}</Text>
        <Text style={styles.mapIdeaPlace} numberOfLines={1}>{item.place_name || item.shop_name || typeLabel(item.platform)}</Text>
      </Pressable>
    );
  }

  function renderMapContent() {
    if (filteredIdeas.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Feather name="map-pin" size={36} color="#d1d5db" />
          <Text style={styles.emptyText}>未有符合條件嘅題材</Text>
        </View>
      );
    }

    if (mappableIdeas.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Feather name="map" size={36} color="#d1d5db" />
          <Text style={styles.emptyText}>呢批題材未有地點資料。儲存 IG 地點內容後，會自動出現在地圖。</Text>
        </View>
      );
    }

    return (
      <View style={styles.libraryMapWrap}>
        <MapView
          style={styles.libraryMap}
          customMapStyle={darkMapStyle}
          initialRegion={initialMapRegion}
        >
          {mappableIdeas.map((idea) => (
            <Marker
              key={idea.id}
              coordinate={{ latitude: idea.lat!, longitude: idea.lng! }}
              title={idea.place_name || idea.title || 'Saved idea'}
              description={idea.topic || undefined}
              onPress={() => setSelectedIdea(idea)}
            />
          ))}
        </MapView>
        <View style={[styles.mapSheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.mapHandle} />
          <View style={styles.mapSheetHeader}>
            <Text style={styles.mapSheetTitle}>已儲存地點</Text>
            <Text style={styles.mapSheetCount}>{mappableIdeas.length} 個</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mapCardsContent}>
            {mappableIdeas.map(renderMapIdeaCard)}
          </ScrollView>
        </View>
      </View>
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

      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Feather name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="搜尋題材、地點、分類..."
            placeholderTextColor="#9ca3af"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchText ? (
            <TouchableOpacity onPress={() => setSearchText('')} style={styles.searchClear}>
              <Feather name="x" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.controlRow}>
          <TouchableOpacity onPress={() => setShowFilterSheet(true)} style={styles.controlButton}>
            <Feather name="sliders" size={15} color={colors.primary} />
            <Text style={styles.controlButtonText}>
              {regionFilter ? REGIONS.find((region) => region.key === regionFilter)?.label : '地區'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setViewMode((current) => current === 'list' ? 'map' : 'list')} style={styles.controlButton}>
            <Feather name={viewMode === 'list' ? 'grid' : 'map'} size={15} color={colors.primary} />
            <Text style={styles.controlButtonText}>{viewMode === 'list' ? '清單' : '地圖'}</Text>
          </TouchableOpacity>
        </View>
        {boardOptions.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardFilterContent}>
            <Chip label="全部" active={!boardFilter} onPress={() => setBoardFilter(null)} />
            {boardOptions.map((board) => (
              <Chip key={board} label={board} active={boardFilter === board} onPress={() => setBoardFilter(board)} />
            ))}
          </ScrollView>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        viewMode === 'map' ? (
          renderMapContent()
        ) : (
          <FlatList
            data={filteredIdeas}
            keyExtractor={(item) => item.id}
            renderItem={renderIdea}
            numColumns={2}
            columnWrapperStyle={styles.listColumn}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 110 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Feather name="bookmark" size={36} color="#d1d5db" />
                <Text style={styles.emptyText}>未有題材，點擊 + 新增你的第一個靈感</Text>
              </View>
            }
          />
        )
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
        onManageBoards={openBoardPicker}
      />

      <BoardPickerSheet
        idea={boardIdea}
        boards={boardOptions}
        saving={saving}
        newBoardName={newBoardName}
        onNewBoardNameChange={setNewBoardName}
        onClose={() => setBoardIdea(null)}
        onSave={saveIdeaBoards}
      />

      <FilterSheet
        visible={showFilterSheet}
        boards={boardOptions}
        boardFilter={boardFilter}
        regionFilter={regionFilter}
        viewMode={viewMode}
        onBoardChange={setBoardFilter}
        onRegionChange={setRegionFilter}
        onViewModeChange={setViewMode}
        onClose={() => setShowFilterSheet(false)}
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
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10
  },
  searchBox: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8DED6',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingVertical: 10
  },
  searchClear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6'
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10
  },
  controlButton: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E8DED6',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11
  },
  controlButtonText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: '700'
  },
  boardFilterContent: {
    gap: 8,
    paddingTop: 2,
    paddingRight: 4
  },
  viewToggle: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E8DED6',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    padding: 3
  },
  viewToggleButton: {
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7
  },
  viewToggleButtonActive: {
    backgroundColor: '#8B0000'
  },
  viewToggleText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: '700'
  },
  viewToggleTextActive: {
    color: '#ffffff'
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
  listColumn: {
    gap: 12
  },
  ideaCard: {
    width: ideaGridCardWidth,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DED6',
    backgroundColor: '#ffffff',
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  cardMedia: {
    width: ideaGridCardWidth,
    height: ideaCardPreviewHeight,
    overflow: 'hidden',
    backgroundColor: '#F5F2ED'
  },
  cardImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#efe7df'
  },
  cardPlayBadge: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 32,
    height: 32,
    marginLeft: -16,
    marginTop: -16,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2
  },
  cardImageEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F5F2ED'
  },
  cardImageEmptyText: {
    color: '#a89b92',
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    fontWeight: '600'
  },
  cardBody: {
    minHeight: 130,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  cardPlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5
  },
  cardPin: {
    fontSize: 13
  },
  cardPlaceText: {
    flex: 1,
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: '700'
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
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21
  },
  cardTopic: {
    marginTop: 5,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  cardTags: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5
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
    marginTop: 8,
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
  libraryMapWrap: {
    flex: 1,
    marginTop: 8,
    backgroundColor: '#0b1118'
  },
  libraryMap: {
    flex: 1
  },
  mapSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#060606',
    paddingTop: 10
  },
  mapHandle: {
    alignSelf: 'center',
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.72)',
    marginBottom: 12
  },
  mapSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 12
  },
  mapSheetTitle: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    fontWeight: '800'
  },
  mapSheetCount: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    fontWeight: '600'
  },
  mapCardsContent: {
    gap: 12,
    paddingHorizontal: 18
  },
  mapIdeaCard: {
    width: 170,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  mapIdeaImage: {
    width: '100%',
    height: 112,
    backgroundColor: '#222'
  },
  mapIdeaImageEmpty: {
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#202020'
  },
  mapIdeaImageEmptyText: {
    color: 'rgba(255,255,255,0.45)',
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    fontWeight: '600'
  },
  mapIdeaTitle: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
    paddingHorizontal: 10,
    paddingTop: 10
  },
  mapIdeaPlace: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.body,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 12
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
  filterSheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 10
  },
  boardSheet: {
    maxHeight: '78%',
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
  boardSheetSubtitle: {
    marginTop: 3,
    maxWidth: screenWidth - 112,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
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
  boardRows: {
    gap: 8
  },
  boardRow: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12
  },
  boardRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  boardIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(92,42,34,0.08)'
  },
  boardRowText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    fontWeight: '700'
  },
  boardRowTextActive: {
    color: '#ffffff'
  },
  noBoardsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14
  },
  noBoardsText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20
  },
  newBoardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  newBoardInput: {
    flex: 1,
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
  newBoardButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
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
