import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useShareIntentContext } from 'expo-share-intent';
import { Feather } from '@expo/vector-icons';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { mergeLocalIdeaBoards } from '@/lib/ideaBoards';
import { boardsFromShareMeta, extractSharedUrl, saveSharedIdea } from '@/lib/shareIdeas';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type Status = 'idle' | 'ready' | 'saving' | 'saved' | 'error';

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

export default function IdeaShareScreen() {
  const { shareIntent, hasShareIntent, resetShareIntent } = useShareIntentContext();
  const { user } = useAuth();
  const router = useRouter();
  const autoSaveStarted = useRef(false);
  const [status, setStatus] = useState<Status>('idle');
  const [url, setUrl] = useState('');
  const [selectedBoard, setSelectedBoard] = useState('');
  const [previewImage, setPreviewImage] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [sharedText, setSharedText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!hasShareIntent || !shareIntent || status !== 'idle') return;

    const meta = shareIntent.meta;
    const metaString = (key: string) => {
      const value = meta?.[key];
      return typeof value === 'string' ? value.trim() : '';
    };
    const files = Array.isArray((shareIntent as any).files) ? (shareIntent as any).files : [];
    const firstFile = files[0] as Record<string, unknown> | undefined;
    const filePath = typeof firstFile?.path === 'string' ? firstFile.path.trim() : '';
    const fileMime = typeof firstFile?.mimeType === 'string' ? firstFile.mimeType : '';
    const fileType = fileMime.startsWith('video/') ? 'video' : fileMime.startsWith('image/') ? 'image' : '';
    const localMediaPath = metaString('soonLocalMediaPath') || filePath;
    const localMediaType = metaString('soonLocalMediaType') || fileType;
    const localThumbnail = metaString('soonLocalThumbnail');
    const thumbnail = metaString('soonThumbnail') || localThumbnail || (localMediaType === 'image' ? localMediaPath : '');
    const sharedVideoUrl = localMediaType === 'video' ? localMediaPath : '';
    const sharedUrl = shareIntent.webUrl || extractSharedUrl(shareIntent.text) || localMediaPath;
    if (!sharedUrl) {
      setStatus('error');
      setErrorMsg('無法讀取分享連結');
      return;
    }
    const payloadText = metaString('soonSharedText') || (typeof shareIntent.text === 'string' ? shareIntent.text.trim() : '');
    const sharedCaption = normalizeSharedPayloadText(payloadText, sharedUrl);

    const board = metaString('soonBoard');
    const boards = boardsFromShareMeta(shareIntent.meta?.soonBoards);
    if (board) boards.push(board);
    if (boards.length > 0) {
      mergeLocalIdeaBoards(boards).catch((error) => {
        console.warn('[share-idea] board sync failed', error);
      });
    }

    setSelectedBoard(board);
    setPreviewImage(thumbnail);
    setVideoUrl(sharedVideoUrl);
    setSharedText(sharedCaption);
    setUrl(sharedUrl);
    setStatus('ready');
  }, [hasShareIntent, shareIntent, status]);

  async function saveIdea() {
    if (!url || !user) return;

    setStatus('saving');
    try {
      const sharedBoards = boardsFromShareMeta(shareIntent?.meta?.soonBoards);
      await saveSharedIdea({
        user,
        url,
        selectedBoard,
        sharedBoards,
        previewImage,
        videoUrl,
        sharedText
      });

      setStatus('saved');
      resetShareIntent();
      setTimeout(() => router.replace('/(app)/tools/idea-library'), 1200);
    } catch (err: unknown) {
      console.warn('[share-idea] save failed', err);
      const message = formatSaveError(err);
      Alert.alert('儲存失敗', message);
      setStatus('ready');
    }
  }

  useEffect(() => {
    if (status !== 'ready' || !url || !user || autoSaveStarted.current) return;

    autoSaveStarted.current = true;
    saveIdea();
  }, [status, url, user, previewImage, videoUrl, sharedText]);

  function dismiss() {
    resetShareIntent();
    router.replace('/feed');
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>SHARE TO SOON</Text>
          <Text style={styles.title}>Save Idea</Text>
        </View>
        <Pressable onPress={dismiss} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {url ? <Text numberOfLines={2} style={styles.urlPill}>{url}</Text> : null}

        {status === 'error' ? (
          <View style={styles.centerState}>
            <Text style={styles.errorTitle}>讀取失敗</Text>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable onPress={dismiss} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>返回動態</Text>
            </Pressable>
          </View>
        ) : null}

        {status === 'saved' ? (
          <View style={styles.centerState}>
            <Text style={styles.savedIcon}>◈</Text>
            <Text style={styles.savedText}>已儲存入題材庫</Text>
            <Text style={styles.savedSubtext}>AI 會喺背景補充標題、Hook 同標籤。</Text>
          </View>
        ) : null}

        {status === 'ready' || status === 'saving' ? (
          <View style={styles.quickCard}>
            <View style={styles.quickIcon}>
              <Feather name="bookmark" size={24} color={colors.primary} />
            </View>
            <View style={styles.quickCopy}>
              <Text style={styles.quickTitle}>Save to 題材庫</Text>
              <Text style={styles.quickDescription}>先儲存連結，AI 之後自動補充標題、Hook 同標籤。</Text>
              {selectedBoard ? (
                <View style={styles.boardPill}>
                  <Feather name="folder" size={13} color={colors.primary} />
                  <Text style={styles.boardPillText}>{selectedBoard}</Text>
                </View>
              ) : null}
            </View>
            <Pressable disabled={status === 'saving'} onPress={saveIdea} style={({ pressed }) => [styles.saveButton, (pressed || status === 'saving') && styles.pressed]}>
              {status === 'saving' ? (
                <ActivityIndicator color={colors.textOnDark} />
              ) : (
                <View style={styles.saveButtonContent}>
                  <Feather name="bookmark" size={18} color={colors.textOnDark} />
                  <Text style={styles.saveButtonText}>儲存入題材庫</Text>
                </View>
              )}
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
  kicker: {
    color: colors.gold,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  title: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 38,
    lineHeight: 42
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
  urlPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    color: colors.textMuted,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
