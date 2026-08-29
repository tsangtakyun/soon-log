import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BackHeader } from "@/components/BackHeader";
import { colors } from "@/theme/colors";
import { fonts } from "@/lib/theme";
import { EggTopicIdea, loadEggTopics, updateEggTopic } from "@/lib/eggApi";

export default function EggTopicsScreen() {
  const [ideas, setIdeas] = useState<EggTopicIdea[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [location, setLocation] = useState("全部地區");
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { setIdeas(await loadEggTopics()); } catch (error) { Alert.alert("未能載入", error instanceof Error ? error.message : "請稍後再試"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const categories = useMemo(() => ["全部", ...Array.from(new Set(ideas.map((idea) => idea.category)))], [ideas]);
  const locations = useMemo(() => ["全部地區", ...Array.from(new Set(ideas.flatMap((idea) => [...(idea.localities ?? []), ...(idea.regions ?? []), ...(idea.countries ?? [])])))], [ideas]);
  const filtered = useMemo(() => { const value = query.trim().toLowerCase(); return ideas.filter((idea) => (category === "全部" || idea.category === category) && (location === "全部地區" || [...(idea.localities ?? []), ...(idea.regions ?? []), ...(idea.countries ?? [])].includes(location)) && (!value || [idea.title, idea.summary, idea.source_name, ...idea.tags].filter(Boolean).join(" ").toLowerCase().includes(value))); }, [category, ideas, location, query]);

  async function act(idea: EggTopicIdea, action: "save" | "create" | "dismiss") {
    setPendingId(idea.id);
    try {
      await updateEggTopic(idea.id, action);
      if (action === "dismiss") setIdeas((current) => current.filter((item) => item.id !== idea.id));
      else setIdeas((current) => current.map((item) => item.id === idea.id ? { ...item, saved: true, want_to_create: action === "create" } : item));
      if (action === "create") router.push({ pathname: "/creator/script", params: { topic: idea.title, background: idea.summary ?? "" } } as never);
    } catch (error) { Alert.alert("操作失敗", error instanceof Error ? error.message : "請稍後再試"); } finally { setPendingId(null); }
  }

  return <View style={styles.screen}>
    <BackHeader title="題材靈感庫" backTo="/creator/home" />
    <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>SOON 為你整理可靠來源同可拍角度。向下刷新，即可取得最新一批靈感。</Text>
      <View style={styles.searchRow}><Feather name="search" size={18} color={colors.textMuted} /><TextInput value={query} onChangeText={setQuery} placeholder="搜尋題材、來源或標籤" placeholderTextColor={colors.textMuted} style={styles.searchInput} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>{categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.category, category === item && styles.categoryActive]}><Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text></Pressable>)}</ScrollView>
      {locations.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.locations}>{locations.map((item) => <Pressable key={item} onPress={() => setLocation(item)} style={[styles.location, location === item && styles.locationActive]}><Feather name="map-pin" size={12} color={location === item ? "#92400e" : colors.textMuted} /><Text style={[styles.locationText, location === item && styles.locationTextActive]}>{item}</Text></Pressable>)}</ScrollView> : null}
      {loading && !ideas.length ? <ActivityIndicator color={colors.primary} /> : null}
      {filtered.map((idea) => <View key={idea.id} style={styles.card}>
        {idea.image_url ? <Image source={{ uri: idea.image_url }} resizeMode="cover" style={styles.cover} /> : null}
        <View style={styles.cardTop}><Text style={styles.meta}>{idea.platform} · {idea.category}</Text><Feather name="zap" size={17} color="#b45309" /></View>
        {idea.recommended ? <View style={styles.recommended}><Text style={styles.recommendedText}>為你推薦</Text></View> : null}
        <Text style={styles.title}>{idea.title}</Text>{idea.summary ? <Text style={styles.summary}>{idea.summary}</Text> : null}
        {idea.why_now ? <View style={styles.whyNow}><Text style={styles.whyNowText}><Text style={styles.whyNowStrong}>點解值得留意：</Text>{idea.why_now}</Text></View> : null}
        {idea.hook ? <Text style={styles.hook}><Text style={styles.hookStrong}>開場 Hook：</Text>{idea.hook}</Text> : null}
        <View style={styles.tags}>{idea.tags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}</View>
        {idea.source_url ? <Pressable onPress={() => void WebBrowser.openBrowserAsync(idea.source_url!)} style={styles.source}><Text style={styles.sourceText}>{idea.source_name || "查看原文"}</Text><Feather name="external-link" size={13} color={colors.textMuted} /></Pressable> : null}
        <View style={styles.actions}><Action icon="bookmark" label={idea.saved ? "已收藏" : "收藏"} active={idea.saved} disabled={pendingId !== null} onPress={() => void act(idea, "save")} /><Action icon="thumbs-down" label="不合適" disabled={pendingId !== null} onPress={() => void act(idea, "dismiss")} /><Action icon="video" label="想拍" primary disabled={pendingId !== null} onPress={() => void act(idea, "create")} /></View>
      </View>)}
      {!loading && !filtered.length ? <Text style={styles.empty}>暫時未有符合條件嘅題材。</Text> : null}
    </ScrollView>
  </View>;
}

