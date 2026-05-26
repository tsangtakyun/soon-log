import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

function isImageIcon(value: string | null | undefined) {
  return Boolean(value && (/^(https?:|data:image\/)/.test(value)));
}

function TrendIcon({ value, size = 18 }: { value?: string | null; size?: number }) {
  if (isImageIcon(value)) {
    return <Image source={{ uri: value || '' }} style={{ width: size, height: size, borderRadius: size * 0.22 }} resizeMode="cover" />;
  }

  return <Text style={[styles.inlineIcon, { fontSize: size }]}>{value || '🔥'}</Text>;
}

function TopAnswerRow({ angles }: { angles: TrendAngle[] | null | undefined }) {
  const topAngles = getTopTwoAngles(angles);
  if (topAngles.length === 0) return null;

  return (
    <View style={styles.topAnswers}>
      {topAngles.map((angle, index) => (
        <View key={`${angle.name}-${index}`} style={styles.topAnswerItem}>
          <TrendIcon value={angle.emoji} size={12} />
          <Text style={styles.topAnswerText} numberOfLines={1}>
            {angle.name} {typeof angle.percentage === 'number' ? `${Math.round(angle.percentage)}%` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function getTopTwoAngles(angles: TrendAngle[] | null | undefined) {
  return [...(angles ?? [])]
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))
    .slice(0, 2);
}

function getAnswerRatioWidths(angles: TrendAngle[] | null | undefined) {
  const [first, second] = getTopTwoAngles(angles);
  if (!first) return { firstWidth: 0, secondWidth: 0 };

  const firstPercentage = Math.max(0, first.percentage ?? 0);
  const secondPercentage = Math.max(0, second?.percentage ?? 0);
  const total = firstPercentage + secondPercentage;

  if (total <= 0) {
    return { firstWidth: second ? 50 : 100, secondWidth: second ? 50 : 0 };
  }

  return {
    firstWidth: (firstPercentage / total) * 100,
    secondWidth: second ? (secondPercentage / total) * 100 : 0
  };
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
  const answerRatio = getAnswerRatioWidths(current.angles);

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
          <View style={styles.topicHeader}>
            <TrendIcon value={current.icon} size={18} />
            <Text style={styles.topicText} numberOfLines={1}>{current.topic}</Text>
          </View>
          <View style={styles.answerRatioBar}>
            <View style={[styles.answerRatioFirst, { width: `${answerRatio.firstWidth}%` }]} />
            <View style={[styles.answerRatioSecond, { width: `${answerRatio.secondWidth}%` }]} />
          </View>
          <TopAnswerRow angles={current.angles} />
        </View>

        <View style={styles.rightSection}>
          <View style={styles.dots}>
            {trends.map((trend, index) => (
              <View key={`${trend.id}-${index}`} style={[styles.dot, index === currentIndex && styles.dotActive]} />
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
  topicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6
  },
  inlineIcon: {
    lineHeight: 20
  },
  topicText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    fontWeight: '700'
  },
  answerRatioBar: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
    flexDirection: 'row'
  },
  answerRatioFirst: {
    height: 6,
    backgroundColor: '#34d399'
  },
  answerRatioSecond: {
    height: 6,
    backgroundColor: '#fb7185'
  },
  topAnswers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 5,
    overflow: 'hidden'
  },
  topAnswerItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  topAnswerText: {
    flex: 1,
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
