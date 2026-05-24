import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

type TrendAngle = {
  emoji?: string;
  name: string;
  percentage?: number;
};

type Trend = {
  id: string;
  topic: string;
  icon: string | null;
  heat_score: number | null;
  angles: TrendAngle[] | null;
};

function normaliseAngles(value: unknown): TrendAngle[] {
  return Array.isArray(value) ? value.filter((angle): angle is TrendAngle => Boolean(angle && typeof angle === 'object' && 'name' in angle)) : [];
}

export function TrendStrip() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    supabase
      .from('trends')
      .select('id, topic, icon, heat_score, angles')
      .eq('is_active', true)
      .order('heat_score', { ascending: false })
      .then(({ data }) => {
        setTrends(((data ?? []) as Array<Trend & { angles: unknown }>).map((trend) => ({
          ...trend,
          angles: normaliseAngles(trend.angles)
        })));
      });
  }, []);

  useEffect(() => {
    if (trends.length === 0) return;
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      }).start(() => {
        setCurrentIndex((current) => (current + 1) % trends.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true
        }).start();
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [fadeAnim, trends.length]);

  const current = trends[currentIndex];
  if (!current) return null;

  const heatScore = current.heat_score ?? 0;
  const heatPct = Math.max(0, Math.min(100, heatScore));
  const topAngle = current.angles?.[0];

  return (
    <TouchableOpacity
      onPress={() => router.push({ pathname: '/(app)/predikt', params: { focus: current.id } })}
      activeOpacity={0.85}
    >
      <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
        <View style={styles.heatBadge}>
          <Text style={styles.fireIcon}>🔥</Text>
          <Text style={styles.heatScore}>{heatScore}</Text>
        </View>

        <View style={styles.topicSection}>
          <Text style={styles.topicText} numberOfLines={1}>
            {current.icon || '🔥'} {current.topic}
          </Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${heatPct}%` }]} />
          </View>
          {topAngle ? (
            <Text style={styles.topAngle} numberOfLines={1}>
              熱門角度：{topAngle.name}
            </Text>
          ) : null}
        </View>

        <View style={styles.rightSection}>
          <View style={styles.dots}>
            {trends.map((trend, index) => (
              <View key={trend.id} style={[styles.dot, index === currentIndex && styles.dotActive]} />
            ))}
          </View>
          <Feather name="chevron-right" size={16} color={colors.primary} />
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyCard,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  heatBadge: {
    alignItems: 'center',
    minWidth: 40
  },
  fireIcon: {
    fontSize: 20
  },
  heatScore: {
    marginTop: 2,
    color: '#E8614A',
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    fontWeight: '800'
  },
  topicSection: {
    flex: 1
  },
  topicText: {
    marginBottom: 6,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    fontWeight: '700'
  },
  progressBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden'
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E8614A'
  },
  topAngle: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11
  },
  rightSection: {
    alignItems: 'center',
    gap: 8
  },
  dots: {
    flexDirection: 'row',
    gap: 3
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bodyBorder
  },
  dotActive: {
    backgroundColor: colors.primary
  }
});
