import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

export function EggLoader({ label, size = 'medium', fullPage = false }: { label?: string; size?: 'small' | 'medium' | 'large'; fullPage?: boolean }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.timing(rotation, {
      toValue: 1,
      duration: 1350,
      easing: Easing.linear,
      useNativeDriver: true
    }));
    animation.start();
    return () => animation.stop();
  }, [rotation]);

  const dimension = size === 'small' ? 22 : size === 'large' ? 86 : 42;
  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return <View style={[styles.wrap, fullPage && styles.fullPage]} accessibilityRole="progressbar" accessibilityLabel={label ?? '正在載入'}>
    <Animated.Image source={require('../../../assets/soon-egg.png')} resizeMode="contain" style={{ width: dimension, height: dimension, transform: [{ rotate: spin }] }} />
    {label ? <Text style={styles.label}>{label}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 10 },
  fullPage: { flex: 1, minHeight: 280, backgroundColor: colors.bgBody },
  label: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: 13, textAlign: 'center' }
});
