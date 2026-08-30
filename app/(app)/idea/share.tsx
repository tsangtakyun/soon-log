import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useShareIntentContext } from 'expo-share-intent';
import { Feather } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { mergeLocalIdeaBoards } from '@/lib/ideaBoards';
import { boardsFromShareMeta, extractSharedUrl, saveSharedIdea } from '@/lib/shareIdeas';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { importEggSharedPhotos, importEggSharedTopic } from '@/lib/eggApi';

type Status = 'idle' | 'ready' | 'saving' | 'saved' | 'error';

type SharedIdeaItem = {
  url: string;
  destination: 'topic-library' | 'reply-center';
  selectedBoard: string;
  sharedBoards: string[];
  previewImage: string;
  videoUrl: string;
  sharedText: string;
  media: Array<{ uri: string; mimeType: string }>;
};

function formatSaveError(err: unknown) {
  if (err instanceof Error) return err.message;

  if (err && typeof err === 'object') {
    const record = err as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter(Boolean)
      .map(String);

    if (parts.length > 0) return parts.join('\n');
  }

  return '請稍後再試';
}

function normalizeSharedPayloadText(value: string, sharedUrl: string) {
  const text = value.trim();
  if (!text || text === sharedUrl || /^https?:\/\/\S+$/i.test(text)) return '';
  return text;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stringFromMeta(meta: unknown, key: string) {
  if (!meta || typeof meta !== 'object') return '';
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function destinationFromMeta(meta: unknown): SharedIdeaItem['destination'] {
  return stringFromMeta(meta, 'soonDestination') === 'reply-center' ? 'reply-center' : 'topic-library';
}

function sharedWebUrlEntries(shareIntent: Record<string, any>) {
  const rawWebUrls = parseJson(shareIntent.meta?.soonWebUrls);
  if (Array.isArray(rawWebUrls)) {
    return rawWebUrls
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const url = typeof entry.url === 'string' ? entry.url.trim() : '';
        const meta = parseJson((entry as Record<string, unknown>).meta) ?? (entry as Record<string, unknown>).meta ?? {};
        return url ? { url, meta } : null;
      })
      .filter(Boolean) as { url: string; meta: Record<string, unknown> }[];
  }

  if (Array.isArray(shareIntent.weburls)) {
    return shareIntent.weburls
      .map((entry: Record<string, unknown>) => {
        const url = typeof entry?.url === 'string' ? entry.url.trim() : '';
        const meta = parseJson(entry?.meta) ?? {};
        return url ? { url, meta: meta as Record<string, unknown> } : null;
      })
      .filter(Boolean) as { url: string; meta: Record<string, unknown> }[];
  }

  return [];
}

