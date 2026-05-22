import { decode } from 'base64-arraybuffer';
import { useEventListener } from 'expo';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type CaptionAlign = 'left' | 'center' | 'right';
type TextSize = 'small' | 'medium' | 'large';
type OverlayVertical = 'top' | 'middle' | 'bottom';

const TEXT_SIZES: Record<TextSize, number> = {
  small: 14,
  medium: 18,
  large: 24
};

const OVERLAY_TEXT_SIZES: Record<TextSize, { time: number; date: number }> = {
  small: { time: 40, date: 17 },
  medium: { time: 48, date: 20 },
  large: { time: 58, date: 24 }
};

function fixedFileUri(uri: string) {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

export default function TopicClipPreviewScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ uri: string; timeStr: string; dateStr: string; room_id: string }>();
  const uri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const timeStr = Array.isArray(params.timeStr) ? params.timeStr[0] : params.timeStr;
  const dateStr = Array.isArray(params.dateStr) ? params.dateStr[0] : params.dateStr;
  const roomId = Array.isArray(params.room_id) ? params.room_id[0] : params.room_id;
  const [caption, setCaption] = useState('');
  const [captionAlign, setCaptionAlign] = useState<CaptionAlign>('center');
  const [overlayVertical, setOverlayVertical] = useState<OverlayVertical>('middle');
  const [textSize, setTextSize] = useState<TextSize>('medium');
  const [uploading, setUploading] = useState(false);
  const [captionEditing, setCaptionEditing] = useState(false);
  const captionInputRef = useRef<TextInput>(null);
  const lastPreviewTapRef = useRef(0);
  const fileUri = useMemo(() => uri ? fixedFileUri(uri) : '', [uri]);
  const player = useVideoPlayer(fileUri || null, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });
  const captionFontSize = TEXT_SIZES[textSize];
  const captionLineHeight = Math.round(captionFontSize * 1.3);
  const overlayTextSize = OVERLAY_TEXT_SIZES[textSize];
  const overlayAlignStyle = {
    alignItems: captionAlign === 'left' ? 'flex-start' : captionAlign === 'right' ? 'flex-end' : 'center'
  } as const;
  const overlayVerticalStyle = {
    top: overlayVertical === 'top' ? '20%' : overlayVertical === 'bottom' ? '68%' : '43%'
  } as const;
  const captionPositionStyle = {
    textAlign: captionAlign,
    width: 220,
    fontSize: captionFontSize,
    lineHeight: captionLineHeight
  } as const;

  useEffect(() => {
    if (!fileUri) return;
    player.loop = true;
    player.muted = true;
    player.currentTime = 0;
    const playTimeout = setTimeout(() => player.play(), 120);
    return () => clearTimeout(playTimeout);
  }, [fileUri, player]);

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') {
      player.play();
    }
  });

  useEventListener(player, 'playToEnd', () => {
    player.replay();
  });

  function beginCaptionEdit() {
    setCaptionEditing(true);
    requestAnimationFrame(() => captionInputRef.current?.focus());
  }

  function handlePreviewPress() {
    player.play();
    const now = Date.now();
    if (now - lastPreviewTapRef.current < 320) {
      beginCaptionEdit();
      lastPreviewTapRef.current = 0;
      return;
    }

    lastPreviewTapRef.current = now;
  }

  async function saveToLibrary() {
    if (!fileUri) return;
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要相簿權限', '請允許 SOON-LOG 儲存影片到相簿。');
      return;
    }

    try {
      await MediaLibrary.saveToLibraryAsync(fileUri);
      Alert.alert('已儲存', '影片已儲存到相簿。');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '儲存失敗';
      Alert.alert('儲存失敗', message);
    }
  }

  async function uploadAndPublish() {
    if (!user?.id || !roomId || !fileUri || uploading) return;
    setUploading(true);

    try {
      const filename = `topic-clips/${roomId}/${user.id}_${Date.now()}.mp4`;
      const fileContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64
      });

      const { error: uploadError } = await supabase.storage
        .from('log-media')
        .upload(filename, decode(fileContent), {
          contentType: 'video/mp4',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('log-media').getPublicUrl(filename);
      const { error: insertError } = await supabase
        .from('topic_clips')
        .insert({
          room_id: roomId,
          user_id: user.id,
          caption: caption.trim() || null,
          video_url: publicUrl,
          time_str: timeStr,
          date_str: dateStr,
          caption_align: captionAlign,
          text_size: textSize,
          background_color: 'black'
        });

      if (insertError) throw insertError;

      Alert.alert('上載成功', '已分享到 Topic Room');
      router.replace(`/(app)/log/room/${roomId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '上載失敗';
      Alert.alert('上載失敗', message);
    } finally {
      setUploading(false);
    }
  }

  if (!fileUri || !roomId) {
    return (
      <View style={styles.emptyScreen}>
        <Text style={styles.emptyText}>找不到影片</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>返回</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 18 }]}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar hidden />
        <Pressable onPress={handlePreviewPress} style={styles.previewWrap}>
          <VideoView
            player={player}
            style={styles.video}
            contentFit="cover"
            nativeControls={false}
            allowsVideoFrameAnalysis={false}
            onFirstFrameRender={() => player.play()}
          />
          <View pointerEvents="box-none" style={[styles.timeOverlay, overlayVerticalStyle, overlayAlignStyle]}>
            <Text
              style={[
                styles.timeText,
                {
                  fontSize: overlayTextSize.time,
                  lineHeight: Math.round(overlayTextSize.time * 1.08)
                }
              ]}
            >
              {timeStr}
            </Text>
            <Text
              style={[
                styles.dateText,
                {
                  fontSize: overlayTextSize.date,
                  lineHeight: Math.round(overlayTextSize.date * 1.2)
                }
              ]}
            >
              {dateStr}
            </Text>
            {captionEditing ? (
              <TextInput
                ref={captionInputRef}
                value={caption}
                onChangeText={setCaption}
                placeholder="輸入字幕..."
                placeholderTextColor="rgba(255,255,255,0.68)"
                maxLength={100}
                multiline
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => {
                  setCaptionEditing(false);
                  Keyboard.dismiss();
                }}
                onBlur={() => setCaptionEditing(false)}
                style={[
                  styles.captionInlineInput,
                  captionPositionStyle
                ]}
              />
            ) : caption.trim() ? (
              <Text
                style={[
                  styles.captionOverlay,
                  captionPositionStyle
                ]}
              >
                {caption}
              </Text>
            ) : (
              <Text pointerEvents="none" style={styles.captionHint}>雙擊加入字幕</Text>
            )}
          </View>
        </Pressable>

        <View style={styles.panel}>
          <OptionRow
            label="字幕"
            options={[
              ['left', '左'],
              ['center', '中'],
              ['right', '右']
            ]}
            active={captionAlign}
            onSelect={(value) => setCaptionAlign(value as CaptionAlign)}
          />
          <OptionRow
            label="位置"
            options={[
              ['top', '上'],
              ['middle', '中'],
              ['bottom', '下']
            ]}
            active={overlayVertical}
            onSelect={(value) => setOverlayVertical(value as OverlayVertical)}
          />
          <OptionRow
            label="大小"
            options={[
              ['small', '小'],
              ['medium', '中'],
              ['large', '大']
            ]}
            active={textSize}
            onSelect={(value) => setTextSize(value as TextSize)}
          />

          <View style={styles.actions}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
              <Text style={styles.actionIcon}>✕</Text>
              <Text style={styles.actionText}>放棄</Text>
            </Pressable>
            <Pressable onPress={saveToLibrary} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
              <Text style={styles.actionIcon}>💾</Text>
              <Text style={styles.actionText}>儲存</Text>
            </Pressable>
            <Pressable onPress={uploadAndPublish} disabled={uploading} style={({ pressed }) => [styles.uploadButton, (pressed || uploading) && styles.pressed]}>
              <Text style={styles.uploadIcon}>📤</Text>
              <Text style={styles.uploadText}>{uploading ? '上載中' : '上載'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {uploading ? (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.uploadingText}>上載中...</Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function OptionRow({
  label,
  options,
  active,
  onSelect
}: {
  label: string;
  options: Array<[string, string]>;
  active: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.optionRow}>
      <Text style={styles.optionLabel}>{label}</Text>
      <View style={styles.optionButtons}>
        {options.map(([value, title]) => {
          const isActive = active === value;
          return (
            <Pressable key={value} onPress={() => onSelect(value)} style={[styles.optionPill, isActive && styles.optionPillActive]}>
              <Text style={[styles.optionPillText, isActive && styles.optionPillTextActive]}>{title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000'
  },
  scroll: {
    flex: 1
  },
  content: {
    paddingTop: 18
  },
  previewWrap: {
    alignSelf: 'center',
    width: '85%',
    aspectRatio: 9 / 16,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000'
  },
  video: {
    width: '100%',
    height: '100%'
  },
  timeOverlay: {
    position: 'absolute',
    left: '50%',
    width: 300,
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    transform: [{ translateX: -150 }, { translateY: -66 }]
  },
  timeText: {
    color: '#fff',
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5
  },
  dateText: {
    marginTop: 4,
    color: '#fff',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4
  },
  captionOverlay: {
    marginTop: 12,
    color: '#fff',
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5
  },
  captionInlineInput: {
    minHeight: 40,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.38)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontFamily: fonts.bodyBold,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5
  },
  captionHint: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.72)',
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5
  },
  panel: {
    marginTop: 18,
    paddingHorizontal: 16,
    gap: 14
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  optionLabel: {
    width: 48,
    color: '#fff',
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  optionButtons: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8
  },
  optionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  optionPillActive: {
    borderColor: '#fff',
    backgroundColor: '#fff'
  },
  optionPillText: {
    color: '#fff',
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  optionPillTextActive: {
    color: '#000'
  },
  actions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10
  },
  actionButton: {
    flex: 1,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)'
  },
  uploadButton: {
    flex: 1,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
  },
  actionIcon: {
    fontSize: 20
  },
  uploadIcon: {
    fontSize: 20
  },
  actionText: {
    marginTop: 3,
    color: '#fff',
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  uploadText: {
    marginTop: 3,
    color: '#fff',
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  pressed: {
    opacity: 0.72
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.56)',
    gap: 10
  },
  uploadingText: {
    color: '#fff',
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  emptyScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: 24
  },
  emptyText: {
    color: '#fff',
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  backButton: {
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  backButtonText: {
    color: '#000',
    fontFamily: fonts.bodyBold,
    fontSize: 14
  }
});
