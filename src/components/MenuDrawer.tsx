import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type CreditRow = {
  balance: number;
  daily_limit: number;
};

export function MenuDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { user, profile, signOut } = useAuth();
  const [credits, setCredits] = useState<CreditRow>({ balance: 30, daily_limit: 30 });
  const width = Dimensions.get('window').width * 0.8;
  const displayName = profile?.display_name || profile?.username || user?.email || 'SOON';
  const email = user?.email ?? '';
  const initial = displayName.slice(0, 1).toUpperCase();
  const progress = Math.max(0, Math.min(100, (credits.balance / Math.max(credits.daily_limit, 1)) * 100));

  const loadCredits = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_credits')
      .select('balance, daily_limit')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) setCredits(data as CreditRow);
  }, [user]);

  useEffect(() => {
    if (visible) loadCredits();
  }, [loadCredits, visible]);

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  const openProfile = () => {
    onClose();
    router.push('/profile');
  };

  const openReplySettings = () => {
    onClose();
    router.push('/(app)/settings/reply');
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={[styles.drawer, { width, paddingTop: insets.top + 22 }]}>
          <Text style={styles.kicker}>我嘅帳戶</Text>

          <Pressable onPress={openProfile} style={({ pressed }) => [styles.userRow, pressed && styles.pressed]}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
            <View style={styles.userText}>
              <Text numberOfLines={1} style={styles.displayName}>{displayName}</Text>
              <Text numberOfLines={1} style={styles.email}>{email}</Text>
            </View>
          </Pressable>

          <View style={styles.creditCard}>
            <Text style={styles.creditLabel}>🪙 AI Credit Balance</Text>
            <Text style={styles.creditBalance}>{credits.balance}</Text>
            <Text style={styles.creditSubtitle}>daily credits</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          </View>

          <View style={styles.menu}>
            <DrawerItem icon="⚙️" label="設定" onPress={openProfile} />
            <DrawerItem icon="🧠" label="AI 設定" onPress={openReplySettings} />
            <Divider />
            <DrawerItem icon="👤" label="邀請管理" />
            <Divider />
            <DrawerItem icon="💬" label="客戶支援" />
            <DrawerItem icon="🎓" label="創作者學院" />
            <Divider />
            <DrawerItem icon="⬅" label="登出" danger onPress={handleSignOut} />
          </View>
        </View>
        <Pressable style={styles.overlay} onPress={onClose} />
      </View>
    </Modal>
  );
}

function DrawerItem({
  icon,
  label,
  danger = false,
  onPress
}: {
  icon: string;
  label: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <Text style={styles.itemIcon}>{icon}</Text>
      <Text style={[styles.itemLabel, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    flexDirection: 'row'
  },
  drawer: {
    backgroundColor: colors.bgBody,
    paddingHorizontal: 20
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  kicker: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  userRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgHeroSurface
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
  },
  avatarInitial: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  userText: {
    flex: 1
  },
  displayName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  email: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 2
  },
  creditCard: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyMuted,
    padding: 16
  },
  creditLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  creditBalance: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 32,
    marginTop: 8
  },
  creditSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.bodyBorder,
    marginTop: 12,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary
  },
  menu: {
    marginTop: 24
  },
  item: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  pressed: {
    opacity: 0.68
  },
  itemIcon: {
    width: 28,
    fontSize: 20
  },
  itemLabel: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16
  },
  danger: {
    color: colors.error
  },
  divider: {
    height: 1,
    backgroundColor: colors.bodyBorder
  }
});
