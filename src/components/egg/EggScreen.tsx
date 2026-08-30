import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { fonts } from '@/lib/theme';

export function EggScreen({ title, eyebrow, children }: { title?: string; eyebrow?: string; children: ReactNode }) {
  const motion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(motion, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(motion, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [motion]);
  const translateX = motion.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });
  const translateY = motion.interpolate({ inputRange: [0, 1], outputRange: [1, -1] });
  const rotate = motion.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '3deg'] });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <Animated.Image source={require('../../../assets/soon-egg.png')} style={[styles.logo, { transform: [{ translateX }, { translateY }, { rotate }] }]} resizeMode="contain" />
        </View>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export const eggStyles = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 8 },
  cardTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 17 },
  body: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  metric: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 25 },
  link: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgBody },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 32, gap: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', minHeight: 30, marginBottom: 2 },
  logo: { width: 29, height: 29 },
  eyebrow: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 12 },
  title: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 29, lineHeight: 35 },
});
