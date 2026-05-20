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
import { EmptyState, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Log, Profile, Region } from '@/types';
import { normalizeImageForUpload } from '@/lib/images';

const regions: Region[] = ['HK', 'TW', 'SG', 'OTHER'];

export default function OwnProfileScreen() {
  const { user, signOut, refreshProfile } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
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
    setUsernameInput(profile?.username ?? '');
    setBioInput(profile?.bio ?? '');
    setRegionInput(profile?.region ?? 'HK');
  }, [profile]);

  const saveProfile = async () => {
    if (!user) return;
    const username = usernameInput.trim().toLowerCase();
    if (!username) {
      Alert.alert('請輸入 username', 'Username 會用喺個人頁連結。');
      return;
    }

    try {
      setSaving(true);
      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: displayNameInput.trim() || null,
          username,
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
      quality: 0.8
    });

    if (result.canceled) return;

    try {
      setUploadingAvatar(true);
      const image = await normalizeImageForUpload(result.assets[0].uri, 1024);
      const fileName = `avatars/${user.id}.jpg`;
      const response = await fetch(image.uri);
      const blob = await response.blob();

      const { error } = await supabase.storage
        .from('log-media')
        .upload(fileName, blob, {
          contentType: image.contentType,
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

  return (
    <Screen>
      <FlatList
        data={logs}
        numColumns={2}
        keyExtractor={(item) => item.id}
        onRefresh={() => load().catch((error) => Alert.alert('載入失敗', error.message))}
        refreshing={refreshing}
        ListHeaderComponent={(
          <View style={styles.header}>
            <View style={styles.topRow}>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setEditing((value) => !value)} style={styles.editTopButton}>
                <Text style={styles.editTopText}>{editing ? '完成' : '編輯'}</Text>
              </Pressable>
            </View>

            <Pressable onPress={changeAvatar} disabled={uploadingAvatar} style={styles.avatarButton}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Text style={styles.cameraText}>{uploadingAvatar ? '...' : '◎'}</Text>
              </View>
            </Pressable>

            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.username}>@{profile?.username ?? 'soon'}</Text>
            {!!profile?.region && <Text style={styles.regionBadge}>{profile.region}</Text>}
            {!!profile?.bio && <Text numberOfLines={2} style={styles.bio}>{profile.bio}</Text>}

            <View style={styles.statsRow}>
              <Pressable onPress={() => Alert.alert('作品', `${logs.length} 個作品`)}>
                <Text style={styles.statNumber}>{logs.length}</Text>
                <Text style={styles.statLabel}>作品</Text>
              </Pressable>
              <Pressable onPress={() => Alert.alert('追蹤者', `${followerCount} 位追蹤者`)}>
                <Text style={styles.statNumber}>{followerCount}</Text>
                <Text style={styles.statLabel}>追蹤者</Text>
              </Pressable>
              <Pressable onPress={() => Alert.alert('追蹤中', `${followingCount} 位創作者`)}>
                <Text style={styles.statNumber}>{followingCount}</Text>
                <Text style={styles.statLabel}>追蹤中</Text>
              </Pressable>
            </View>

            {editing && (
              <View style={styles.editPanel}>
                <TextInput value={displayNameInput} onChangeText={setDisplayNameInput} placeholder="顯示名稱" placeholderTextColor={colors.textMuted} style={styles.input} />
                <TextInput value={usernameInput} onChangeText={setUsernameInput} placeholder="username" placeholderTextColor={colors.textMuted} autoCapitalize="none" style={styles.input} />
                <TextInput value={bioInput} onChangeText={setBioInput} placeholder="簡介" placeholderTextColor={colors.textMuted} multiline style={[styles.input, styles.bioInput]} />
                <View style={styles.regionRow}>
                  {regions.map((region) => (
                    <Pressable key={region} onPress={() => setRegionInput(region)} style={[styles.regionChoice, regionInput === region && styles.regionChoiceActive]}>
                      <Text style={[styles.regionChoiceText, regionInput === region && styles.regionChoiceTextActive]}>{region}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.actions}>
                  <Pressable onPress={saveProfile} style={styles.saveButton} disabled={saving}>
                    <Text style={styles.saveButtonText}>{saving ? '儲存中' : '儲存'}</Text>
                  </Pressable>
                  <Pressable onPress={() => setEditing(false)} style={styles.cancelButton}>
                    <Text style={styles.cancelButtonText}>取消</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <Text style={styles.section}>我的紀錄</Text>
          </View>
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
        ListEmptyComponent={<EmptyState title="未有紀錄" body="按下記錄頁籤，建立第一篇創作日誌。" />}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 110
  },
  header: {
    paddingTop: 46,
    paddingHorizontal: 16,
    paddingBottom: 18,
    alignItems: 'center',
    gap: 9
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  editTopButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    paddingHorizontal: 14,
    paddingVertical: 7
  },
  editTopText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  avatarButton: {
    width: 88,
    height: 88
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgCard
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  avatarText: {
    color: colors.bgCard,
    fontFamily: fonts.heading,
    fontSize: 36
  },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
    backgroundColor: colors.gold
  },
  cameraText: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  name: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center'
  },
  username: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14
  },
  regionBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.bgMuted,
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  bio: {
    maxWidth: 320,
    color: '#3A3A3A',
    fontFamily: fonts.body,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20
  },
  statsRow: {
    width: '100%',
    marginTop: 4,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  statNumber: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    textAlign: 'center'
  },
  statLabel: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    textAlign: 'center'
  },
  editPanel: {
    alignSelf: 'stretch',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard
  },
  input: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.body,
    paddingHorizontal: 12,
    backgroundColor: colors.bg
  },
  bioInput: {
    minHeight: 84,
    paddingTop: 12,
    textAlignVertical: 'top'
  },
  regionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  regionChoice: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  regionChoiceActive: {
    borderColor: colors.gold,
    backgroundColor: colors.bgMuted
  },
  regionChoiceText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium
  },
  regionChoiceTextActive: {
    color: colors.text
  },
  actions: {
    flexDirection: 'row',
    gap: 8
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingVertical: 12
  },
  saveButtonText: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    paddingVertical: 12
  },
  cancelButtonText: {
    color: colors.text,
    fontFamily: fonts.bodyBold
  },
  section: {
    alignSelf: 'flex-start',
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    marginTop: 12
  },
  tile: {
    width: '50%',
    aspectRatio: 1,
    padding: 4
  },
  tileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: colors.bgCard
  },
  tileFallback: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    justifyContent: 'flex-end',
    backgroundColor: colors.gold
  },
  tileText: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  signOutButton: {
    alignSelf: 'center',
    paddingVertical: 22,
    paddingHorizontal: 20
  },
  signOutText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  }
});