function buildSharedItems(shareIntent: Record<string, any>): SharedIdeaItem[] {
  const files = Array.isArray(shareIntent.files) ? shareIntent.files : [];
  const firstFile = files[0] as Record<string, unknown> | undefined;
  const filePath = typeof firstFile?.path === 'string' ? firstFile.path.trim() : '';
  const fileMime = typeof firstFile?.mimeType === 'string' ? firstFile.mimeType : '';
  const fileName = typeof firstFile?.fileName === 'string' ? firstFile.fileName : '';
  const mediaDestination = fileName.startsWith('soon-destination-reply-center__') ? 'reply-center' : 'topic-library';
  const fileType = fileMime.startsWith('video/') ? 'video' : fileMime.startsWith('image/') ? 'image' : '';

  const fallbackMeta = shareIntent.meta ?? {};
  const localMediaPath = stringFromMeta(fallbackMeta, 'soonLocalMediaPath') || filePath;
  const localMediaType = stringFromMeta(fallbackMeta, 'soonLocalMediaType') || fileType;
  const localThumbnail = stringFromMeta(fallbackMeta, 'soonLocalThumbnail');
  const fallbackThumbnail = stringFromMeta(fallbackMeta, 'soonThumbnail') || localThumbnail || (localMediaType === 'image' ? localMediaPath : '');
  const fallbackVideoUrl = localMediaType === 'video' ? localMediaPath : '';
  const fallbackText = stringFromMeta(fallbackMeta, 'soonSharedText') || (typeof shareIntent.text === 'string' ? shareIntent.text.trim() : '');
  const fallbackBoard = stringFromMeta(fallbackMeta, 'soonBoard');
  const fallbackDestination = stringFromMeta(fallbackMeta, 'soonDestination') ? destinationFromMeta(fallbackMeta) : mediaDestination;
  const fallbackBoards = boardsFromShareMeta((fallbackMeta as Record<string, unknown>)?.soonBoards);

  const entries = sharedWebUrlEntries(shareIntent);
  const rawItems = entries.length > 0
    ? entries.map((entry) => {
      const meta = entry.meta ?? {};
      const previewImage = stringFromMeta(meta, 'soonThumbnail') || fallbackThumbnail;
      const mediaType = stringFromMeta(meta, 'soonLocalMediaType') || localMediaType;
      const mediaPath = stringFromMeta(meta, 'soonLocalMediaPath') || localMediaPath;
      const payloadText = stringFromMeta(meta, 'soonSharedText') || fallbackText;
      const selectedBoard = stringFromMeta(meta, 'soonBoard') || fallbackBoard;
      const destination = stringFromMeta(meta, 'soonDestination') ? destinationFromMeta(meta) : fallbackDestination;

      return {
        url: entry.url,
        destination,
        selectedBoard,
        sharedBoards: boardsFromShareMeta((meta as Record<string, unknown>)?.soonBoards).concat(fallbackBoards),
        previewImage,
        videoUrl: mediaType === 'video' ? mediaPath : fallbackVideoUrl,
        sharedText: normalizeSharedPayloadText(payloadText, entry.url),
        media: []
      };
    })
    : [{
      url: shareIntent.webUrl || extractSharedUrl(shareIntent.text) || localMediaPath,
      destination: fallbackDestination,
      selectedBoard: fallbackBoard,
      sharedBoards: fallbackBoards,
      previewImage: fallbackThumbnail,
      videoUrl: fallbackVideoUrl,
      sharedText: '',
      media: files.flatMap((file: Record<string, unknown>) => {
        const uri = typeof file.path === 'string' ? file.path.trim() : '';
        const mimeType = typeof file.mimeType === 'string' ? file.mimeType : 'image/jpeg';
        return uri && mimeType.startsWith('image/') ? [{ uri, mimeType }] : [];
      })
    }];

  const seen = new Set<string>();
  return rawItems
    .map((item) => ({
      ...item,
      url: item.url.trim(),
      sharedText: item.sharedText || normalizeSharedPayloadText(fallbackText, item.url)
    }))
    .filter((item) => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
}

export default function IdeaShareScreen() {
  const { shareIntent, hasShareIntent, resetShareIntent } = useShareIntentContext();
  const { user } = useAuth();
  const router = useRouter();
  const autoSaveStarted = useRef(false);
  const eggRotation = useRef(new Animated.Value(0)).current;
  const [status, setStatus] = useState<Status>('idle');
  const [sharedItems, setSharedItems] = useState<SharedIdeaItem[]>([]);
  const [url, setUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (status !== 'saving') {
      eggRotation.stopAnimation();
      eggRotation.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(eggRotation, {
        toValue: 1,
        duration: 1450,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    animation.start();
    return () => animation.stop();
  }, [eggRotation, status]);

  useEffect(() => {
    if (!hasShareIntent || !shareIntent || status !== 'idle') return;

    const items = buildSharedItems(shareIntent as Record<string, any>);
    const firstItem = items[0];
    if (!firstItem) {
      setStatus('error');
      setErrorMsg('無法讀取分享連結');
      return;
    }

    const boards = items.flatMap((item) => item.selectedBoard ? [...item.sharedBoards, item.selectedBoard] : item.sharedBoards);
    if (boards.length > 0) {
      mergeLocalIdeaBoards(boards).catch((error) => {
        console.warn('[share-idea] board sync failed', error);
      });
    }

    setSharedItems(items);
    setUrl(firstItem.url);
    setStatus('ready');
  }, [hasShareIntent, shareIntent, status]);

  async function saveIdea() {
    if (sharedItems.length === 0 || !user) return;

    setStatus('saving');
    try {
      const replyItem = sharedItems.find((item) => item.destination === 'reply-center');
      if (process.env.EXPO_PUBLIC_EGG_CREATOR_BUILD === 'true' && replyItem) {
        resetShareIntent();
        router.replace({
          pathname: '/creator/reply',
          params: {
            sharedUrl: replyItem.url,
            sharedText: replyItem.sharedText,
            sharedImage: replyItem.previewImage,
            sharedMime: replyItem.previewImage ? 'image/jpeg' : ''
          }
        });
        return;
      }

      for (const item of sharedItems) {
        if (process.env.EXPO_PUBLIC_EGG_CREATOR_BUILD === 'true') {
          if (item.media.length > 0) await importEggSharedPhotos(item.media, item.sharedText);
          else await importEggSharedTopic({ sourceUrl: item.url, context: item.sharedText, imageUrl: item.previewImage.startsWith('https://') ? item.previewImage : undefined });
        } else {
          await saveSharedIdea({
            user,
            url: item.url,
            selectedBoard: item.selectedBoard,
            sharedBoards: item.sharedBoards,
            previewImage: item.previewImage,
            videoUrl: item.videoUrl,
            sharedText: item.sharedText
          });
        }
      }

      setStatus('saved');
      resetShareIntent();
      setTimeout(() => router.replace(process.env.EXPO_PUBLIC_EGG_CREATOR_BUILD === 'true' ? '/creator/topics' : '/(app)/tools/idea-library'), 1200);
    } catch (err: unknown) {
      console.warn('[share-idea] save failed', err);
      const message = formatSaveError(err);
      Alert.alert('儲存失敗', message);
      setStatus('ready');
    }
  }

  useEffect(() => {
    if (status !== 'ready' || sharedItems.length === 0 || !user || autoSaveStarted.current) return;

    autoSaveStarted.current = true;
    saveIdea();
  }, [status, sharedItems, user]);

  function dismiss() {
    resetShareIntent();
    router.replace('/(app)/tools/idea-library');
  }

  const photoCount = sharedItems.reduce((count, item) => count + item.media.length, 0);
  const sourceLabel = photoCount > 0
    ? `已讀取 ${photoCount} 張圖片`
    : sharedItems.length > 1
      ? `已讀取 ${sharedItems.length} 條題材`
      : url.startsWith('file://')
        ? '已讀取分享內容'
        : url;
  const eggSpin = eggRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.brandLockup}>
          <Image source={require('../../../assets/soon-egg.png')} style={styles.brandLogo} />
          <Text style={styles.kicker}>SOON–EGG</Text>
        </View>
        <Pressable onPress={dismiss} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {url ? (
          <View style={styles.sourcePill}>
            <Feather name={photoCount > 0 ? 'image' : 'link-2'} size={15} color={colors.primary} />
            <Text numberOfLines={1} style={styles.sourcePillText}>{sourceLabel}</Text>
          </View>
        ) : null}

        {status === 'error' ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>讀取失敗</Text>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable onPress={dismiss} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>返回題材庫</Text>
            </Pressable>
          </View>
        ) : null}

        {status === 'saved' ? (
          <View style={styles.centerState}>
            <Text style={styles.savedIcon}>◈</Text>
            <Text style={styles.savedText}>{sharedItems[0]?.media.length > 1 ? `已將 ${sharedItems[0].media.length} 張圖片儲存成一個 carousel 題材` : sharedItems.length > 1 ? `已儲存 ${sharedItems.length} 條入題材靈感庫` : '已儲存入題材靈感庫'}</Text>
            <Text style={styles.savedSubtext}>AI 正在背景補充標題、封面、店舖同推薦資料，通常約 10–30 秒完成。</Text>
          </View>
        ) : null}

        {status === 'saving' ? (
          <View style={styles.loadingCard}>
            <View style={styles.loadingLogoHalo}>
              <Animated.Image
                source={require('../../../assets/soon-egg.png')}
                style={[styles.loadingLogo, { transform: [{ rotate: eggSpin }] }]}
              />
            </View>
            <Text style={styles.loadingTitle}>正在整理題材</Text>
            <Text style={styles.loadingDescription}>
              {photoCount > 1
                ? `正在上載 ${photoCount} 張圖片，並準備建立 carousel 題材…`
                : '正在安全上載內容，AI 會自動補充標題、封面及分類…'}
            </Text>
            <View style={styles.loadingTrack}>
              <View style={styles.loadingTrackFill} />
            </View>
            <Text style={styles.loadingHint}>請保持 EGG 開啟，通常只需數秒</Text>
          </View>
        ) : null}

        {status === 'ready' ? (
          <View style={styles.quickCard}>
            <View style={styles.quickIcon}>
              <Feather name="bookmark" size={24} color={colors.primary} />
            </View>
            <View style={styles.quickCopy}>
              <Text style={styles.quickTitle}>{sharedItems[0]?.destination === 'reply-center' ? '帶入回覆中心' : '儲存到題材靈感庫'}</Text>
              <Text style={styles.quickDescription}>
                {sharedItems[0]?.destination === 'reply-center'
                  ? '會保留連結或截圖，帶入 AI 回覆草稿；不會儲存到題材庫。'
                  : sharedItems[0]?.media.length > 1
                    ? `準備將 ${sharedItems[0].media.length} 張圖片儲存成一個 carousel；AI 會自動整理分類。`
                    : sharedItems.length > 1
                    ? `準備儲存 ${sharedItems.length} 條題材；AI 會自動整理分類。`
                    : 'AI 會自動補充標題、封面、地區及內容分類。'}
              </Text>
            </View>
            <Pressable onPress={saveIdea} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
              <View style={styles.saveButtonContent}>
                <Feather name={sharedItems[0]?.destination === 'reply-center' ? 'message-circle' : 'bookmark'} size={18} color={colors.textOnDark} />
                <Text style={styles.saveButtonText}>{sharedItems[0]?.destination === 'reply-center' ? '開啟回覆中心' : '儲存入題材靈感庫'}</Text>
              </View>
            </Pressable>

            <Pressable onPress={dismiss} style={styles.dismissLink}>
              <Text style={styles.dismissText}>唔儲存</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 58,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11
  },
  brandLogo: {
    width: 48,
    height: 48
  },
  kicker: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    letterSpacing: 0.3
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMuted
  },
  closeText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  content: {
    padding: 18,
    paddingBottom: 44,
    gap: 16
  },
  sourcePill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  sourcePillText: {
    flexShrink: 1,
    color: colors.primary,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  centerState: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12
  },
  centerText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16
  },
  errorTitle: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  errorText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center'
  },
  savedIcon: {
    color: colors.gold,
    fontSize: 48
  },
  savedText: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 28
  },
  savedSubtext: {
    maxWidth: 260,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  quickCard: {
    borderRadius: 24,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    gap: 16
  },
  loadingCard: {
    minHeight: 420,
    borderRadius: 30,
    paddingHorizontal: 26,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: '#EAD8CC',
    gap: 12
  },
  loadingLogoHalo: {
    width: 124,
    height: 124,
    borderRadius: 62,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    marginBottom: 8
  },
  loadingLogo: {
    width: 94,
    height: 94
  },
  loadingTitle: {
    color: colors.primaryDeep,
    fontFamily: fonts.heading,
    fontSize: 30,
    textAlign: 'center'
  },
  loadingDescription: {
    maxWidth: 300,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center'
  },
  loadingTrack: {
    width: '82%',
    height: 6,
    marginTop: 12,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#E7D3C7'
  },
  loadingTrackFill: {
    width: '72%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary
  },
  loadingHint: {
    color: '#8A6B63',
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    textAlign: 'center'
  },
  quickIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickCopy: {
    gap: 6
  },
  quickTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 24
  },
  quickDescription: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22
  },
  boardPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  boardPillText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  card: {
    borderRadius: 18,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    gap: 16
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  potentialBadge: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  platformBadge: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: colors.purple,
    backgroundColor: '#F0EAFE',
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  ideaTitle: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 28,
    lineHeight: 34
  },
  hookBox: {
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
    backgroundColor: '#FFF9ED',
    borderRadius: 12,
    padding: 14,
    gap: 6
  },
  hookLabel: {
    color: colors.gold,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  hookText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 23
  },
  description: {
    color: '#3A3A3A',
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23
  },
  editSection: {
    gap: 6
  },
  editLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  editInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text
  },
  editInputMultiline: {
    height: 80,
    textAlignVertical: 'top'
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  region: {
    color: colors.text,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  tag: {
    color: colors.textMuted,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  primaryButton: {
    marginTop: 10,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold
  },
  primaryButtonText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  saveButton: {
    height: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
  },
  saveButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  saveButtonText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  dismissLink: {
    alignItems: 'center',
    paddingVertical: 6
  },
  dismissText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  pressed: {
    opacity: 0.72
  }
});