function Action({ icon, label, onPress, active, primary, disabled }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; active?: boolean; primary?: boolean; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.action, active && styles.actionActive, primary && styles.actionPrimary]}><Feather name={icon} size={14} color={primary ? "#fff" : active ? "#92400e" : colors.textMuted} /><Text style={[styles.actionText, active && styles.actionTextActive, primary && styles.actionTextPrimary]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: 18, paddingBottom: 110, gap: 14 }, lead: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }, searchRow: { flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.bgCard, paddingHorizontal: 13 }, searchInput: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 14, paddingVertical: 13 }, categories: { gap: 8 }, category: { borderRadius: 999, backgroundColor: "#f3f4f6", paddingHorizontal: 14, paddingVertical: 8 }, categoryActive: { backgroundColor: colors.text }, categoryText: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 12 }, categoryTextActive: { color: "#fff" }, locations: { gap: 7 }, location: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 4 }, locationActive: { borderColor: "#f59e0b", backgroundColor: "#fffbeb" }, locationText: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 11 }, locationTextActive: { color: "#92400e" }, card: { overflow: "hidden", borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, padding: 17, gap: 12 }, cover: { height: 210, marginHorizontal: -17, marginTop: -17, marginBottom: 2, backgroundColor: "#f3f4f6" }, cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, meta: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }, recommended: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#fbbf24", paddingHorizontal: 9, paddingVertical: 5 }, recommendedText: { color: "#18181b", fontFamily: fonts.bodyBold, fontSize: 11 }, title: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 21, lineHeight: 28 }, summary: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }, whyNow: { borderRadius: 12, backgroundColor: "#fffbeb", padding: 10 }, whyNowText: { color: "#78350f", fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }, whyNowStrong: { fontFamily: fonts.bodyBold }, hook: { color: colors.text, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }, hookStrong: { fontFamily: fonts.bodyBold }, tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, tag: { borderRadius: 999, backgroundColor: "#f3f4f6", paddingHorizontal: 9, paddingVertical: 5 }, tagText: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 11 }, source: { flexDirection: "row", alignItems: "center", gap: 5 }, sourceText: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 12, textDecorationLine: "underline" }, actions: { flexDirection: "row", gap: 7, paddingTop: 4 }, action: { flex: 1, minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }, actionActive: { backgroundColor: "#fffbeb", borderColor: "#fcd34d" }, actionPrimary: { backgroundColor: colors.text, borderColor: colors.text }, actionText: { color: colors.textMuted, fontFamily: fonts.bodyBold, fontSize: 11 }, actionTextActive: { color: "#92400e" }, actionTextPrimary: { color: "#fff" }, empty: { color: colors.textMuted, fontFamily: fonts.body, textAlign: "center", paddingVertical: 48 },
});
