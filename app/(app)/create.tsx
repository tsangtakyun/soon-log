import * as ImagePicker from 'expo-image-picker';
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

async function uploadImage(uri: string, userId: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = uri.split('.').pop()?.toLowerCase()?.split('?')[0] || 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from('log-media').upload(path, blob, {
    contentType: blob.type || `image/${ext}`,
    upsert: false
  });

  if (error) throw error;
  const { data } = supabase.storage.from('log-media').getPublicUrl(path);
  return data.publicUrl;
}

export default function CreateLogScreen() {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [productionNotes, setProductionNotes] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [tags, setTags] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要相片權限', '請允許 SOON-LOG 存取相片。');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 4 - images.length),
      quality: 0.82
    });

    if (!result.canceled) {
      setImages((current) => [...current, ...result.assets.map((asset) => asset.uri)].slice(0, 4));
    }
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

      const mediaUrls = await Promise.all(images.map((uri) => uploadImage(uri, authUser.id)));
      const normalizedTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);

      const { data: createdLog, error } = await supabase.from('logs').insert({
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
            <Pressable onPress={pickImages} disabled={images.length >= 4}><Text style={styles.addImage}>加入圖片</Text></Pressable>
          </View>
          <View style={styles.imageRow}>
            {images.map((uri) => (
              <Pressable key={uri} onPress={() => setImages((current) => current.filter((item) => item !== uri))}>
                <Image source={{ uri }} style={styles.preview} />
              </Pressable>
            ))}
          </View>

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
  addImage: {
    color: colors.gold,
    fontFamily: fonts.bodyMedium
  },
  imageRow: {
    flexDirection: 'row',
    gap: 10,
    minHeight: 78
  },
  preview: {
    width: 78,
    height: 78,
    borderRadius: 8,
    backgroundColor: colors.bgCard
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
