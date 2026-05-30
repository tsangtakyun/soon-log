import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { BackHeader } from '@/components/BackHeader';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { isTrendClosed } from '@/lib/trends';
import { colors } from '@/theme/colors';

type TrendAngle = { emoji?: string; name: string; percentage?: number };
type VoteTrend = {
  id: string;
  topic: string | null;
  icon: string | null;
  angles: TrendAngle[] | null;
  deadline_at?: string | null;
};
type VoteRow = {
  trend_id: string;
  user_id: string;
  angle_index: number;
  angle_name: string | null;
  created_at: string;
  trends?: VoteTrend | VoteTrend[] | null;
};
type VoteCountRow = {
  trend_id: string;
  angle_index: number;
  angle_name: string | null;
};

function normaliseTrend(value: VoteRow['trends']) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function resultForTrend(trend: VoteTrend | null, votes: VoteCountRow[]) {
  if (!trend) return null;

  const counts = new Map<number, number>();
  votes
    .filter((vote) => vote.trend_id === trend.id)
    .forEach((vote) => counts.set(vote.angle_index, (counts.get(vote.angle_index) ?? 0) + 1));

  if (counts.size > 0) {
    const maxCount = Math.max(...counts.values());
    return {
      indexes: [...counts.entries()].filter(([, count]) => count === maxCount).map(([index]) => index),
      count: maxCount
    };
  }

  const angles = trend.angles ?? [];
  if (angles.length === 0) return null;
  const maxPercentage = Math.max(...angles.map((angle) => angle.percentage ?? 0));
  return {
    indexes: angles
      .map((angle, index) => ({ index, percentage: angle.percentage ?? 0 }))
      .filter((angle) => angle.percentage === maxPercentage)
      .map((angle) => angle.index),
    count: 0
  };
}

function formatVoteTime(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-HK', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export default function VoteHistoryScreen() {
  const { user } = useAuth();
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [allVotes, setAllVotes] = useState<VoteCountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadVotes = useCallback(async (showLoader = true) => {
    if (!user) return;
    if (showLoader) setLoading(true);

    const { data, error } = await supabase
      .from('trend_votes')
      .select('trend_id, user_id, angle_index, angle_name, created_at, trends!inner(id, topic, icon, angles, deadline_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const myVotes = error ? [] : (data ?? []) as VoteRow[];
    setVotes(myVotes);

    const trendIds = [...new Set(myVotes.map((vote) => vote.trend_id).filter(Boolean))];
    if (trendIds.length === 0) {
      setAllVotes([]);
      setLoading(false);
      return;
    }

    const { data: voteRows } = await supabase
      .from('trend_votes')
      .select('trend_id, angle_index, angle_name')
      .in('trend_id', trendIds);

    setAllVotes((voteRows ?? []) as VoteCountRow[]);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadVotes();
    }, [loadVotes])
  );

  const summary = useMemo(() => {
    const closedVotes = votes.filter((vote) => isTrendClosed(normaliseTrend(vote.trends)));
    const correct = closedVotes.filter((vote) => {
      const trend = normaliseTrend(vote.trends);
      const result = resultForTrend(trend, allVotes);
      return result?.indexes.includes(vote.angle_index);
    }).length;

    return {
      total: votes.length,
      closed: closedVotes.length,
      correct
    };
  }, [allVotes, votes]);

  async function refresh() {
    setRefreshing(true);
    await loadVotes(false);
    setRefreshing(false);
  }

  return (
    <View style={styles.screen}>
      <BackHeader title="投票紀錄" />
      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>已公布結果</Text>
          <Text style={styles.summaryValue}>{summary.correct}/{summary.closed}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View>
          <Text style={styles.summaryLabel}>總投票</Text>
          <Text style={styles.summaryValue}>{summary.total}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={votes}
          keyExtractor={(item) => item.trend_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          contentContainerStyle={votes.length ? styles.list : styles.emptyList}
          ListEmptyComponent={(
            <View style={styles.emptyCard}>
              <Feather name="bar-chart-2" size={38} color="#d1d5db" />
              <Text style={styles.emptyTitle}>未有投票紀錄</Text>
              <Text style={styles.emptyBody}>去討論區投票後，結果會出現喺呢度。</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const trend = normaliseTrend(item.trends);
            const closed = isTrendClosed(trend);
            const result = resultForTrend(trend, allVotes);
            const isCorrect = closed && Boolean(result?.indexes.includes(item.angle_index));
            const resultName = result?.indexes
              .map((index) => trend?.angles?.[index]?.name)
              .filter(Boolean)
              .join(' / ');

            return (
              <View style={styles.voteCard}>
                <View style={styles.voteHeader}>
                  <Text style={styles.trendIcon}>{trend?.icon || '🔥'}</Text>
                  <View style={styles.trendTextWrap}>
                    <Text numberOfLines={2} style={styles.trendTitle}>{trend?.topic || '討論話題'}</Text>
                    <Text style={styles.voteTime}>{formatVoteTime(item.created_at)}</Text>
                  </View>
                  <View style={[styles.statusBadge, closed ? (isCorrect ? styles.correctBadge : styles.wrongBadge) : styles.pendingBadge]}>
                    <Text style={[styles.statusText, closed ? (isCorrect ? styles.correctText : styles.wrongText) : styles.pendingText]}>
                      {closed ? (isCorrect ? '估中' : '未中') : '未截止'}
                    </Text>
                  </View>
                </View>
                <View style={styles.pickRow}>
                  <Text style={styles.pickLabel}>你揀</Text>
                  <Text style={styles.pickText}>{item.angle_name || trend?.angles?.[item.angle_index]?.name || '選項'}</Text>
                </View>
                {closed && resultName ? (
                  <View style={styles.pickRow}>
                    <Text style={styles.pickLabel}>結果</Text>
                    <Text style={styles.pickText}>{resultName}</Text>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBody
  },
  summaryCard: {
    margin: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyCard,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around'
  },
  summaryLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    textAlign: 'center'
  },
  summaryValue: {
    marginTop: 6,
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    textAlign: 'center'
  },
  summaryDivider: {
    width: 1,
    height: 44,
    backgroundColor: colors.bodyBorder
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    gap: 12
  },
  emptyList: {
    flexGrow: 1,
    padding: 16,
    justifyContent: 'center'
  },
  emptyCard: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyCard,
    padding: 24
  },
  emptyTitle: {
    marginTop: 12,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 18
  },
  emptyBody: {
    marginTop: 6,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    textAlign: 'center'
  },
  voteCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    backgroundColor: colors.bgBodyCard,
    padding: 16
  },
  voteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  trendIcon: {
    fontSize: 30
  },
  trendTextWrap: {
    flex: 1
  },
  trendTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  voteTime: {
    marginTop: 4,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  correctBadge: {
    backgroundColor: '#ecfdf5'
  },
  wrongBadge: {
    backgroundColor: '#fef2f2'
  },
  pendingBadge: {
    backgroundColor: '#f3f4f6'
  },
  statusText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  correctText: {
    color: '#059669'
  },
  wrongText: {
    color: '#dc2626'
  },
  pendingText: {
    color: colors.textMuted
  },
  pickRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  pickLabel: {
    width: 42,
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13
  },
  pickText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  }
});
