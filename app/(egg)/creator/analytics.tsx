import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useMemo, useState } from "react";
import {
  Image,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { EggLoader } from "@/components/egg/EggLoader";
import Svg, { Circle, Polyline } from "react-native-svg";
import { BackHeader } from "@/components/BackHeader";
import {
  loadEggAnalytics,
  syncEggInstagram,
  type EggAnalytics,
  type EggInstagramMedia,
} from "@/lib/eggApi";
import { colors } from "@/theme/colors";
import { fonts } from "@/lib/theme";

export default function EggAnalyticsScreen() {
  const [data, setData] = useState<EggAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      setData(await loadEggAnalytics());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未能載入社交平台數據");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function sync() {
    setSyncing(true);
    setMessage("");
    setError("");
    try {
      const result = await syncEggInstagram();
      const notes = [
        result.engagementUnavailableReason,
        result.insightsUnavailableReason,
      ]
        .filter(Boolean)
        .join("；");
      setMessage(
        notes ? `Instagram 已更新；${notes}` : "Instagram 數據已更新。",
      );
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Instagram 更新失敗");
    } finally {
      setSyncing(false);
    }
  }

  const instagram = data?.instagram;
  const latest = instagram?.snapshots.at(-1);
  const previous = instagram?.snapshots.at(-2);
  const syncData = instagram?.sync;

  return (
    <SafeAreaView style={styles.safe}>
      <BackHeader title="社交平台數據" backTo="/(egg)/creator/more" />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
      >
        <View style={styles.platformHeader}>
          <View style={styles.instagramIcon}>
            <Feather name="instagram" size={22} color="white" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.platformTitle}>Instagram</Text>
            <Text style={styles.subtext}>
              @{instagram?.handle || "尚未連接"}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              instagram?.connected
                ? styles.connectedBadge
                : styles.pendingBadge,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                instagram?.connected
                  ? styles.connectedText
                  : styles.pendingText,
              ]}
            >
              {instagram?.connected ? "已連接" : "未連接"}
            </Text>
          </View>
        </View>
        {loading ? (
          <View style={styles.loading}>
            <EggLoader label="正在更新社交數據…" />
            <Text style={styles.subtext}>正在讀取 Meta 數據…</Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => void load()}>
              <Text style={styles.retry}>重試</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {!loading && instagram ? (
          <>
            <View style={styles.metricsGrid}>
              <MetricCard
                icon="users"
                label="Instagram 粉絲"
                value={formatNumber(instagram.followers)}
                trend={countTrend(instagram.followers, previous?.followers)}
              />
              <MetricCard
                icon="heart"
                label="平均互動率"
                value={
                  instagram.engagementRate == null
                    ? "—"
                    : `${Number(instagram.engagementRate).toFixed(2)}%`
                }
                trend={pointTrend(
                  instagram.engagementRate,
                  previous?.engagement_rate,
                )}
                sub={`最近 ${syncData?.engagement_sample_size ?? 0} 篇內容`}
              />
              <MetricCard
                icon="eye"
                label="7 日觸及"
                value={formatNumber(syncData?.reach_7d)}
                trend={countTrend(syncData?.reach_7d, previous?.reach_7d)}
              />
              <MetricCard
                icon="activity"
                label="7 日互動帳戶"
                value={formatNumber(syncData?.accounts_engaged_7d)}
                trend={countTrend(
                  syncData?.accounts_engaged_7d,
                  previous?.accounts_engaged_7d,
                )}
              />
              <MetricCard
                icon="message-circle"
                label="7 日總互動"
                value={formatNumber(syncData?.total_interactions_7d)}
                trend={countTrend(
                  syncData?.total_interactions_7d,
                  previous?.total_interactions_7d,
                )}
              />
            </View>
            <TrendChart snapshots={instagram.snapshots} />
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>表現最佳內容</Text>
                  <Text style={styles.subtext}>
                    按觀看、播放、觸及及互動排序
                  </Text>
                </View>
                <View style={styles.realBadge}>
                  <Text style={styles.realText}>真實 Meta 數據</Text>
                </View>
              </View>
              {instagram.topMedia.length ? (
                instagram.topMedia.map((media, index) => (
                  <MediaRow key={media.id} media={media} rank={index + 1} />
                ))
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.subtext}>尚未有 Instagram 內容數據</Text>
                </View>
              )}
            </View>
            <View style={styles.syncCard}>
              <View style={styles.syncHeader}>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>Instagram 數據</Text>
                  <Text style={styles.subtext}>
                    {syncData?.synced_at
                      ? `上次更新：${formatDateTime(syncData.synced_at)}`
                      : "尚未記錄同步時間"}
                  </Text>
                </View>
                <TouchableOpacity
                  disabled={syncing || !instagram.connected}
                  onPress={() => void sync()}
                  style={[
                    styles.syncButton,
                    (syncing || !instagram.connected) && styles.disabled,
                  ]}
                >
                  <Feather name="refresh-cw" size={15} color={colors.primary} />
                  <Text style={styles.syncButtonText}>
                    {syncing ? "更新中…" : "立即更新"}
                  </Text>
                </TouchableOpacity>
              </View>
              {message ? <Text style={styles.message}>{message}</Text> : null}
              <Text style={styles.note}>
                系統每日自動同步一次；手動更新會即時讀取 Meta Graph
                API。累積至少兩個快照後顯示升跌。
              </Text>
            </View>
            <View style={styles.card}>
              <View style={styles.platformHeaderSmall}>
                <View style={styles.threadsIcon}>
                  <Text style={styles.threadsText}>@</Text>
                </View>
                <View>
                  <Text style={styles.sectionTitle}>Threads</Text>
                  <Text style={styles.subtext}>{data?.threads.message}</Text>
                </View>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

type Trend = { direction: "up" | "down" | "flat"; label: string } | null;
function MetricCard({
  icon,
  label,
  value,
  trend,
  sub,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  trend: Trend;
  sub?: string;
}) {
  const color =
    trend?.direction === "up"
      ? "#15803d"
      : trend?.direction === "down"
        ? "#dc2626"
        : colors.textMuted;
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTop}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Feather name={icon} size={17} color={colors.primary} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      {trend ? (
        <View style={styles.trendRow}>
          <Feather
            name={
              trend.direction === "up"
                ? "arrow-up-right"
                : trend.direction === "down"
                  ? "arrow-down-right"
                  : "minus"
            }
            size={14}
            color={color}
          />
          <Text style={[styles.trendText, { color }]}>{trend.label}</Text>
        </View>
      ) : (
        <Text style={styles.noTrend}>— 暫未有比較</Text>
      )}
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
    </View>
  );
}

