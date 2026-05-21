import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Idea, ViralPotential } from '@/types';

const potentialConfig: Record<ViralPotential, { label: string; color: string }> = {
  high: { label: '高潛力', color: colors.accent },
  medium: { label: '中潛力', color: colors.gold },
  low: { label: '低潛力', color: colors.textMuted }
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-HK', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function IdeaCard({ item }: { item: Idea }) {
  const potential = potentialConfig[item.viral_potential];

  async function openSource() {
    if (!item.source_url) return;
    await Linking.openURL(item.source_url);
  }

  return (
    <Pressable onPress={openSource} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.metaRow}>
        <View style={styles.potentialRow}>
          <View style={[styles.dot, { backgroundColor: potential.color }]} />
          <Text style={styles.potentialText}>{potential.label}</Text>
        </View>
        <Text style={styles.platformBadge}>{item.platform}</Text>
      </View>
      <Text numberOfLines={2} style={styles.cardTitle}>{item.title || '未命名題材'}</Text>
      {item.description ? <Text numberOfLines={2} style={styles.description}>{item.description}</Text> : null}
      <View style={styles.detailRow}>
        <Text style={styles.region}>{item.region}</Text>
        {item.tags.slice(0, 4).map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}
      </View>
      <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
    </Pressable>
  );
}

export default function IdeasLibraryScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadIdeas = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Ideas fetch error:', JSON.stringify(error));
      setIdeas([]);
      return;
    }

    setIdeas((data ?? []) as Idea[]);
  }, [user]);

  useEffect(() => {
    loadIdeas();
    const channel = supabase
      .channel('ideas-library')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, () => loadIdeas())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadIdeas]);

  async function refresh() {
    setRefreshing(true);
    await loadIdeas();
    setRefreshing(false);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>IDEA LIBRARY</Text>
          <Text style={styles.title}>◈ 題材庫</Text>
          <Text style={styles.subtitle}>已儲存嘅創作靈感</Text>
        </View>
        <Pressable onPress={() => router.push('/idea/share')} style={styles.addButton}>
          <Text style={styles.addText}>＋</Text>
        </Pressable>
      </View>

      <FlatList
        data={ideas}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <IdeaCard item={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
        contentContainerStyle={ideas.length ? styles.list : styles.emptyList}
        ListEmptyComponent={<EmptyState title="題材庫係空嘅" body={'喺 IG 睇到好 Reel，Share 入嚟即可'} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 58,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  kicker: {
    color: colors.gold,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  title: {
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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold
  },
  addText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 24
  },
  list: {
    paddingHorizontal: 18,
    paddingBottom: 34,
    gap: 14
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22
  },
  card: {
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    gap: 10
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10
  },
  potentialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5
  },
  potentialText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  platformBadge: {
    color: colors.purple,
    backgroundColor: '#F0EAFE',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  cardTitle: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 24,
    lineHeight: 30
  },
  description: {
    color: '#3A3A3A',
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  region: {
    color: colors.text,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  tag: {
    color: colors.textMuted,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  timestamp: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  },
  pressed: {
    opacity: 0.74
  }
});
