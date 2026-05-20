import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { EmptyState, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Log, Region } from '@/types';

const regions: Region[] = ['HK', 'TW', 'SG', 'OTHER'];

export default function OwnProfileScreen() {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [editing, setEditing] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [bioInput, setBioInput] = useState('');
  const [avatarInput, setAvatarInput] = useState('');
  const [regionInput, setRegionInput] = useState<Region>('HK');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    await refreshProfile();
    const [{ data: logRows }, { data: followerRows }, { data: followingRows }] = await Promise.all([
      supabase.from('logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('follows').select('follower_id').eq('following_id', user.id),
      supabase.from('follows').select('following_id').eq('follower_id', user.id)
    ]);
    setLogs((logRows ?? []) as Log[]);
    setFollowers(followerRows?.length ?? 0);
    setFollowing(followingRows?.length ?? 0);
  }, [refreshProfile, user]);

  useEffect(() => {
    load().catch((error) => Alert.alert('載入失敗', error.message));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;

      supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id)
        .then(() => {
          refreshProfile().catch(() => undefined);
        });
    }, [refreshProfile, user])
  );

  useEffect(() => {
    setDisplayNameInput(profile?.display_name ?? '');
    setBioInput(profile?.bio ?? '');
    setAvatarInput(profile?.avatar_url ?? '');
    setRegionInput(profile?.region ?? 'HK');
  }, [profile]);

  const saveProfile = async () => {
    if (!user) return;
    try {
      setSaving(true);
      const { error } = await supabase.from('profiles').update({
        display_name: displayNameInput.trim() || null,
        bio: bioInput.trim() || null,
        avatar_url: avatarInput.trim() || null,
        region: regionInput
      }).eq('id', user.id);
      if (error) throw error;
      await load();
      setEditing(false);
    } catch (error) {
      Alert.alert('儲存失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setSaving(false);
    }
  };

  const displayName = profile?.display_name || profile?.username || '創作者';

  return (
    <Screen>
      <FlatList
        data={logs}
        numColumns={2}
        keyExtractor={(item) => item.id}
        onRefresh={load}
        refreshing={false}
        ListHeaderComponent={(
          <View style={styles.header}>
            {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text></View>}
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.username}>@{profile?.username ?? 'soon'}</Text>
            {!!profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}
            <View style={styles.badges}>
              {!!profile?.region && <Text style={styles.badge}>{profile.region}</Text>}
              <Pressable onPress={() => Alert.alert('追蹤者', `${followers} 位追蹤者`)}><Text style={styles.count}>{followers} 追蹤者</Text></Pressable>
              <Pressable onPress={() => Alert.alert('正在追蹤', `${following} 位創作者`)}><Text style={styles.count}>{following} 追蹤中</Text></Pressable>
            </View>
            {editing ? (
              <View style={styles.editPanel}>
                <TextInput value={displayNameInput} onChangeText={setDisplayNameInput} placeholder="顯示名稱" placeholderTextColor={colors.textMuted} style={styles.input} />
                <TextInput value={bioInput} onChangeText={setBioInput} placeholder="簡介" placeholderTextColor={colors.textMuted} multiline style={[styles.input, styles.bioInput]} />
                <TextInput value={avatarInput} onChangeText={setAvatarInput} placeholder="頭像圖片網址" placeholderTextColor={colors.textMuted} autoCapitalize="none" style={styles.input} />
                <View style={styles.regionRow}>
                  {regions.map((region) => (
                    <Pressable key={region} onPress={() => setRegionInput(region)} style={[styles.regionChoice, regionInput === region && styles.regionChoiceActive]}>
                      <Text style={[styles.regionChoiceText, regionInput === region && styles.regionChoiceTextActive]}>{region}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.actions}>
                  <Pressable onPress={saveProfile} style={styles.button} disabled={saving}><Text style={styles.buttonText}>{saving ? '儲存中' : '儲存'}</Text></Pressable>
                  <Pressable onPress={() => setEditing(false)} style={styles.ghostButton}><Text style={styles.buttonText}>取消</Text></Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.actions}>
                <Pressable onPress={() => setEditing(true)} style={styles.button}><Text style={styles.buttonText}>編輯個人檔案</Text></Pressable>
                <Pressable onPress={signOut} style={styles.ghostButton}><Text style={styles.buttonText}>登出</Text></Pressable>
              </View>
            )}
            <Text style={styles.section}>我的紀錄</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/log/${item.id}`)} style={styles.tile}>
            {item.media_urls?.[0] ? <Image source={{ uri: item.media_urls[0] }} style={styles.tileImage} /> : <View style={styles.tileFallback}><Text numberOfLines={3} style={styles.tileText}>{item.title || item.body}</Text></View>}
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
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 18,
    alignItems: 'center',
    gap: 10
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.bgCard
  },
  avatarFallback: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  avatarText: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 42
  },
  name: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 34,
    lineHeight: 38
  },
  username: {
    color: colors.gold,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  bio: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8
  },
  badge: {
    color: colors.gold,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyMedium
  },
  count: {
    color: colors.text,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyMedium
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4
  },
  editPanel: {
    alignSelf: 'stretch',
    gap: 10,
    padding: 14,
    borderRadius: 8,
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
    borderRadius: 8,
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
    color: colors.gold
  },
  button: {
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  ghostButton: {
    borderRadius: 8,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  buttonText: {
    color: colors.text,
    fontFamily: fonts.bodyBold
  },
  section: {
    alignSelf: 'flex-start',
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    marginTop: 14
  },
  tile: {
    width: '50%',
    aspectRatio: 1,
    padding: 1
  },
  tileImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.bgCard
  },
  tileFallback: {
    flex: 1,
    padding: 12,
    justifyContent: 'flex-end',
    backgroundColor: colors.bgCard
  },
  tileText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  }
});