function TrendChart({
  snapshots,
}: {
  snapshots: EggAnalytics["instagram"]["snapshots"];
}) {
  const recent = snapshots.slice(-14);
  const points = useMemo(() => {
    if (recent.length < 2) return "";
    const values = recent.map((item) => Number(item.followers ?? 0));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    return values
      .map(
        (value, index) =>
          `${12 + index * (296 / (values.length - 1))},${94 - ((value - min) / range) * 70}`,
      )
      .join(" ");
  }, [recent]);
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>粉絲趨勢</Text>
      <Text style={styles.subtext}>最近最多 14 個每日快照</Text>
      {points ? (
        <View style={styles.chart}>
          <Svg width="100%" height="110" viewBox="0 0 320 110">
            <Polyline
              points={points}
              fill="none"
              stroke={colors.primary}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.split(" ").map((point) => {
              const [cx, cy] = point.split(",").map(Number);
              return (
                <Circle
                  key={point}
                  cx={cx}
                  cy={cy}
                  r="3.5"
                  fill="#fff"
                  stroke={colors.primary}
                  strokeWidth="2"
                />
              );
            })}
          </Svg>
          <View style={styles.chartLabels}>
            <Text style={styles.metricSub}>
              {formatShortDate(recent[0]?.snapshot_date)}
            </Text>
            <Text style={styles.metricSub}>
              {formatShortDate(recent.at(-1)?.snapshot_date)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.subtext}>累積至少兩日數據後顯示趨勢圖</Text>
        </View>
      )}
    </View>
  );
}

