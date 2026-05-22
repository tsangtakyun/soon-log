import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
type BackgroundMode = 'cream' | 'black';

const TEXT_SIZES: Record<TextSize, number> = {
  small: 14,
  medium: 18,
  large: 24
};

const BACKGROUNDS: Record<BackgroundMode, string> = {
  cream: '#F5F0EB',
  black: '#000000'
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
  const [textSize, setTextSize] = useState<TextSize>('medium');
  const [bgColor, setBgColor] = useState<BackgroundMode>('black');
  const [uploading, setUploading] = useState(false);
  const fileUri = useMemo(() => uri ? fixedFileUri(uri) : '', [uri]);
  const player = useVideoPlayer(fileUri || null, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.play();
  });
  const captionFontSize = TEXT_SIZES[textSize];

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
      const filename = `topic_clips/${roomId}/${user.id}_${Date.now()}.mp4`;
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
          background_color: bgColor
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screen, { backgroundColor: BACKGROUNDS[bgColor] }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 18 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.previewWrap, { backgroundColor: BACKGROUNDS[bgColor] }]}>
          <VideoView
            player={player}
            style={styles.video}
            contentFit="contain"
            nativeControls={false}
          />
          <View pointerEvents="none" style={styles.timeOverlay}>
            <Text style={styles.timeText}>{timeStr}</Text>
            <Text style={styles.dateText}>{dateStr}</Text>
          </View>
          {caption.trim() ? (
            <Text
              pointerEvents="none"
              style={[
                styles.captionOverlay,
                {
                  textAlign: captionAlign,
                  fontSize: captionFontSize,
                  left: captionAlign === 'left' ? 24 : 42,
                  right: captionAlign === 'right' ? 24 : 42
                }
              ]}
            >
              {caption}
            </Text>
          ) : null}
        </View>

        <View style={styles.panel}>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="加入字幕..."
            placeholderTextColor="rgba(255,255,255,0.55)"
            maxLength={100}
            multiline
            style={styles.captionInput}
          />

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
            label="大小"
            options={[
              ['small', '小'],
              ['medium', '中'],
              ['large', '大']
            ]}
            active={textSize}
            onSelect={(value) => setTextSize(value as TextSize)}
          />
          <OptionRow
            label="背景"
            options={[
              ['cream', '🤍 淺色'],
              ['black', '🖤 深色']
            ]}
            active={bgColor}
            onSelect={(value) => setBgColor(value as BackgroundMode)}
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
    flex: 1
  },
  scroll: {
    flex: 1
  },
  content: {
    paddingTop: 54
  },
  previewWrap: {
    alignSelf: 'center',
    width: '92%',
    aspectRatio: 9 / 16,
    borderRadius: 24,
    overflow: 'hidden'
  },
  video: {
    width: '100%',
    height: '100%'
  },
  timeOverlay: {
    position: 'absolute',
    top: 142,
    left: -34,
    transform: [{ rotate: '-90deg' }]
  },
  timeText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5
  },
  dateText: {
    marginTop: 4,
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4
  },
  captionOverlay: {
    position: 'absolute',
    bottom: 72,
    color: '#fff',
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5
  },
  panel: {
    marginTop: 18,
    paddingHorizontal: 16,
    gap: 14
  },
  captionInput: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontFamily: fonts.bodyMedium,
    fontSize: 16
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
