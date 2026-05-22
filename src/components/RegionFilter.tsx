import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type RegionFilterProps = {
  selected: string | null;
  onChange: (region: string | null) => void;
};

const REGIONS: Array<{ key: string | null; label: string }> = [
  { key: null, label: '全部' },
  { key: 'HK', label: '🇭🇰 HK' },
  { key: 'TW', label: '🇹🇼 TW' },
  { key: 'SG', label: '🇸🇬 SG' },
  { key: 'OTHER', label: '🌐 其他' }
];

export function RegionFilter({ selected, onChange }: RegionFilterProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {REGIONS.map((region) => {
        const active = selected === region.key;
        return (
          <Pressable
            key={region.key ?? 'all'}
            onPress={() => onChange(region.key)}
            style={({ pressed }) => [styles.pill, active && styles.activePill, pressed && styles.pressed]}
          >
            <Text style={[styles.pillText, active && styles.activePillText]}>{region.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 999,
    backgroundColor: colors.bgBodyMuted,
    paddingHorizontal: 14,
    paddingVertical: 6
  },
  activePill: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  pillText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  activePillText: {
    color: colors.textOnDark
  },
  pressed: {
    opacity: 0.72
  }
});
