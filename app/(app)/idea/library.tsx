import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Callout, Marker } from 'react-native-maps';
import { RegionFilter } from '@/components/RegionFilter';
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

const platformConfig: Record<string, { label: string; bg: string; color: string }> = {
  instagram: { label: 'IG REEL', bg: '#E94B8A', color: '#FFFFFF' },
  tiktok: { label: 'TIKTOK', bg: '#111111', color: '#FFFFFF' },
  xiaohongshu: { label: '小紅書', bg: '#E53935', color: '#FFFFFF' },
  web: { label: 'WEB', bg: '#E8E2D9', color: colors.textMuted }
};

function getPotential(value: unknown) {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return potentialConfig[value];
  }

  return potentialConfig.medium;
}

function getPlatform(value: unknown) {
  const key = typeof value === 'string' ? value.toLowerCase() : 'web';
  return platformConfig[key] ?? platformConfig.web;
}

function formatTime(value?: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-HK', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function hasCoordinates(idea: Idea) {
  return typeof idea.lat === 'number' && typeof idea.lng === 'number';
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radiusKm = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function IdeaCard({ item }: { item: Idea }) {
  const router = useRouter();
  const potential = getPotential(item.viral_potential) ?? { label: '中潛力', color: colors.gold };
  const platform = getPlatform(item.platform);
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const viralScore = Number(item.viral_score ?? 0);
  const sourceUrl = item.url || item.source_url;
  const summary = item.summary || item.description || '';
  const hook = item.script_hook || item.hook || '';
  const country = item.country || item.region || 'HK';
  const timestamp = formatTime(item.date || item.created_at);
  const placeName = item.place_name || item.shop_name || '';

  async function openSource() {
    if (!sourceUrl) return;
    await Linking.openURL(sourceUrl);
  }

  return (
    <Pressable onPress={openSource} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Pressable
        style={styles.scriptQuickButton}
        onPress={(event) => {
          event.stopPropagation();
          router.push(`/idea/${item.id}`);
        }}
      >
        <Text style={styles.scriptQuickText}>🎬</Text>
      </Pressable>
      <View style={styles.metaRow}>
        {viralScore > 0 ? (
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreText}>{Math.round(viralScore)}</Text>
          </View>
        ) : (
          <View style={styles.potentialRow}>
            <View style={[styles.dot, { backgroundColor: potential.color || colors.gold }]} />
            <Text style={styles.potentialText}>{potential.label || '中潛力'}</Text>
          </View>
        )}
        <View style={styles.badgeCluster}>
          <Text style={[styles.platformBadge, { backgroundColor: platform.bg, color: platform.color }]}>{platform.label}</Text>
          <Text style={styles.countryBadge}>{country}</Text>
        </View>
      </View>
      <Text numberOfLines={2} style={styles.cardTitle}>{item.title || '未命名題材'}</Text>
      {summary ? <Text numberOfLines={2} style={styles.description}>{summary}</Text> : null}
      {hook ? (
        <View style={styles.hookPreview}>
          <Text numberOfLines={1} style={styles.hookText}>{hook}</Text>
        </View>
      ) : null}
      {placeName ? <Text numberOfLines={1} style={styles.place}>📍 {placeName}</Text> : null}
      <View style={styles.detailRow}>
        {tags.slice(0, 3).map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}
      </View>
      {timestamp ? <Text style={styles.timestamp}>{timestamp}</Text> : null}
    </Pressable>
  );
}

