import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { LogCard } from '@/components/LogCard';
import { EmptyState, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useFeed } from '@/hooks/useFeed';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';

export default function FeedScreen() {
  const { user } = useAuth();
  const { logs, loading, refreshing, refresh, loadMore } = useFeed(user?.id);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.doodle}>✦</Text>
          <Text style={styles.brand}>SOON LOG</Text>
        </View>
        <Text style={styles.subtitle}>今日靈感、幕後筆記同創作者日常</Text>
      </View>
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <LogCard log={item} />}
          refreshing={refreshing}
          onRefresh={refresh}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListEmptyComponent={<EmptyState title="暫時未有紀錄" body="第一篇 SOON-LOG 很快就會出現。" />}
          style={styles.list}
          contentContainerStyle={logs.length === 0 ? styles.emptyList : styles.listContent}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 58,
    paddingBottom: 18,
    backgroundColor: colors.bg
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  doodle: {
    color: colors.gold,
    fontFamily: fonts.bodyBold,
    fontSize: 22
  },
  brand: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 38,
    lineHeight: 42
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    marginTop: 4
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center'
  },
  list: {
    backgroundColor: colors.bg
  },
  listContent: {
    paddingBottom: 24
  }
});
