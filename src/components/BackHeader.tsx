import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type BackHeaderProps = {
  title: string;
  rightElement?: ReactNode;
  backTo?: string;
};

export function BackHeader({ title, rightElement, backTo }: BackHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={() => backTo ? router.replace(backTo as never) : router.back()} style={styles.back}>
        <Text style={styles.backText}>← 返回</Text>
      </TouchableOpacity>
      <View pointerEvents="none" style={[styles.titleWrap, { top: insets.top + 8 }]}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
      <View style={styles.right}>
        {rightElement || null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    justifyContent: 'space-between',
    position: 'relative',
  },
  back: {
    minWidth: 80,
  },
  backText: {
    color: '#5C2A22',
    fontSize: 15,
  },
  titleWrap: {
    position: 'absolute',
    left: 96,
    right: 96,
    bottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  right: {
    minWidth: 148,
    alignItems: 'flex-end',
  },
});
