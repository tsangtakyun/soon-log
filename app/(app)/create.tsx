import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Field, Screen, Title } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

function detectPlatform(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('tiktok.com')) return 'tiktok';
  return null;
}

function cleanImageExtension(uri: string) {
  const ext = uri.split('.').pop()?.toLowerCase()?.split('?')[0] || 'jpg';
  return ext === 'jpeg' ? 'jpg' : ext;
}

function imageContentType(ext: string) {
  return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
}

async function uploadImages(logId: string, selectedImages: string[]): Promise<string[]> {
  const urls: string[] = [];

  for (const uri of selectedImages) {
    const ext = cleanImageExtension(uri);
    const fileName = `logs/${logId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from('log-media')
      .upload(fileName, blob, {
        contentType: blob.type || imageContentType(ext)
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('log-media')
      .getPublicUrl(fileName);

    urls.push(publicUrl);
  }

  return urls;
}

export default function CreateLogScreen() {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [productionNotes, setProductionNotes] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [tags, setTags] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要相片權限', '請允許 SOON-LOG 存取相片。');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 4 - selectedImages.length),
      quality: 0.8
    });

    if (!result.canceled) {
      setSelectedImages((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, 4));
    }
  };

  const removeImage = (uri: string) => {
    setSelectedImages((current) => current.filter((item) => item !== uri));
  };

  const submit = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) return;

      const authUser = userData.user;
      const fallbackUsername = authUser.email?.split('@')[0] ?? authUser.id.slice(0, 8);
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: authUser.id,
        username: authUser.user_metadata?.preferred_username ?? fallbackUsername,
        display_name: authUser.user_metadata?.full_name ?? fallbackUsername,
        avatar_url: authUser.user_metadata?.avatar_url ?? null,
        region: 'HK'
      }, { onConflict: 'id', ignoreDuplicates: true });

      if (profileError) throw profileError;

      const logId = Crypto.randomUUID();
      const mediaUrls = selectedImages.length > 0
        ? await uploadImages(logId, selectedImages)
        : [];
      const normalizedTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);

      const { data: createdLog, error } = await supabase.from('logs').insert({
        id: logId,
        user_id: authUser.id,
        title: title.trim() || null,
        body: body.trim(),
        production_notes: productionNotes.trim() || null,
        media_urls: mediaUrls,
        video_url: videoUrl.trim() || null,
        platform: videoUrl.trim() ? detectPlatform(videoUrl.trim()) : null,
        tags: normalizedTags,
        is_published: isPublished
      }).select('id').single();

      if (error) throw error;

      if (createdLog?.id) {
        const { error: activityError } = await supabase.from('activities').insert({
          type: 'log_published',
          reference_id: createdLog.id,
          user_id: authUser.id
        });

        if (activityError) {
          console.warn('SOON-CORE activity sync failed', activityError.message);
        }
      }

      router.replace('/feed');
    } catch (err: any) {
      Alert.alert('發布失敗', err?.message ?? '請稍後再試。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Title>新增創作紀錄</Title>
            <Pressable onPress={() => router.back()}><Text style={styles.close}>關閉</Text></Pressable>
          </View>

          <Field value={title} onChangeText={setTitle} placeholder="標題（選填）" />
          <Field value={body} onChangeText={setBody} placeholder="今天想記低甚麼？" multiline />
          <Field value={productionNotes} onChangeText={setProductionNotes} placeholder="製作筆記、幕後想法、技術細節" multiline />
          <Field value={videoUrl} onChangeText={setVideoUrl} placeholder="影片連結（Instagram / YouTube / TikTok）" autoCapitalize="none" />
          <Field value={tags} onChangeText={setTags} placeholder="標籤，以逗號分隔" />

          <View style={styles.mediaHeader}>
            <Text style={styles.sectionTitle}>圖片</Text>
            <Text style={styles.imageCount}>{selectedImages.length}/4</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
            {selectedImages.map((uri) => (
              <View key={uri} style={styles.previewWrap}>
                <Image source={{ uri }} style={styles.preview} />
                <Pressable onPress={() => removeImage(uri)} style={styles.removeImageButton}>
                  <Text style={styles.removeImageText}>✕</Text>
                </Pressable>
              </View>
            ))}
            {selectedImages.length < 4 && (
              <Pressable onPress={pickImages} style={styles.addPhotoBox}>
                <Text style={styles.addPhotoIcon}>＋</Text>
                <Text style={styles.addPhotoText}>相片</Text>
              </Pressable>
            )}
          </ScrollView>

          <View style={styles.publishRow}>
            <View>
              <Text style={styles.sectionTitle}>公開發布</Text>
              <Text style={styles.hint}>關閉後只會儲存為私人草稿</Text>
            </View>
            <Switch value={isPublished} onValueChange={setIsPublished} trackColor={{ true: colors.accent, false: colors.border }} thumbColor={colors.text} />
          </View>

          <Button title="發布紀錄" variant="gold" onPress={submit} loading={loading} disabled={!body.trim()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 14
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  close: {
    color: colors.gold,
    fontFamily: fonts.bodyMedium,
    fontSize: 15
  },
  mediaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  imageCount: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  imageRow: {
    flexDirection: 'row',
    gap: 10,
    minHeight: 80,
    paddingRight: 16
  },
  previewWrap: {
    width: 80,
    height: 80
  },
  preview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.bgCard
  },
  removeImageButton: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text
  },
  removeImageText: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  addPhotoBox: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard
  },
  addPhotoIcon: {
    color: colors.gold,
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    lineHeight: 24
  },
  addPhotoText: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  publishRow: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgCard,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  hint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2
  }
});
