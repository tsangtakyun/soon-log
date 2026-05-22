import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type BackHeaderProps = {
  title: string;
  rightElement?: ReactNode;
};

export function BackHeader({ title, rightElement }: BackHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← 返回</Text>
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
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
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  back: {
    minWidth: 80,
  },
  backText: {
    color: '#5C2A22',
    fontSize: 15,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  right: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
});
