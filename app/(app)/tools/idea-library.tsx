import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { WebView } from 'react-native-webview';
import { BackHeader } from '@/components/BackHeader';
import ClipPlayer from '@/components/ClipPlayer';
import { LineIcon as Feather } from '@/components/LineIcon';
import { useAuth } from '@/hooks/useAuth';
import { loadLocalIdeaBoards, mergeLocalIdeaBoards, saveLocalIdeaBoards } from '@/lib/ideaBoards';
import { enrichIdeaFromUrl } from '@/lib/ideaEnrichment';
import { supabase } from '@/lib/supabase';
import { stripCitationMarkup } from '@/lib/textSanitizer';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

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
  shop_highlights?: string | null;
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
  boards: string[];
  notes: string;
  placeName: string;
  placeAddress: string;
  shopHighlights: string;
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
  boards: [],
  notes: '',
  placeName: '',
  placeAddress: '',
  shopHighlights: ''
};

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;
const ideaGridCardWidth = Math.floor((screenWidth - 44) / 2);
const ideaCardPreviewHeight = Math.round((ideaGridCardWidth * 16) / 9);
const enrichingIdeaIds = new Set<string>();
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#263141' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d9e2f1' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a2330' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3a4658' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1f3a4d' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#2f3d33' }] }
];

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
    title: stripCitationMarkup(idea.title),
    topic: stripCitationMarkup(idea.topic),
    type: normalizeType(idea.platform),
    regions: ideaRegions(idea),
    boards: ideaBoards(idea),
    notes: stripCitationMarkup(idea.notes ?? idea.summary ?? idea.description),
    placeName: stripCitationMarkup(idea.place_name ?? idea.shop_name),
    placeAddress: stripCitationMarkup(idea.place_address),
    shopHighlights: stripCitationMarkup(idea.shop_highlights)
  };
}

