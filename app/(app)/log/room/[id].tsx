import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

export default function TopicRoomScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text style={styles.back}>← 返回</Text>
      </Pressable>
      <View style={styles.empty}>
        <Text style={styles.title}>Topic Room</Text>
        <Text style={styles.body}>{id ? `Room ${id}` : 'Open Studio room'} is coming soon.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody,
    paddingHorizontal: 16
  },
  back: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 24
  },
  body: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center'
  }
});
