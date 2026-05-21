import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { fonts } from '@/lib/theme';
import { colors } from '@/theme/colors';
import { Idea } from '@/types';

export default function IdeaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [idea, setIdea] = useState<Idea | null>(null);

  const loadIdea = useCallback(async () => {
    if (!id || !user) return;

    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Idea detail fetch error:', JSON.stringify(error));
      return;
    }

    setIdea(data as Idea | null);
  }, [id, user]);

  useEffect(() => {
    loadIdea();
  }, [loadIdea]);

  const sourceUrl = idea?.url || idea?.source_url;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>題材詳情</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {idea ? (
          <>
            <View style={styles.metaRow}>
              <Text style={styles.platform}>{idea.platform || 'web'}</Text>
              <Text style={styles.country}>{idea.country || idea.region || 'HK'}</Text>
            </View>

            <Text style={styles.title}>{idea.title || '未命名題材'}</Text>

            {idea.summary || idea.description ? (
              <Text style={styles.summary}>{idea.summary || idea.description}</Text>
            ) : null}

            {idea.script_hook || idea.hook ? (
              <View style={styles.hookBox}>
                <Text style={styles.hookLabel}>Hook</Text>
                <Text style={styles.hookText}>{idea.script_hook || idea.hook}</Text>
              </View>
            ) : null}

            {idea.place_name || idea.shop_name || idea.place_address ? (
              <View style={styles.placeBox}>
                <Text style={styles.placeTitle}>📍 到埗發現</Text>
                {idea.place_name || idea.shop_name ? <Text style={styles.placeText}>{idea.place_name || idea.shop_name}</Text> : null}
                {idea.place_address ? <Text style={styles.placeMuted}>{idea.place_address}</Text> : null}
              </View>
            ) : null}

            {idea.notes ? (
              <View style={styles.notesBox}>
                <Text style={styles.notesLabel}>筆記</Text>
                <Text style={styles.notesText}>{idea.notes}</Text>
              </View>
            ) : null}

            {sourceUrl ? (
              <Pressable onPress={() => Linking.openURL(sourceUrl)} style={styles.sourceButton}>
                <Text style={styles.sourceButtonText}>打開原始連結</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Text style={styles.empty}>搵唔到呢個題材。</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 58,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMuted
  },
  backText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 30,
    lineHeight: 34
  },
  headerTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16
  },
  content: {
    padding: 18,
    paddingBottom: 40,
    gap: 16
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8
  },
  platform: {
    color: '#FFFFFF',
    backgroundColor: colors.accent,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  country: {
    color: colors.textMuted,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  title: {
    color: colors.text,
    fontFamily: fonts.heading,
    fontSize: 34,
    lineHeight: 40
  },
  summary: {
    color: '#3A3A3A',
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 25
  },
  hookBox: {
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
    backgroundColor: '#FFF9ED',
    borderRadius: 12,
    padding: 14,
    gap: 6
  },
  hookLabel: {
    color: colors.gold,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  hookText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 23
  },
  placeBox: {
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 5
  },
  placeTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  placeText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15
  },
  placeMuted: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13
  },
  notesBox: {
    borderRadius: 14,
    backgroundColor: colors.bgMuted,
    padding: 14,
    gap: 6
  },
  notesLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  notesText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23
  },
  sourceButton: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold
  },
  sourceButtonText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15
  },
  empty: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15
  }
});
