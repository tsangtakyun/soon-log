import { decode } from 'base64-arraybuffer';
import { useEventListener } from 'expo';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Image,
  Modal,
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
type TopicRoom = {
  id: string;
  name: string;
  topic: string | null;
};

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
  const params = useLocalSearchParams<{ uri: string; mediaType?: string; timeStr: string; dateStr: string; room_id?: string }>();
  const uri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const mediaType = Array.isArray(params.mediaType) ? params.mediaType[0] : params.mediaType;
  const isImage = mediaType === 'image';
  const timeStr = Array.isArray(params.timeStr) ? params.timeStr[0] : params.timeStr;
  const dateStr = Array.isArray(params.dateStr) ? params.dateStr[0] : params.dateStr;
  const [caption, setCaption] = useState('');
  const [captionAlign, setCaptionAlign] = useState<CaptionAlign>('center');
  const [overlayVertical, setOverlayVertical] = useState<OverlayVertical>('middle');
  const [textSize, setTextSize] = useState<TextSize>('medium');
  const [uploading, setUploading] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [showOverlayTools, setShowOverlayTools] = useState(false);
  const [showTime, setShowTime] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [rooms, setRooms] = useState<TopicRoom[]>([]);
  const [captionEditing, setCaptionEditing] = useState(false);
  const captionInputRef = useRef<TextInput>(null);
  const lastPreviewTapRef = useRef(0);
  const fileUri = useMemo(() => uri ? fixedFileUri(uri) : '', [uri]);
  const player = useVideoPlayer(!isImage && fileUri ? fileUri : null, (videoPlayer) => {
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
    async function fetchRooms() {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from('topic_room_members')
        .select('topic_rooms(id, name, topic)')
        .eq('user_id', user.id);

      if (error) return;

      const nextRooms = (data ?? []).flatMap((row) => {
        const room = (row as { topic_rooms?: TopicRoom | TopicRoom[] | null }).topic_rooms;
        if (!room) return [];
        return Array.isArray(room) ? room : [room];
      });
      const uniqueRooms = Array.from(new Map(nextRooms.map((room) => [room.id, room])).values());
      setRooms(uniqueRooms);

    }

    fetchRooms();
  }, [user?.id]);

  useEffect(() => {
    if (!fileUri || isImage) return;
    player.loop = true;
    player.muted = true;
    player.currentTime = 0;
    const playTimeout = setTimeout(() => player.play(), 120);
    return () => clearTimeout(playTimeout);
  }, [fileUri, isImage, player]);

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
    if (!isImage) player.play();
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

  async function uploadAndPublish(targetRoomId: string) {
    if (!user?.id || !fileUri || uploading) return;
    setUploading(true);

    try {
      const extension = isImage ? 'jpg' : 'mp4';
      const contentType = isImage ? 'image/jpeg' : 'video/mp4';
      const filename = `topic-clips/${targetRoomId}/${user.id}_${Date.now()}.${extension}`;
      const fileContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64
      });

      const { error: uploadError } = await supabase.storage
        .from('log-media')
        .upload(filename, decode(fileContent), {
          contentType,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('log-media').getPublicUrl(filename);
      const { error: insertError } = await supabase
        .from('topic_clips')
        .insert({
          room_id: targetRoomId,
          user_id: user.id,
          caption: caption.trim() || null,
          video_url: isImage ? null : publicUrl,
          media_urls: isImage ? [publicUrl] : [],
          time_str: showTime ? timeStr : null,
          date_str: showDate ? dateStr : null,
          caption_align: captionAlign,
          overlay_vertical: overlayVertical,
          text_size: textSize,
          background_color: 'black'
        });

      if (insertError) throw insertError;

      Alert.alert('上載成功', '已分享到 Topic Room');
      router.replace(`/(app)/log/room/${targetRoomId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '上載失敗';
      Alert.alert('上載失敗', message);
    } finally {
      setUploading(false);
    }
  }

  function handleUploadPress() {
    setShowRoomPicker(true);
  }

  if (!fileUri) {
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
          {isImage ? (
            <Image source={{ uri: fileUri }} style={styles.video} resizeMode="cover" />
          ) : (
            <VideoView
              player={player}
              style={styles.video}
              contentFit="cover"
              nativeControls={false}
              allowsVideoFrameAnalysis={false}
              onFirstFrameRender={() => player.play()}
            />
          )}
          <View pointerEvents="box-none" style={[styles.timeOverlay, overlayVerticalStyle, overlayAlignStyle]}>
            {showTime ? (
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
            ) : null}
            {showDate ? (
              <Text
                style={[
                  styles.dateText,
                  {
                    fontSize: overlayTextSize.date,
                    lineHeight: Math.round(overlayTextSize.date * 1.2)
                  },
                  !showTime && styles.dateWithoutTime
                ]}
              >
                {dateStr}
              </Text>
            ) : null}
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
          <Pressable
            accessibilityLabel="Overlay controls"
            onPress={() => setShowOverlayTools((visible) => !visible)}
            style={({ pressed }) => [styles.overlayToolButton, pressed && styles.pressed]}
          >
            <Feather name="layers" size={18} color="#fff" />
          </Pressable>
          {showOverlayTools ? (
            <View style={styles.overlayToolPanel}>
              <Pressable
                accessibilityLabel={showTime ? 'Hide time' : 'Show time'}
                onPress={() => setShowTime((visible) => !visible)}
                style={[styles.overlayToggle, showTime && styles.overlayToggleActive]}
              >
                <Feather name="clock" size={16} color={showTime ? '#000' : '#fff'} />
              </Pressable>
              <Pressable
                accessibilityLabel={showDate ? 'Hide date' : 'Show date'}
                onPress={() => setShowDate((visible) => !visible)}
                style={[styles.overlayToggle, showDate && styles.overlayToggleActive]}
              >
                <Feather name="calendar" size={16} color={showDate ? '#000' : '#fff'} />
              </Pressable>
            </View>
          ) : null}
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
            iconMap={{ left: 'align-left', center: 'align-center', right: 'align-right' }}
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
            iconMap={{ top: 'arrow-up', middle: 'minus', bottom: 'arrow-down' }}
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
            iconMap={{ small: 'type', medium: 'type', large: 'type' }}
          />

          <View style={styles.actions}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
              <Feather name="x" size={22} color="#fff" />
              <Text style={styles.actionText}>放棄</Text>
            </Pressable>
            <Pressable onPress={saveToLibrary} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
              <Feather name="save" size={21} color="#fff" />
              <Text style={styles.actionText}>儲存</Text>
            </Pressable>
            <Pressable onPress={handleUploadPress} disabled={uploading} style={({ pressed }) => [styles.uploadButton, (pressed || uploading) && styles.pressed]}>
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="upload-cloud" size={22} color="#fff" />
                  <Text style={styles.uploadText}>選擇房間上載</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showRoomPicker} transparent animationType="slide" onRequestClose={() => setShowRoomPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 28 }]}>
            <Text style={styles.pickerTitle}>選擇 Topic Room</Text>

            {rooms.map((room) => (
              <Pressable
                key={room.id}
                style={styles.roomRow}
                onPress={() => {
                  setShowRoomPicker(false);
                  uploadAndPublish(room.id);
                }}
              >
                <View>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <Text style={styles.roomTopic}>{room.topic || 'Topic Room'}</Text>
                </View>
                <Feather name="upload-cloud" size={18} color={colors.primary} />
              </Pressable>
            ))}

            {rooms.length === 0 ? (
              <View style={styles.noRooms}>
                <Text style={styles.noRoomsText}>未有 Topic Room</Text>
                <Pressable
                  onPress={() => {
                    setShowRoomPicker(false);
                    router.push('/(app)/log/create-room');
                  }}
                >
                  <Text style={styles.createRoomLink}>+ 建立 Topic Room</Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable style={styles.cancelBtn} onPress={() => setShowRoomPicker(false)}>
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
  onSelect,
  iconMap
}: {
  label: string;
  options: Array<[string, string]>;
  active: string;
  onSelect: (value: string) => void;
  iconMap?: Record<string, keyof typeof Feather.glyphMap>;
}) {
  return (
    <View style={styles.optionRow}>
      <Text style={styles.optionLabel}>{label}</Text>
      <View style={styles.optionButtons}>
        {options.map(([value]) => {
          const isActive = active === value;
          return (
            <Pressable key={value} onPress={() => onSelect(value)} style={[styles.optionPill, isActive && styles.optionPillActive]}>
              {iconMap?.[value] ? (
                <Feather
                  name={iconMap[value]}
                  size={value === 'large' ? 19 : value === 'small' ? 15 : 17}
                  color={isActive ? '#000' : '#fff'}
                />
              ) : null}
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
  dateWithoutTime: {
    marginTop: 0
  },
  overlayToolButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)'
  },
  overlayToolPanel: {
    position: 'absolute',
    top: 58,
    right: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    padding: 5,
    gap: 6
  },
  overlayToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)'
  },
  overlayToggleActive: {
    backgroundColor: '#fff'
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  optionPillActive: {
    borderColor: '#fff',
    backgroundColor: '#fff'
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
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.bgBody,
    padding: 20
  },
  pickerTitle: {
    marginBottom: 16,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    fontWeight: '700'
  },
  roomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 14
  },
  roomName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: '600'
  },
  roomTopic: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  noRooms: {
    alignItems: 'center',
    paddingVertical: 24
  },
  noRoomsText: {
    color: '#888',
    fontFamily: fonts.body,
    fontSize: 15
  },
  createRoomLink: {
    marginTop: 8,
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    fontWeight: '600'
  },
  cancelBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12
  },
  cancelText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15
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
