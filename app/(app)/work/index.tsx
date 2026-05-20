import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PriorityBadge } from '@/components/PriorityBadge';
import { EmptyState, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Profile, WorkItem, WorkStatus } from '@/types';

const COLUMNS: { key: WorkStatus; label: string; color: string }[] = [
  { key: 'todo', label: '待辦', color: '#888880' },
  { key: 'in_progress', label: '進行中', color: '#E8614A' },
  { key: 'done', label: '完成', color: '#4ACC7A' },
  { key: 'blocked', label: '阻塞', color: '#CC4444' }
];

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('zh-HK', { month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function Avatar({ profile }: { profile?: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null }) {
  const name = profile?.display_name ?? profile?.username ?? 'S';
  if (profile?.avatar_url) {
    return <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />;
  }
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

function WorkCard({ item }: { item: WorkItem }) {
  const router = useRouter();
  const dueDate = formatDate(item.due_date);

  return (
    <Pressable onPress={() => router.push(`/work/${item.id}`)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        {item.assignee ? <Avatar profile={item.assignee} /> : null}
      </View>
      {item.description ? <Text numberOfLines={2} style={styles.description}>{item.description}</Text> : null}
      <View style={styles.metaRow}>
        <PriorityBadge priority={item.priority} />
        {dueDate ? <Text style={styles.dueDate}>到期 {dueDate}</Text> : null}
      </View>
      {item.tags.length > 0 ? (
        <View style={styles.tags}>
          {item.tags.slice(0, 3).map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}
        </View>
      ) : null}
    </Pressable>
  );
}

export default function WorkBoardScreen() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('work_items')
      .select('*, assignee:profiles!work_items_assignee_id_fkey(id, username, display_name, avatar_url)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Work items fetch error:', JSON.stringify(error));
      setItems([]);
    } else {
      setItems((data ?? []) as WorkItem[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
    const channel = supabase
      .channel('work-items-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_items' }, () => loadItems())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadItems]);

  const grouped = useMemo(() => {
    return COLUMNS.reduce<Record<WorkStatus, WorkItem[]>>((acc, column) => {
      acc[column.key] = items.filter((item) => item.status === column.key);
      return acc;
    }, { todo: [], in_progress: [], done: [], blocked: [] });
  }, [items]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.kicker}>SOON CORE</Text>
        <Text style={styles.title}>我的工作板</Text>
        <Text style={styles.subtitle}>任務、製作進度同今日要交付嘅事</Text>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.length === 0 ? <EmptyState title="未有任務" body="新增第一個任務，將創作流程排好。" /> : null}
          {COLUMNS.map((column) => (
            <View key={column.key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.dot, { backgroundColor: column.color }]} />
                <Text style={styles.sectionTitle}>{column.label}</Text>
                <Text style={styles.count}>{grouped[column.key].length}</Text>
              </View>
              <View style={styles.cards}>
                {grouped[column.key].map((item) => <WorkCard key={item.id} item={item} />)}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Pressable onPress={() => router.push('/work/create')} style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
        <Text style={styles.fabText}>＋ 新增任務</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 18
  },
  kicker: {
    color: colors.accent,
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
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 116,
    gap: 18
  },
  section: {
    gap: 10
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 17
  },
  count: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 14
  },
  cards: {
    gap: 10
  },
  card: {
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    padding: 16,
    gap: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  pressed: {
    opacity: 0.72
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    lineHeight: 22
  },
  description: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap'
  },
  dueDate: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  tag: {
    color: colors.textMuted,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bgMuted
  },
  avatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMuted
  },
  avatarText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 96,
    minHeight: 52,
    borderRadius: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
  },
  fabText: {
    color: colors.bgCard,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  }
});