function containsMeaningfulEnglish(value: string) {
  const englishLetters = (value.match(/[A-Za-z]/g) ?? []).length;
  const chineseChars = (value.match(/[\u3400-\u9FFF]/g) ?? []).length;
  return englishLetters >= 20 && englishLetters > chineseChars * 2;
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
  const url = value.trim().toLowerCase();
  if (/instagram\.com\/(reel|p|tv)\//.test(url)) return false;
  return (
    url.startsWith('file:') ||
    url.startsWith('content:') ||
    url.startsWith('ph:') ||
    url.startsWith('assets-library:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.includes('.mp4') ||
    url.includes('.mov') ||
    url.includes('.m4v') ||
    url.includes('.m3u8') ||
    url.includes('supabase') ||
    url.includes('cloudinary') ||
    url.includes('mux') ||
    url.includes('cdninstagram') ||
    url.includes('fbcdn') ||
    url.includes('akamai') ||
    url.includes('/video/')
  );
}

function normalizeVideoUrl(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return `file://${raw}`;
  return raw;
}

function playableVideoUrl(value?: string | null) {
  const normalized = normalizeVideoUrl(value);
  return isPlayableVideoUrl(normalized) ? normalized : '';
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

function ideaHasPendingEnrichment(idea: IdeaRecord) {
  const sourceUrl = ideaSourceUrl(idea);
  if (!sourceUrl) return false;

  const tags = Array.isArray(idea.tags) ? idea.tags : [];
  const hasPendingTag = tags.includes('待分析');
  const hasGenericTitle =
    (!idea.title || idea.title === 'IG Reel 靈感' || idea.title === 'Instagram Reel 靈感') &&
    (!idea.thumb && !idea.summary && !idea.description);
  const missingUsefulPreview = !idea.thumb && !idea.summary && !idea.description;
  const missingMediaPreview = !idea.thumb && !idea.video_url;
  const isInstagramSource = /instagram\.com/i.test(sourceUrl);
  const missingInstagramDetails =
    isInstagramSource &&
    hasPendingTag &&
    (!idea.video_url || !idea.place_name || (!idea.summary && !idea.description));

  return hasPendingTag || hasGenericTitle || missingUsefulPreview || missingMediaPreview || missingInstagramDetails;
}

function ideaNeedsEnrichment(idea: IdeaRecord) {
  if (enrichingIdeaIds.has(idea.id)) return false;
  return ideaHasPendingEnrichment(idea);
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
  boardOptions = [],
  onChange,
  onClose,
  onSave
}: {
  visible: boolean;
  title: string;
  draft: IdeaDraft;
  saving: boolean;
  boardOptions?: string[];
  onChange: (draft: IdeaDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [newBoardName, setNewBoardName] = useState('');

  function toggleBoard(board: string) {
    const nextBoards = draft.boards.includes(board)
      ? draft.boards.filter((item) => item !== board)
      : [...draft.boards, board];
    onChange({ ...draft, boards: nextBoards });
  }

  function addBoard() {
    const board = newBoardName.trim();
    if (!board) return;
    onChange({ ...draft, boards: draft.boards.includes(board) ? draft.boards : [...draft.boards, board] });
    setNewBoardName('');
  }

  const allBoards = Array.from(new Set([...boardOptions, ...draft.boards].filter(Boolean))).sort((a, b) => a.localeCompare(b));

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

              <Text style={styles.fieldLabel}>分類</Text>
              {allBoards.length > 0 ? (
                <View style={styles.selectorRow}>
                  {allBoards.map((board) => (
                    <Chip
                      key={board}
                      label={board}
                      active={draft.boards.includes(board)}
                      onPress={() => toggleBoard(board)}
                    />
                  ))}
                </View>
              ) : null}
              <View style={styles.newBoardRow}>
                <TextInput
                  value={newBoardName}
                  onChangeText={setNewBoardName}
                  placeholder="新增分類，例如：台灣"
                  placeholderTextColor="#9ca3af"
                  style={styles.newBoardInput}
                />
                <TouchableOpacity onPress={addBoard} style={styles.newBoardButton}>
                  <Feather name="plus" size={18} color="#ffffff" />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>備註</Text>
              <TextInput
                value={draft.notes}
                onChangeText={(value) => onChange({ ...draft, notes: value })}
                placeholder="用繁體中文寫低拍法、特色、參考資料..."
                placeholderTextColor="#9ca3af"
                style={[styles.input, styles.textarea]}
                multiline
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>店名／地點</Text>
              <TextInput
                value={draft.placeName}
                onChangeText={(value) => onChange({ ...draft, placeName: value })}
                placeholder="例如：pogmam"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>地址</Text>
              <TextInput
                value={draft.placeAddress}
                onChangeText={(value) => onChange({ ...draft, placeAddress: value })}
                placeholder="例如：大阪市北區中崎西..."
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>出名／推薦</Text>
              <TextInput
                value={draft.shopHighlights}
                onChangeText={(value) => onChange({ ...draft, shopHighlights: value })}
                placeholder="例如：圓球形提拉米蘇、即席淋咖啡醬"
                placeholderTextColor="#9ca3af"
                style={[styles.input, styles.textareaSmall]}
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

function IdeaManageSheet({
  idea,
  visible,
  translating,
  onClose,
  onEdit,
  onTranslate,
  onDelete
}: {
  idea: IdeaRecord;
  visible: boolean;
  translating: boolean;
  onClose: () => void;
  onEdit: () => void;
  onTranslate: () => void;
  onDelete: () => void;
}) {
  const insets = useSafeAreaInsets();
  const description = idea.notes || idea.summary || idea.description || '';
  const shouldSuggestTranslation = containsMeaningfulEnglish([
    idea.title,
    idea.topic,
    description,
    idea.shop_highlights
  ].filter(Boolean).join('\n'));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.manageSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>題材設定</Text>
              <Text numberOfLines={1} style={styles.boardSheetSubtitle}>{idea.title || '未命名題材'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onEdit} style={styles.manageRow}>
            <View style={styles.manageIcon}>
              <Feather name="edit-3" size={19} color={colors.primary} />
            </View>
            <View style={styles.manageCopy}>
              <Text style={styles.manageTitle}>編輯資料</Text>
              <Text style={styles.manageSubtitle}>修改標題、描述、店名、地址同推薦資料</Text>
            </View>
            <Feather name="chevron-right" size={19} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity onPress={onTranslate} disabled={translating} style={styles.manageRow}>
            <View style={styles.manageIcon}>
              <Feather name="type" size={19} color={colors.primary} />
            </View>
            <View style={styles.manageCopy}>
              <Text style={styles.manageTitle}>整理成繁體中文</Text>
              <Text style={styles.manageSubtitle}>
                {shouldSuggestTranslation ? '偵測到英文內容，可以用 AI 轉成繁體書面語' : '用 AI 將現有資料統一成繁體書面語'}
              </Text>
            </View>
            {translating ? <ActivityIndicator color={colors.primary} /> : <Feather name="chevron-right" size={19} color={colors.textMuted} />}
          </TouchableOpacity>

          <TouchableOpacity onPress={onDelete} style={[styles.manageRow, styles.manageDangerRow]}>
            <View style={[styles.manageIcon, styles.manageDangerIcon]}>
              <Feather name="trash-2" size={19} color={colors.error} />
            </View>
            <View style={styles.manageCopy}>
              <Text style={[styles.manageTitle, styles.manageDangerText]}>刪除題材</Text>
              <Text style={styles.manageSubtitle}>由題材庫移除呢條資料</Text>
            </View>
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
  onDeleteBoard,
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
  onDeleteBoard: (board: string) => void;
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

          <ScrollView style={styles.filterSheetScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterSheetContent}>
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

                <Text style={styles.fieldLabel}>管理分類</Text>
                <View style={styles.boardManageRows}>
                  {boards.map((board) => (
                    <View key={`manage-${board}`} style={styles.boardManageRow}>
                      <View style={styles.boardManageCopy}>
                        <Feather name="folder" size={17} color={colors.primary} />
                        <Text style={styles.boardManageText} numberOfLines={1}>{board}</Text>
                      </View>
                      <TouchableOpacity onPress={() => onDeleteBoard(board)} style={styles.boardDeleteButton} hitSlop={8}>
                        <Feather name="trash-2" size={17} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>

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
  onManageBoards,
  onDelete,
  onTranslate,
  translatingIdeaId
}: {
  idea: IdeaRecord | null;
  onClose: () => void;
  onEdit: (idea: IdeaRecord) => void;
  onManageBoards: (idea: IdeaRecord) => void;
  onDelete: (idea: IdeaRecord) => void;
  onTranslate: (idea: IdeaRecord) => void;
  translatingIdeaId: string | null;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showSourceWebView, setShowSourceWebView] = useState(false);
  const [showManageSheet, setShowManageSheet] = useState(false);
  if (!idea) return null;

  const currentIdea = idea;
  const sourceUrl = currentIdea.source_url || currentIdea.url || '';
  const imageUrl = currentIdea.thumb || '';
  const videoUrl = playableVideoUrl(currentIdea.video_url);
  const placeName = stripCitationMarkup(currentIdea.place_name || currentIdea.shop_name);
  const placeAddress = stripCitationMarkup(currentIdea.place_address);
  const shopHighlights = stripCitationMarkup(currentIdea.shop_highlights);
  const description = stripCitationMarkup(currentIdea.notes || currentIdea.summary || currentIdea.description);
  const hasMap = typeof currentIdea.lat === 'number' && typeof currentIdea.lng === 'number';
  const hasShopInfo = Boolean(placeName || placeAddress || shopHighlights || hasMap);
  const categories = Array.isArray(currentIdea.categories) ? currentIdea.categories : [];
  const heroHeight = Math.min(Math.round(screenWidth * 16 / 9), Math.round(screenHeight * 0.72));
  const genericTitles = ['IG Reel 靈感', 'Instagram Reel 靈感', 'Instagram'];
  const detailTitle = stripCitationMarkup(currentIdea.title);
  const detailTopic = stripCitationMarkup(currentIdea.topic);
  const shouldShowTitle = Boolean(detailTitle && !genericTitles.includes(detailTitle));

  function openSource() {
    if (!sourceUrl) return;
    setShowSourceWebView(true);
  }

  async function openSourceExternally() {
    if (!sourceUrl) return;
    try {
      await Linking.openURL(sourceUrl);
    } catch {
      try {
        await WebBrowser.openBrowserAsync(sourceUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
          controlsColor: '#5C2A22',
          dismissButtonStyle: 'close',
        });
      } catch {
        Alert.alert('未能開啟 Instagram');
      }
    }
  }

  function shouldOpenInWebView(requestUrl: string) {
    if (
      requestUrl.startsWith('instagram://') ||
      requestUrl.startsWith('itms-apps://') ||
      requestUrl.startsWith('itms-appss://')
    ) {
      return false;
    }
    return true;
  }

  function renderSourceWebView() {
    return (
      <Modal
        visible={showSourceWebView}
        transparent={false}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowSourceWebView(false)}
      >
        <View style={styles.sourceWebViewScreen}>
          <View style={[styles.sourceWebViewHeader, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity
              onPress={() => setShowSourceWebView(false)}
              style={styles.sourceWebViewHeaderButton}
            >
              <Feather name="x" size={24} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.sourceWebViewTitle}>Instagram</Text>
            <TouchableOpacity onPress={openSourceExternally} style={styles.sourceWebViewHeaderButton}>
              <Feather name="external-link" size={21} color="#5C2A22" />
            </TouchableOpacity>
          </View>
          {sourceUrl ? (
            <WebView
              source={{ uri: sourceUrl }}
              style={styles.sourceWebView}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              sharedCookiesEnabled
              setSupportMultipleWindows={false}
              originWhitelist={['*']}
              allowsBackForwardNavigationGestures
              userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
              onShouldStartLoadWithRequest={(request) => shouldOpenInWebView(request.url || '')}
            />
          ) : null}
        </View>
      </Modal>
    );
  }

  async function openMap() {
    if (!hasMap) return;
    const label = encodeURIComponent(placeName || detailTitle || 'Saved idea');
    const appleUrl = `http://maps.apple.com/?ll=${currentIdea.lat},${currentIdea.lng}&q=${label}`;
    const googleUrl = `https://www.google.com/maps/search/?api=1&query=${currentIdea.lat},${currentIdea.lng}`;
    const canOpenApple = await Linking.canOpenURL(appleUrl);
    await Linking.openURL(canOpenApple ? appleUrl : googleUrl);
  }

  async function shareIdea() {
    const message = [detailTitle, placeName, sourceUrl].filter(Boolean).join('\n');
    if (message) await Share.share({ message });
  }

  function openScriptGenerator() {
    const background = [
      description ? `題材描述：${description}` : '',
      placeName ? `店舖／地點：${placeName}` : '',
      placeAddress ? `地址：${placeAddress}` : '',
      shopHighlights ? `出名／推薦：${shopHighlights}` : '',
      sourceUrl ? `來源：${sourceUrl}` : ''
    ].filter(Boolean).join('\n').slice(0, 1800);

    onClose();
    router.push({
      pathname: '/(app)/tools/script-generator',
      params: {
        brand: placeName || detailTitle || '',
        industry: '飲食',
        topic: detailTitle || placeName || detailTopic || 'IG Reel 題材',
        background
      }
    });
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
              <Pressable
                disabled={!sourceUrl}
                onPress={openSource}
                style={styles.detailHeroImageButton}
              >
                <Image source={{ uri: imageUrl }} style={styles.detailHeroImage} resizeMode="cover" />
                {sourceUrl ? (
                  <View pointerEvents="none" style={styles.detailSourcePlayBadge}>
                    <Feather name="play" size={34} color="#ffffff" />
                    <Text style={styles.detailSourcePlayText}>在 Instagram 播放</Text>
                  </View>
                ) : null}
              </Pressable>
            ) : (
              <View style={styles.detailHeroEmpty}>
                <Feather name="bookmark" size={42} color="rgba(255,255,255,0.45)" />
                <Text style={styles.detailHeroEmptyText}>{detailTitle || 'IG Reel 靈感'}</Text>
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
                <Feather name={normalizeType(idea.platform) === 'instagram' ? 'instagram' : 'external-link'} size={24} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowManageSheet(true)} style={styles.detailIconButton}>
                <Feather name="more-horizontal" size={25} color={colors.primary} />
              </TouchableOpacity>
              <View style={styles.detailActionSpacer} />
              <TouchableOpacity onPress={() => onManageBoards(idea)} style={styles.addToBoardButton}>
                <Feather name="plus" size={19} color="#ffffff" />
                <Text style={styles.addToBoardText}>加入分類</Text>
              </TouchableOpacity>
            </View>

            {placeName ? (
              <View style={styles.placeRow}>
                <Text style={styles.placePin}>📍</Text>
                <Text style={styles.placeName}>{placeName}</Text>
              </View>
            ) : null}

            {shouldShowTitle ? (
              <Text style={styles.detailTitle}>{detailTitle || '未命名題材'}</Text>
            ) : null}

            {description ? <Text style={styles.detailDescription}>{description}</Text> : null}

            <TouchableOpacity onPress={openScriptGenerator} style={styles.scriptGeneratorButton}>
              <View style={styles.scriptGeneratorIcon}>
                <Feather name="file-text" size={18} color="#ffffff" />
              </View>
              <View style={styles.scriptGeneratorCopy}>
                <Text style={styles.scriptGeneratorText}>推上劇本生成</Text>
                <Text style={styles.scriptGeneratorSubtext}>帶入題材、店名同背景資料</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#ffffff" />
            </TouchableOpacity>

            {hasShopInfo ? (
              <View style={styles.shopInfoCard}>
                <View style={styles.shopInfoHeader}>
                  <View style={styles.shopInfoIcon}>
                    <Feather name="map-pin" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.shopInfoTitleWrap}>
                    <Text style={styles.shopInfoEyebrow}>店舖資料</Text>
                    <Text style={styles.shopInfoTitle}>{placeName || '已找到地點'}</Text>
                  </View>
                </View>
                {placeAddress ? (
                  <View style={styles.shopInfoRow}>
                    <Feather name="navigation" size={16} color={colors.textMuted} />
                    <Text style={styles.shopInfoText}>{placeAddress}</Text>
                  </View>
                ) : null}
                {shopHighlights ? (
                  <View style={styles.shopInfoHighlight}>
                    <Text style={styles.shopInfoHighlightLabel}>出名／推薦</Text>
                    <Text style={styles.shopInfoHighlightText}>{shopHighlights}</Text>
                  </View>
                ) : null}
                {hasMap ? (
                  <TouchableOpacity onPress={openMap} style={styles.shopInfoMapButton}>
                    <Feather name="map" size={16} color="#ffffff" />
                    <Text style={styles.shopInfoMapButtonText}>在地圖開啟</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

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
                  <Feather name="link" size={15} color={colors.primary} />
                  <Text numberOfLines={1} style={styles.sourceLinkText}>{sourceUrl}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.feedbackRow}>
              <TouchableOpacity style={styles.feedbackButton}>
                <Feather name="heart" size={24} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.feedbackButton}>
                <Feather name="thumbs-up" size={24} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.feedbackButton}>
                <Feather name="thumbs-down" size={24} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={shareIdea} style={styles.feedbackButton}>
                <Feather name="send" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {hasMap ? (
              <View style={styles.mapSection}>
                <MapView
                  style={styles.detailMap}
                  pointerEvents="none"
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
                <Feather name="map-pin" size={20} color={colors.textMuted} />
                <Text style={styles.noMapText}>未有地點資料。你可以編輯題材補充地點，之後就會顯示地圖。</Text>
              </View>
            )}
          </View>
        </ScrollView>
        <IdeaManageSheet
          idea={currentIdea}
          visible={showManageSheet}
          translating={translatingIdeaId === currentIdea.id}
          onClose={() => setShowManageSheet(false)}
          onEdit={() => {
            setShowManageSheet(false);
            setTimeout(() => onEdit(currentIdea), 180);
          }}
          onTranslate={() => onTranslate(currentIdea)}
          onDelete={() => onDelete(currentIdea)}
        />
        {renderSourceWebView()}
      </View>
    </Modal>
  );
}

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
  const [translatingIdeaId, setTranslatingIdeaId] = useState<string | null>(null);
  const [pendingEnrichmentCount, setPendingEnrichmentCount] = useState(0);
  const enrichmentPollingStartedAt = useRef<number | null>(null);

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
      const accountBoards = Array.from(new Set(nextIdeas.flatMap((idea) => ideaBoards(idea)))).sort((a, b) => a.localeCompare(b));
      setIdeas(nextIdeas);
      setPendingEnrichmentCount(nextIdeas.filter(ideaHasPendingEnrichment).length);
      const storedBoards = await loadLocalIdeaBoards();
      setLocalBoards(accountBoards.length > 0 ? await mergeLocalIdeaBoards(accountBoards) : storedBoards);

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

  useEffect(() => {
    if (pendingEnrichmentCount <= 0) {
      enrichmentPollingStartedAt.current = null;
      return undefined;
    }

    if (!enrichmentPollingStartedAt.current) {
      enrichmentPollingStartedAt.current = Date.now();
    }

    if (Date.now() - enrichmentPollingStartedAt.current > 90000) {
      return undefined;
    }

    const timer = setTimeout(() => {
      loadIdeas(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [loadIdeas, pendingEnrichmentCount]);

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
    setSelectedIdea(null);
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
      const nextCategories = mergeRegionsAndBoards(draft.regions, draft.boards);
      const { error } = await supabase.from('ideas').insert({
        user_id: user.id,
        workspace_id: workspaceId,
        title: stripCitationMarkup(draft.title),
        topic: stripCitationMarkup(draft.topic) || stripCitationMarkup(draft.title),
        platform: draft.type,
        region: primaryRegion,
        country: primaryRegion,
        notes: stripCitationMarkup(draft.notes),
        summary: stripCitationMarkup(draft.notes),
        description: stripCitationMarkup(draft.notes),
        place_name: stripCitationMarkup(draft.placeName) || null,
        shop_name: stripCitationMarkup(draft.placeName) || null,
        place_address: stripCitationMarkup(draft.placeAddress) || null,
        shop_highlights: stripCitationMarkup(draft.shopHighlights) || null,
        tags: draft.regions,
        categories: nextCategories,
        viral_score: 0,
        ai_viral_base: 0,
        viral_potential: 'medium',
        date: new Date().toISOString()
      });

      if (error) throw error;
      if (draft.boards.length > 0) {
        setLocalBoards(await mergeLocalIdeaBoards(draft.boards));
      }
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
      const nextCategories = mergeRegionsAndBoards(draft.regions, draft.boards);
      const { error } = await supabase
        .from('ideas')
        .update({
          title: stripCitationMarkup(draft.title),
          topic: stripCitationMarkup(draft.topic) || stripCitationMarkup(draft.title),
          platform: draft.type,
          region: primaryRegion,
          country: primaryRegion,
          notes: stripCitationMarkup(draft.notes),
          summary: stripCitationMarkup(draft.notes),
          description: stripCitationMarkup(draft.notes),
          place_name: stripCitationMarkup(draft.placeName) || null,
          shop_name: stripCitationMarkup(draft.placeName) || null,
          place_address: stripCitationMarkup(draft.placeAddress) || null,
          shop_highlights: stripCitationMarkup(draft.shopHighlights) || null,
          tags: draft.regions,
          categories: nextCategories
        })
        .eq('id', editingIdea.id);

      if (error) throw error;
      if (draft.boards.length > 0) {
        setLocalBoards(await mergeLocalIdeaBoards(draft.boards));
      }
      setEditingIdea(null);
      await loadIdeas(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('儲存失敗', message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteIdea(idea: IdeaRecord) {
    if (!user) return;
    Alert.alert(
      '刪除題材',
      `確定要刪除「${idea.title || '未命名題材'}」？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            const previousIdeas = ideas;
            setIdeas((current) => current.filter((item) => item.id !== idea.id));
            setSelectedIdea(null);
            try {
              const { error } = await supabase
                .from('ideas')
                .delete()
                .eq('id', idea.id)
                .eq('user_id', user.id);

              if (error) throw error;
            } catch (err: unknown) {
              setIdeas(previousIdeas);
              const message = err instanceof Error ? err.message : '請稍後再試';
              Alert.alert('刪除失敗', message);
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  }

  async function translateIdeaToTraditionalChinese(idea: IdeaRecord) {
    if (!ANTHROPIC_KEY) {
      Alert.alert('未設定 AI Key', '請先設定 EXPO_PUBLIC_ANTHROPIC_KEY。');
      return;
    }

    const source = {
      title: idea.title || '',
      topic: idea.topic || '',
      description: idea.notes || idea.summary || idea.description || '',
      placeName: idea.place_name || idea.shop_name || '',
      placeAddress: idea.place_address || '',
      shopHighlights: idea.shop_highlights || ''
    };

    setTranslatingIdeaId(idea.id);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 900,
          messages: [{
            role: 'user',
            content: `你係香港/台灣用戶會睇嘅題材庫編輯。請將以下題材資料整理成繁體中文書面語，避免英文句子，保留店名原文可以，但描述要中文。

只回 JSON，不要 markdown：
{
  "title": "8-18字繁體中文題材標題",
  "topic": "繁體中文主題",
  "description": "2-4句繁體中文描述，清楚講內容亮點同可拍方向",
  "placeName": "店名或地點名；如原文店名可保留",
  "placeAddress": "地址；如未知留空",
  "shopHighlights": "店舖出名/推薦項目，繁體中文短句"
}

原始資料：
${JSON.stringify(source, null, 2)}`
          }]
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message ?? '整理失敗');
      const text = data?.content?.map((block: { text?: string }) => block.text).filter(Boolean).join('\n') ?? '';
      const jsonText = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(jsonText) as Partial<Record<'title' | 'topic' | 'description' | 'placeName' | 'placeAddress' | 'shopHighlights', string>>;

      const update = {
        title: stripCitationMarkup(parsed.title) || stripCitationMarkup(idea.title),
        topic: stripCitationMarkup(parsed.topic) || stripCitationMarkup(idea.topic) || stripCitationMarkup(parsed.title) || stripCitationMarkup(idea.title),
        notes: stripCitationMarkup(parsed.description) || stripCitationMarkup(idea.notes),
        summary: stripCitationMarkup(parsed.description) || stripCitationMarkup(idea.summary),
        description: stripCitationMarkup(parsed.description) || stripCitationMarkup(idea.description),
        place_name: stripCitationMarkup(parsed.placeName) || stripCitationMarkup(idea.place_name),
        shop_name: stripCitationMarkup(parsed.placeName) || stripCitationMarkup(idea.shop_name),
        place_address: stripCitationMarkup(parsed.placeAddress) || stripCitationMarkup(idea.place_address),
        shop_highlights: stripCitationMarkup(parsed.shopHighlights) || stripCitationMarkup(idea.shop_highlights)
      };

      const { error } = await supabase
        .from('ideas')
        .update(update)
        .eq('id', idea.id);

      if (error) throw error;
      const nextIdea = { ...idea, ...update };
      setIdeas((current) => current.map((item) => item.id === idea.id ? nextIdea : item));
      setSelectedIdea((current) => current?.id === idea.id ? nextIdea : current);
      Alert.alert('已整理', '題材資料已轉成繁體中文。');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '請稍後再試';
      Alert.alert('整理失敗', message);
    } finally {
      setTranslatingIdeaId(null);
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

  async function deleteBoard(board: string) {
    if (!user) return;

    const affectedIdeas = ideas.filter((idea) => Array.isArray(idea.categories) && idea.categories.includes(board));
    Alert.alert(
      '刪除分類',
      affectedIdeas.length > 0
        ? `會從 ${affectedIdeas.length} 條題材移除「${board}」分類，題材本身不會刪除。`
        : `確定要刪除「${board}」分類？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            const previousIdeas = ideas;
            const previousBoards = localBoards;
            const nextBoards = boardOptions.filter((item) => item !== board);
            const nextIdeas = ideas.map((idea) => ({
              ...idea,
              categories: Array.isArray(idea.categories)
                ? idea.categories.filter((category) => category !== board)
                : idea.categories
            }));

            setIdeas(nextIdeas);
            setLocalBoards(nextBoards);
            if (boardFilter === board) setBoardFilter(null);
            setSelectedIdea((current) => {
              if (!current) return current;
              return {
                ...current,
                categories: Array.isArray(current.categories)
                  ? current.categories.filter((category) => category !== board)
                  : current.categories
              };
            });

            try {
              await Promise.all(affectedIdeas.map(async (idea) => {
                const categories = Array.isArray(idea.categories)
                  ? idea.categories.filter((category) => category !== board)
                  : [];
                const { error } = await supabase
                  .from('ideas')
                  .update({ categories })
                  .eq('id', idea.id)
                  .eq('user_id', user.id);
                if (error) throw error;
              }));

              await saveLocalIdeaBoards(nextBoards);
            } catch (err: unknown) {
              setIdeas(previousIdeas);
              setLocalBoards(previousBoards);
              const message = err instanceof Error ? err.message : '請稍後再試';
              Alert.alert('刪除分類失敗', message);
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  }

  function renderIdea({ item }: { item: IdeaRecord }) {
    const regions = ideaRegions(item);
    const previewImage = ideaPreviewImage(item);
    const playableVideo = playableVideoUrl(item.video_url);
    const sourceUrl = ideaSourceUrl(item);
    const placeName = item.place_name || item.shop_name;
    const pendingEnrichment = ideaHasPendingEnrichment(item);
    const cardTitle = pendingEnrichment && (!item.title || item.title === 'IG Reel 靈感' || item.title === 'Instagram Reel 靈感')
      ? 'AI 正在整理題材'
      : item.title || '未命名題材';
    const cardTopic = pendingEnrichment
      ? '補資料中，約需 10–30 秒'
      : item.topic || item.summary || '未設定主題';
    return (
      <Pressable onPress={() => openDetailModal(item)} style={({ pressed }) => [styles.ideaCard, pressed && styles.pressed]}>
        <View style={styles.cardMedia}>
          {playableVideo ? (
            <ClipPlayer
              clip={{ id: item.id, video_url: playableVideo, media_urls: previewImage ? [previewImage] : [] }}
              width={ideaGridCardWidth}
              height={ideaCardPreviewHeight}
              thumbnail
            />
          ) : previewImage ? (
            <Image source={{ uri: previewImage }} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View style={styles.cardImageEmpty}>
              <Feather name={sourceUrl ? 'instagram' : 'bookmark'} size={22} color="#c7b8ad" />
              <Text style={styles.cardImageEmptyText}>
                {pendingEnrichment ? 'AI 正在補預覽' : sourceUrl ? '未能預覽原片' : '未有預覽'}
              </Text>
            </View>
          )}
          {pendingEnrichment ? (
            <View style={styles.enrichmentBadge}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.enrichmentBadgeText}>AI 補資料中</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cardBody}>
          {placeName ? (
            <View style={styles.cardPlaceRow}>
              <Text style={styles.cardPin}>📍</Text>
              <Text style={styles.cardPlaceText} numberOfLines={1}>{placeName}</Text>
            </View>
          ) : null}
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={2}>{cardTitle}</Text>
            <Feather name="chevron-right" size={18} color={colors.textMuted} />
          </View>
          <Text style={[styles.cardTopic, pendingEnrichment && styles.cardTopicPending]} numberOfLines={1}>{cardTopic}</Text>
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
    const playableVideo = playableVideoUrl(item.video_url);
    const sourceUrl = ideaSourceUrl(item);
    const pendingEnrichment = ideaHasPendingEnrichment(item);
    return (
      <Pressable key={item.id} onPress={() => openDetailModal(item)} style={({ pressed }) => [styles.mapIdeaCard, pressed && styles.pressed]}>
        {playableVideo ? (
          <ClipPlayer
            clip={{ id: item.id, video_url: playableVideo, media_urls: previewImage ? [previewImage] : [] }}
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
              {pendingEnrichment ? 'AI 補資料中' : sourceUrl ? '未能預覽' : '未有預覽'}
            </Text>
          </View>
        )}
        <Text style={styles.mapIdeaTitle} numberOfLines={2}>{pendingEnrichment ? 'AI 正在整理題材' : item.title || '未命名題材'}</Text>
        <Text style={styles.mapIdeaPlace} numberOfLines={1}>{pendingEnrichment ? '約需 10–30 秒' : item.place_name || item.shop_name || typeLabel(item.platform)}</Text>
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
        boardOptions={boardOptions}
        onChange={setDraft}
        onClose={() => setShowAddModal(false)}
        onSave={saveNewIdea}
      />

      <FormSheet
        visible={Boolean(editingIdea)}
        title="題材詳情"
        draft={draft}
        saving={saving}
        boardOptions={boardOptions}
        onChange={setDraft}
        onClose={() => setEditingIdea(null)}
        onSave={saveSelectedIdea}
      />

      <IdeaDetailSheet
        idea={selectedIdea}
        onClose={() => setSelectedIdea(null)}
        onEdit={openEditModal}
        onManageBoards={openBoardPicker}
        onDelete={deleteIdea}
        onTranslate={translateIdeaToTraditionalChinese}
        translatingIdeaId={translatingIdeaId}
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
        onDeleteBoard={deleteBoard}
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
    backgroundColor: '#F7F3EE'
  },
  sourceWebViewScreen: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  sourceWebViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff'
  },
  sourceWebViewHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sourceWebViewTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#111827',
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: '800'
  },
  sourceWebView: {
    flex: 1,
    backgroundColor: '#000000'
  },
  detailContent: {
    backgroundColor: '#F7F3EE'
  },
  detailHero: {
    width: '100%',
    backgroundColor: '#E8DED6'
  },
  detailHeroImage: {
    width: '100%',
    height: '100%'
  },
  detailHeroImageButton: {
    width: '100%',
    height: '100%'
  },
  detailSourcePlayBadge: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    minWidth: 154,
    height: 74,
    marginLeft: -77,
    marginTop: -37,
    borderRadius: 37,
    backgroundColor: 'rgba(0,0,0,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 4
  },
  detailSourcePlayText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: '700'
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
    backgroundColor: 'rgba(0,0,0,0.22)'
  },
  detailBody: {
    paddingHorizontal: 20,
    paddingTop: 18,
    backgroundColor: '#F7F3EE'
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
    borderWidth: 1,
    borderColor: '#E8DED6',
    backgroundColor: '#ffffff'
  },
  detailActionSpacer: {
    flex: 1
  },
  addToBoardButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18
  },
  addToBoardText: {
    color: '#ffffff',
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
    color: colors.primaryDeep,
    fontFamily: fonts.bodyBold,
    fontSize: 19,
    fontWeight: '800'
  },
  detailTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 31,
    marginBottom: 12
  },
  detailDescription: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 25
  },
  scriptGeneratorButton: {
    minHeight: 68,
    borderRadius: 18,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 20
  },
  scriptGeneratorIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)'
  },
  scriptGeneratorCopy: {
    flex: 1
  },
  scriptGeneratorText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: '800'
  },
  scriptGeneratorSubtext: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.72)',
    fontFamily: fonts.body,
    fontSize: 12
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
    backgroundColor: '#FFF8F3',
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  shopInfoCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8DED6',
    backgroundColor: '#ffffff',
    padding: 16,
    marginTop: 22,
    gap: 12
  },
  shopInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  shopInfoIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBF4EE'
  },
  shopInfoTitleWrap: {
    flex: 1
  },
  shopInfoEyebrow: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: '800'
  },
  shopInfoTitle: {
    marginTop: 2,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23
  },
  shopInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9
  },
  shopInfoText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21
  },
  shopInfoHighlight: {
    borderRadius: 14,
    backgroundColor: '#FBF4EE',
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  shopInfoHighlightLabel: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    fontWeight: '800'
  },
  shopInfoHighlightText: {
    marginTop: 4,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21
  },
  shopInfoMapButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8
  },
  shopInfoMapButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    fontWeight: '800'
  },
  detailMetaCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8DED6',
    backgroundColor: '#ffffff',
    padding: 16,
    marginTop: 24
  },
  detailMetaLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10
  },
  detailMetaText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21
  },
  sourceLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: '#E8DED6',
    marginTop: 14,
    paddingTop: 12
  },
  sourceLinkText: {
    flex: 1,
    color: colors.primary,
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 14
  },
  viewMapButtonText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: '800'
  },
  noMapCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8DED6',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    marginTop: 6
  },
  noMapText: {
    flex: 1,
    color: colors.textMuted,
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
  enrichmentBadge: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    minHeight: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: '#E8DED6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10
  },
  enrichmentBadgeText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    fontWeight: '800'
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
  cardTopicPending: {
    color: colors.primary,
    fontFamily: fonts.bodyMedium
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
  filterSheetContent: {
    paddingBottom: 8
  },
  filterSheetScroll: {
    maxHeight: screenHeight * 0.5
  },
  boardSheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 10
  },
  manageSheet: {
    maxHeight: '72%',
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
  manageRow: {
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  manageIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  manageCopy: {
    flex: 1
  },
  manageTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  manageSubtitle: {
    marginTop: 3,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17
  },
  manageDangerRow: {
    borderColor: '#fee2e2',
    backgroundColor: '#fff7f7'
  },
  manageDangerIcon: {
    backgroundColor: '#fff1f2'
  },
  manageDangerText: {
    color: colors.error
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
  textareaSmall: {
    minHeight: 82,
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
  boardManageRows: {
    gap: 8
  },
  boardManageRow: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 12,
    paddingRight: 8
  },
  boardManageCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  boardManageText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  boardDeleteButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff1f2'
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
