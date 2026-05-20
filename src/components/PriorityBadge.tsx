import { StyleSheet, Text } from 'react-native';
import { fonts } from '@/lib/theme';
import { WorkPriority } from '@/types';

const config = {
  high: { label: '高優先', bg: '#FFF0EE', text: '#E8614A' },
  medium: { label: '中優先', bg: '#F5F2ED', text: '#888880' },
  low: { label: '低優先', bg: '#F0F5EE', text: '#4ACC7A' }
};

export function PriorityBadge({ priority }: { priority: WorkPriority }) {
  const item = config[priority];
  return <Text style={[styles.badge, { backgroundColor: item.bg, color: item.text }]}>{item.label}</Text>;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  }
});
