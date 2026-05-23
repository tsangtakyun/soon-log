import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
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
import { PlatformLogo, type Platform as PlatformKey } from './PlatformLogo';

type Links = {
  instagram: string;
  youtube: string;
  tiktok: string;
  xiaohongshu: string;
  threads: string;
};

const emptyLinks: Links = {
  instagram: '',
  youtube: '',
  tiktok: '',
  xiaohongshu: '',
  threads: '',
};

const platforms: { key: PlatformKey; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'xiaohongshu', label: '小紅書' },
  { key: 'threads', label: 'Threads' },
];

function buildShareText(links: Links) {
  const parts: string[] = [];
  if (links.instagram) parts.push('📸 IG: ' + links.instagram);
  if (links.youtube) parts.push('▶️ YouTube: ' + links.youtube);
  if (links.tiktok) parts.push('🎵 TikTok: ' + links.tiktok);
  if (links.xiaohongshu) parts.push('📕 小紅書: ' + links.xiaohongshu);
  if (links.threads) parts.push('@ Threads: ' + links.threads);
  return parts.join('\n');
}

export function SocialLinksSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [links, setLinks] = useState<Links>(emptyLinks);
  const [editing, setEditing] = useState(false);
  const hasAnyLink = platforms.some((platform) => links[platform.key].trim().length > 0);

  const loadLinks = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('social_links')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data?.social_links && typeof data.social_links === 'object') {
      setLinks({ ...emptyLinks, ...(data.social_links as Partial<Links>) });
    }
  }, [user]);

  useEffect(() => {
    if (visible) {
      setEditing(false);
      loadLinks();
    }
  }, [loadLinks, visible]);

  async function saveLinks() {
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update({ social_links: links })
      .eq('id', user.id);

    if (error) {
      Alert.alert('儲存失敗', error.message);
      return;
    }
    setEditing(false);
  }

  async function copy(value: string) {
    if (!value) return;
    await Share.share({ message: value });
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>我的連結</Text>
            <Pressable onPress={editing ? saveLinks : () => setEditing(true)} hitSlop={8}>
              <Text style={styles.editText}>{editing ? '完成' : '編輯'}</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {platforms.map((platform) => {
              const value = links[platform.key];
              return (
                <View key={platform.key} style={styles.row}>
                  <View style={styles.logoWrap}>
                    <PlatformLogo platform={platform.key} size={24} showLabel />
                  </View>
                  <View style={styles.rowBody}>
                    {editing ? (
                      <TextInput
                        value={value}
                        onChangeText={(text) => setLinks((current) => ({ ...current, [platform.key]: text }))}
                        placeholder="@username 或 完整 URL"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        style={styles.input}
                      />
                    ) : (
                      <Text numberOfLines={1} style={[styles.linkText, !value && styles.emptyLink]}>{value || '未設定'}</Text>
                    )}
                  </View>
                  {!editing ? (
                    <Pressable onPress={() => copy(value)} hitSlop={8}>
                      <Text style={[styles.copy, !value && styles.copyDisabled]}>⧉</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}

            {!editing && hasAnyLink ? (
              <Pressable onPress={() => Share.share({ message: buildShareText(links) })} style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}>
                <Text style={styles.shareText}>分享全部連結</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  backdropPress: {
    flex: 1
  },
  sheet: {
    maxHeight: '65%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.bgBody,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  handle: {
    alignSelf: 'center',
    width: 56,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.bodyBorder,
    marginBottom: 12
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12
  },
  title: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  editText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  close: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 28
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  logoWrap: {
    width: 116
  },
  rowBody: {
    flex: 1
  },
  linkText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15
  },
  emptyLink: {
    color: colors.textMuted
  },
  input: {
    marginTop: 4,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingVertical: 4
  },
  copy: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  copyDisabled: {
    color: colors.bodyBorder
  },
  shareButton: {
    marginTop: 18,
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    alignItems: 'center'
  },
  shareText: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  pressed: {
    opacity: 0.72
  }
});