function MediaRow({ media, rank }: { media: EggInstagramMedia; rank: number }) {
  const image = media.thumbnail_url || media.media_url;
  const primary =
    media.views ?? media.plays ?? media.reach ?? media.total_interactions;
  const interactions =
    media.total_interactions ??
    Number(media.like_count ?? 0) + Number(media.comments_count ?? 0);
  return (
    <TouchableOpacity
      disabled={!media.permalink}
      onPress={() =>
        media.permalink && void WebBrowser.openBrowserAsync(media.permalink)
      }
      style={styles.mediaRow}
    >
      <Text style={styles.rank}>{rank}</Text>
      {image ? (
        <Image source={{ uri: image }} style={styles.mediaImage} />
      ) : (
        <View style={[styles.mediaImage, styles.mediaFallback]}>
          <Feather name="image" size={18} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.flex}>
        <Text numberOfLines={2} style={styles.mediaCaption}>
          {media.caption || "Instagram 內容"}
        </Text>
        <Text style={styles.metricSub}>
          {mediaTypeLabel(media.media_type)} ·{" "}
          {formatShortDate(media.published_at)}
        </Text>
        <Text style={styles.mediaMetrics}>
          主要表現 {formatNumber(primary)}　·　互動 {formatNumber(interactions)}
        </Text>
      </View>
      <Feather name="external-link" size={15} color="#a8a29e" />
    </TouchableOpacity>
  );
}

function countTrend(current?: number | null, previous?: number | null): Trend {
  if (current == null || previous == null || previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  return {
    direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
    label: `${Math.abs(change).toFixed(1)}%`,
  };
}
function pointTrend(current?: number | null, previous?: number | null): Trend {
  if (current == null || previous == null) return null;
  const change = current - previous;
  return {
    direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
    label: `${Math.abs(change).toFixed(2)} 點`,
  };
}
function formatNumber(value?: number | null) {
  return value == null ? "—" : Number(value).toLocaleString("zh-HK");
}
function formatShortDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-HK", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value.includes("T") ? value : `${value}T00:00:00Z`));
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));
}
function mediaTypeLabel(value: string | null) {
  if (value === "VIDEO") return "Reel／影片";
  if (value === "CAROUSEL_ALBUM") return "輪播貼文";
  if (value === "IMAGE") return "圖片貼文";
  return "Instagram 內容";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgBody },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 14,
  },
  platformHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
  },
  instagramIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#d9468f",
    alignItems: "center",
    justifyContent: "center",
  },
  platformTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 19,
  },
  subtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  connectedBadge: { backgroundColor: "#ecfdf5" },
  pendingBadge: { backgroundColor: "#f3f4f6" },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 10 },
  connectedText: { color: "#15803d" },
  pendingText: { color: colors.textMuted },
  loading: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  errorBox: {
    backgroundColor: "#fff0ef",
    borderRadius: 14,
    padding: 13,
    flexDirection: "row",
    gap: 10,
  },
  errorText: { flex: 1, color: "#b42318", fontFamily: fonts.body },
  retry: { color: colors.primary, fontFamily: fonts.bodyBold },
  metricsGrid: { gap: 10 },
  metricCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
  },
  metricTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
  },
  metricValue: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 27,
    marginTop: 3,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  trendText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  noTrend: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 11,
    marginTop: 5,
  },
  metricSub: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 10,
    marginTop: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  sectionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  realBadge: {
    backgroundColor: "#ecfdf5",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  realText: { color: "#15803d", fontFamily: fonts.bodyBold, fontSize: 9 },
  chart: { marginTop: 10 },
  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 10,
  },
  empty: { minHeight: 100, alignItems: "center", justifyContent: "center" },
  mediaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rank: {
    width: 14,
    textAlign: "center",
    color: "#a8a29e",
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
  mediaImage: {
    width: 58,
    height: 58,
    borderRadius: 11,
    backgroundColor: "#f3f4f6",
  },
  mediaFallback: { alignItems: "center", justifyContent: "center" },
  mediaCaption: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  mediaMetrics: {
    color: "#56504c",
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    marginTop: 4,
  },
  syncCard: { backgroundColor: "#f0ece9", borderRadius: 18, padding: 15 },
  syncHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  syncButtonText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
  disabled: { opacity: 0.45 },
  message: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  note: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 10,
  },
  platformHeaderSmall: { flexDirection: "row", alignItems: "center", gap: 12 },
  threadsIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  threadsText: { color: "#fff", fontFamily: fonts.bodyBold, fontSize: 22 },
});
