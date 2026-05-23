import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

type DrawerRoute =
  | '/(app)/profile'
  | '/(app)/log'
  | '/(app)/friends'
  | '/(app)/subscribers';

export function MenuDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { user, profile, signOut } = useAuth();
  const [credits, setCredits] = useState<CreditRow>({ balance: 30, daily_limit: 30 });
  const width = Dimensions.get('window').width * 0.8;
  const displayName = profile?.display_name || profile?.username || user?.email || 'SOON';
  const username = profile?.username ? `@${profile.username}` : user?.email || '@soon';
  const initial = displayName.slice(0, 1).toUpperCase();
  const progress = Math.max(0, Math.min(100, (credits.balance / Math.max(credits.daily_limit || 30, 1)) * 100));

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

  const navigate = (path: DrawerRoute) => {
    onClose();
    router.push(path);
  };

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={[styles.drawer, { width, paddingTop: insets.top + 22 }]}>
          <Pressable onPress={() => navigate('/(app)/profile')} style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
            <View style={styles.headerText}>
              <Text numberOfLines={1} style={styles.displayName}>{displayName}</Text>
              <Text numberOfLines={1} style={styles.username}>{username}</Text>
            </View>
          </Pressable>

          <View style={styles.coinsCard}>
            <View style={styles.coinsRow}>
              <View style={styles.coinsLabelRow}>
                <Image source={require('../../assets/coin.png')} style={styles.coinIcon} />
                <Text style={styles.coinsLabel}>Coins</Text>
              </View>
              <Text style={styles.coinBalance}>{credits.balance}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.coinCaption}>{credits.balance} / 30 今日剩餘</Text>
          </View>

          <View style={styles.menu}>
            <Text style={styles.groupLabel}>我的空間</Text>
            <DrawerItem icon="video" label="我的房間" onPress={() => navigate('/(app)/log')} />
            <DrawerItem icon="user-check" label="好友" onPress={() => navigate('/(app)/friends')} />
            <DrawerItem icon="users" label="訂閱者" onPress={() => navigate('/(app)/subscribers')} />
            <Divider />
            <Text style={styles.groupLabel}>帳戶</Text>
            <DrawerItem icon="settings" label="設定" onPress={() => navigate('/(app)/profile')} />
            <Divider />
            <DrawerItem icon="log-out" label="登出" danger onPress={handleSignOut} />
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
  icon: keyof typeof Feather.glyphMap;
  label: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  const color = danger ? colors.error : '#3A3A3A';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <Feather name={icon} size={20} color={color} style={styles.itemIcon} />
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
    backgroundColor: colors.bgBody
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 12
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgHeroSurface
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
  },
  avatarInitial: {
    color: colors.textOnDark,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  headerText: {
    flex: 1
  },
  displayName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  username: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  coinsCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: colors.bgBodyMuted,
    padding: 14
  },
  coinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  coinsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  coinIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain'
  },
  coinsLabel: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  coinBalance: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bodyBorder,
    marginTop: 8,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.primary
  },
  coinCaption: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11
  },
  menu: {
    paddingTop: 8
  },
  groupLabel: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  item: {
    height: 52,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center'
  },
  itemIcon: {
    marginRight: 14
  },
  itemLabel: {
    color: '#1A1A1A',
    fontFamily: fonts.bodyMedium,
    fontSize: 15
  },
  danger: {
    color: colors.error
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 8
  },
  pressed: {
    opacity: 0.68
  }
});