export default function IdeasLibraryScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const loadIdeas = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setIdeas([]);
      return;
    }

    const filtered = regionFilter
      ? (data ?? []).filter((idea) => idea.country === regionFilter || idea.region === regionFilter)
      : data ?? [];
    setIdeas(filtered as Idea[]);
  }, [regionFilter, user]);

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

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude
      });
    })().catch(() => undefined);
  }, []);

  const mappableIdeas = useMemo(() => ideas.filter(hasCoordinates), [ideas]);
  const nearbyCount = useMemo(() => {
    if (!userLocation) return 0;
    return mappableIdeas.filter((idea) =>
      haversineDistance(userLocation.lat, userLocation.lng, idea.lat!, idea.lng!) <= 50
    ).length;
  }, [mappableIdeas, userLocation]);

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
        <View style={styles.headerActions}>
          <Pressable onPress={() => setViewMode((current) => current === 'list' ? 'map' : 'list')} style={styles.iconButton}>
            <Text style={styles.viewToggle}>{viewMode === 'list' ? '🗺️' : '≡'}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/idea/share')} style={styles.addButton}>
            <Text style={styles.addText}>＋</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.regionFilterWrap}>
        <RegionFilter selected={regionFilter} onChange={setRegionFilter} />
      </View>

      {viewMode === 'list' ? (
        <FlatList
          data={ideas}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <IdeaCard item={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />}
          contentContainerStyle={ideas.length ? styles.list : styles.emptyList}
          ListEmptyComponent={<EmptyState title="題材庫係空嘅" body={'喺 IG 睇到好 Reel，Share 入嚟即可'} />}
        />
      ) : (
        <View style={styles.mapWrap}>
          {userLocation ? (
            <View style={styles.nearbyBadge}>
              <Text style={styles.nearbyText}>📍 附近 {nearbyCount} 個題材</Text>
            </View>
          ) : null}
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: userLocation?.lat ?? 22.3193,
              longitude: userLocation?.lng ?? 114.1694,
              latitudeDelta: 0.5,
              longitudeDelta: 0.5
            }}
            showsUserLocation
            showsMyLocationButton
          >
            {mappableIdeas.map((idea) => (
              <Marker
                key={idea.id}
                coordinate={{ latitude: idea.lat!, longitude: idea.lng! }}
                pinColor={colors.accent}
              >
                <Callout onPress={() => router.push(`/idea/${idea.id}`)}>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle}>{idea.title || '未命名題材'}</Text>
                    <Text style={styles.calloutSummary} numberOfLines={2}>{idea.summary || idea.description || ''}</Text>
                    <Text style={styles.calloutLink}>點擊睇詳情 →</Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>
          {mappableIdeas.length === 0 ? (
            <View style={styles.mapEmpty}>
              <Text style={styles.mapEmptyTitle}>未有可定位題材</Text>
              <Text style={styles.mapEmptyBody}>有地點資料嘅 idea 會喺呢度變成 pin。</Text>
            </View>
          ) : null}
        </View>
      )}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgMuted
  },
  viewToggle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 20
  },
  addText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 24
  },
  regionFilterWrap: {
    paddingHorizontal: 18,
    paddingBottom: 12
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
    position: 'relative',
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
  scriptQuickButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBF4EE',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  scriptQuickText: {
    fontSize: 16
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
  scoreBadge: {
    minWidth: 42,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0EE'
  },
  scoreText: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  badgeCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  platformBadge: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  countryBadge: {
    color: colors.textMuted,
    backgroundColor: colors.bgMuted,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 9,
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
  hookPreview: {
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    paddingLeft: 10,
    paddingVertical: 2
  },
  hookText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18
  },
  place: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12
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
  },
  mapWrap: {
    flex: 1,
    marginHorizontal: 18,
    marginBottom: 24,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgMuted
  },
  map: {
    flex: 1,
    minHeight: 520
  },
  nearbyBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 2,
    borderRadius: 999,
    backgroundColor: colors.bgCard,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  nearbyText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 12
  },
  callout: {
    width: 200,
    padding: 8,
    gap: 4
  },
  calloutTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13
  },
  calloutSummary: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15
  },
  calloutLink: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    marginTop: 2
  },
  mapEmpty: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    padding: 14,
    gap: 4
  },
  mapEmptyTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14
  },
  mapEmptyBody: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12
  }
});
