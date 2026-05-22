import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Log, Profile, Region } from '@/types';

const regions: Region[] = ['HK', 'TW', 'SG', 'OTHER'];

function base64ToArrayBuffer(base64: string) {
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const byteLength = Math.floor((cleanBase64.length * 3) / 4) - (cleanBase64.endsWith('==') ? 2 : cleanBase64.endsWith('=') ? 1 : 0);
  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;

  for (let index = 0; index < cleanBase64.length; index += 4) {
    const chunk =
      (lookup.indexOf(cleanBase64[index]) << 18) |
      (lookup.indexOf(cleanBase64[index + 1]) << 12) |
      ((cleanBase64[index + 2] === '=' ? 0 : lookup.indexOf(cleanBase64[index + 2])) << 6) |
      (cleanBase64[index + 3] === '=' ? 0 : lookup.indexOf(cleanBase64[index + 3]));

    if (byteIndex < byteLength) bytes[byteIndex++] = (chunk >> 16) & 255;
    if (byteIndex < byteLength) bytes[byteIndex++] = (chunk >> 8) & 255;
    if (byteIndex < byteLength) bytes[byteIndex++] = chunk & 255;
  }

  return bytes.buffer;
}

export default function OwnProfileScreen() {
  const { user, signOut, refreshProfile } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [bioInput, setBioInput] = useState('');
  const [regionInput, setRegionInput] = useState<Region>('HK');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);

    const [
      profileResult,
      logsResult,
      followerResult,
      followingResult
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id)
    ]);

    if (profileResult.error) throw profileResult.error;
    if (logsResult.error) throw logsResult.error;
    if (followerResult.error) throw followerResult.error;
    if (followingResult.error) throw followingResult.error;

    setProfile(profileResult.data as Profile);
    setLogs((logsResult.data ?? []) as Log[]);
    setFollowerCount(followerResult.count ?? 0);
    setFollowingCount(followingResult.count ?? 0);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    load().catch((error) => {
      setRefreshing(false);
      Alert.alert('載入失敗', error.message);
    });
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;

      supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id)
        .then(() => refreshProfile().catch(() => undefined));
    }, [refreshProfile, user])
  );

  useEffect(() => {
    setDisplayNameInput(profile?.display_name ?? '');
    setBioInput(profile?.bio ?? '');
    setRegionInput(profile?.region ?? 'HK');
  }, [profile]);

  const saveProfile = async () => {
    if (!user) return;

    try {
      setSaving(true);
      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: displayNameInput.trim() || null,
          bio: bioInput.trim() || null,
          region: regionInput
        })
        .eq('id', user.id)
        .select('*')
        .single();

      if (error) throw error;
      setProfile(data as Profile);
      await refreshProfile();
      setEditing(false);
    } catch (error) {
      Alert.alert('儲存失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setSaving(false);
    }
  };

  const changeAvatar = async () => {
    if (!user) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要相片權限', '請允許 SOON LOG 存取相簿以上載頭像。');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible
    });

    if (result.canceled) return;

    try {
      setUploadingAvatar(true);
      const base64 = result.assets[0].base64;
      if (!base64) throw new Error('未能讀取相片資料，請再試一次。');

      const fileName = `avatars/${user.id}.jpg`;
      const imageBody = base64ToArrayBuffer(base64);

      const { error } = await supabase.storage
        .from('log-media')
        .upload(fileName, imageBody, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('log-media')
        .getPublicUrl(fileName);
      const versionedPublicUrl = `${publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: versionedPublicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;
      setProfile((current) => current ? { ...current, avatar_url: versionedPublicUrl } : current);
      await refreshProfile();
    } catch (error) {
      Alert.alert('上載失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const displayName = profile?.display_name || profile?.username || '創作者';
  const canGoBack = router.canGoBack();

  return (
    <View style={styles.screen}>
      <FlatList
        data={logs}
        numColumns={2}
        keyExtractor={(item) => item.id}
        onRefresh={() => load().catch((error) => Alert.alert('載入失敗', error.message))}
        refreshing={refreshing}
        ListHeaderComponent={(
          <>
            <View style={styles.hero}>
              <SafeAreaView edges={['top']} style={styles.heroSafe}>
                <View style={styles.topRow}>
                  {canGoBack ? (
                    <Pressable onPress={() => router.back()} hitSlop={10}>
                      <Text style={styles.backText}>← 返回</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.topSpacer} />
                  )}
                  <Pressable onPress={editing ? saveProfile : () => setEditing(true)} disabled={saving} hitSlop={10}>
                    <Text style={[styles.editTopText, editing && styles.saveTopText]}>
                      {editing ? (saving ? '儲存中' : '儲存') : '編輯'}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.profileCenter}>
                  <Pressable onPress={changeAvatar} disabled={uploadingAvatar} style={styles.avatarButton}>
                    {profile?.avatar_url ? (
                      <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={styles.cameraBadge}>
                      <Text style={styles.cameraText}>{uploadingAvatar ? '…' : '📷'}</Text>
                    </View>
                  </Pressable>

                  {editing ? (
                    <View style={styles.editFields}>
                      <TextInput
                        value={displayNameInput}
                        onChangeText={setDisplayNameInput}
                        placeholder="顯示名稱"
                        placeholderTextColor={colors.textOnDarkMuted}
                        style={styles.heroInput}
                      />
                      <TextInput
                        value={bioInput}
                        onChangeText={setBioInput}
                        placeholder="簡介"
                        placeholderTextColor={colors.textOnDarkMuted}
                        multiline
                        style={[styles.heroInput, styles.heroBioInput]}
                      />
                      <View style={styles.regionRow}>
                        {regions.map((region) => (
                          <Pressable
                            key={region}
                            onPress={() => setRegionInput(region)}
                            style={[styles.regionChoice, regionInput === region && styles.regionChoiceActive]}
                          >
                            <Text style={styles.regionChoiceText}>{region}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.name}>{displayName}</Text>
                      <Text style={styles.username}>@{profile?.username ?? 'soon'}</Text>
                      {!!profile?.region && <Text style={styles.regionBadge}>{profile.region}</Text>}
                      {!!profile?.bio && <Text numberOfLines={2} style={styles.bio}>{profile.bio}</Text>}
                    </>
                  )}
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statColumn}>
                    <Text style={styles.statNumber}>{followerCount}</Text>
                    <Text style={styles.statLabel}>追蹤者</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statColumn}>
                    <Text style={styles.statNumber}>{followingCount}</Text>
                    <Text style={styles.statLabel}>追蹤中</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statColumn}>
                    <Text style={styles.statNumber}>{logs.length}</Text>
                    <Text style={styles.statLabel}>作品</Text>
                  </View>
                </View>
              </SafeAreaView>
            </View>

            <View style={styles.bodyHeader}>
              <Text style={styles.section}>我的紀錄</Text>
            </View>
          </>
        )}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/log/${item.id}`)} style={styles.tile}>
            {item.media_urls?.[0] ? (
              <Image source={{ uri: item.media_urls[0] }} style={styles.tileImage} />
            ) : (
              <View style={styles.tileFallback}>
                <Text numberOfLines={4} style={styles.tileText}>{item.title || item.body}</Text>
              </View>
            )}
          </Pressable>
        )}
        ListFooterComponent={(
          <Pressable onPress={signOut} style={styles.signOutButton}>
            <Text style={styles.signOutText}>登出</Text>
          </Pressable>
        )}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>仲未有紀錄</Text>
            <Text style={styles.emptyBody}>撳下面 ⌛ 開始記錄你嘅創作</Text>
          </View>
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  list: {
    backgroundColor: colors.bgBody,
    paddingBottom: 48
  },
  hero: {
    backgroundColor: colors.bgHero
  },
  heroSafe: {
    paddingHorizontal: 16,
    paddingBottom: 22
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 38
  },
  topSpacer: {
    width: 52
  },
  backText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  editTopText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  saveTopText: {
    color: colors.primary
  },
  profileCenter: {
    alignItems: 'center',
    paddingTop: 18
  },
  avatarButton: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: colors.textOnDark,
    backgroundColor: colors.bgHeroSurface
  },
  avatarFallback: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: colors.textOnDark,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
  },
  avatarText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 36
  },
  cameraBadge: {
    position: 'absolute',
    right: 4,
    bottom: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
  },
  cameraText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 10
  },
  name: {
    marginTop: 12,
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center'
  },
  username: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.body,
    fontSize: 14
  },
  regionBadge: {
    marginTop: 10,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 4
  },
  bio: {
    marginTop: 8,
    maxWidth: 320,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.body,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20
  },
  editFields: {
    width: '100%',
    maxWidth: 340,
    marginTop: 14,
    gap: 12,
    alignItems: 'center'
  },
  heroInput: {
    width: '100%',
    minHeight: 42,
    borderBottomWidth: 1,
    borderBottomColor: colors.heroBorder,
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  heroBioInput: {
    minHeight: 64,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top'
  },
  regionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8
  },
  regionChoice: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  regionChoiceActive: {
    backgroundColor: colors.primary
  },
  regionChoiceText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  statsRow: {
    width: '100%',
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  statColumn: {
    flex: 1,
    alignItems: 'center'
  },
  statNumber: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    textAlign: 'center'
  },
  statLabel: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: fonts.body,
    fontSize: 11,
    textAlign: 'center'
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.1)'
  },
  bodyHeader: {
    backgroundColor: colors.bgBody,
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 12
  },
  section: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  tile: {
    width: '50%',
    aspectRatio: 1,
    padding: 1,
    backgroundColor: colors.bgBody
  },
  tileImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.bgBodyMuted
  },
  tileFallback: {
    flex: 1,
    padding: 8,
    justifyContent: 'flex-end',
    backgroundColor: colors.primary
  },
  tileText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    lineHeight: 16
  },
  emptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32
  },
  emptyTitle: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    textAlign: 'center'
  },
  emptyBody: {
    marginTop: 6,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center'
  },
  signOutButton: {
    alignSelf: 'center',
    marginTop: 32,
    marginBottom: 48,
    paddingVertical: 12,
    paddingHorizontal: 20
  },
  signOutText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14
  }
});
