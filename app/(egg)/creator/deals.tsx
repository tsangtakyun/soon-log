import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BackHeader } from "@/components/BackHeader";
import {
  loadEggDeals,
  updateEggDeal,
  type EggCampaign,
  type EggDealRecord,
  type EggDeals,
} from "@/lib/eggApi";
import { fonts } from "@/lib/theme";
import { colors } from "@/theme/colors";

type Tab = "attention" | "open" | "mine";

export default function EggDealsScreen() {
  const [data, setData] = useState<EggDeals | null>(null);
  const [tab, setTab] = useState<Tab>("attention");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<EggCampaign | null>(null);
  const [applying, setApplying] = useState<EggCampaign | null>(null);
  const [pitch, setPitch] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await loadEggDeals());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未能載入合作機會");
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

  const pending =
    data?.invitations.filter((item) => item.status === "pending") ?? [];
  const appliedIds = useMemo(
    () => new Set(data?.applications.map((item) => item.cw_campaign_id) ?? []),
    [data],
  );
  const mine = useMemo(
    () =>
      [
        ...(data?.applications ?? []),
        ...(data?.invitations ?? []).filter(
          (item) =>
            item.status !== "pending" &&
            item.status !== "declined" &&
            !appliedIds.has(item.cw_campaign_id),
        ),
      ].sort((a, b) =>
        String(b.applied_at || b.sent_at || "").localeCompare(
          String(a.applied_at || a.sent_at || ""),
        ),
      ),
    [appliedIds, data],
  );

  async function respond(item: EggDealRecord, status: "accepted" | "declined") {
    setSaving(true);
    try {
      await updateEggDeal({ action: "respond", invitationId: item.id, status });
      await load();
    } catch (cause) {
      Alert.alert(
        "未能回覆",
        cause instanceof Error ? cause.message : "請稍後再試",
      );
    } finally {
      setSaving(false);
    }
  }
  async function apply() {
    if (!applying) return;
    setSaving(true);
    try {
      await updateEggDeal({ action: "apply", campaignId: applying.id, pitch });
      setApplying(null);
      setPitch("");
      setTab("mine");
      await load();
      Alert.alert("申請已送出", "品牌已收到你的資料及 Media Kit。");
    } catch (cause) {
      Alert.alert(
        "申請失敗",
        cause instanceof Error ? cause.message : "請稍後再試",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <BackHeader title="合作機會" backTo="/(egg)/creator/more" />
      <View style={styles.tabs}>
        {(
          [
            ["attention", `待你處理 ${pending.length || ""}`],
            ["open", "公開招募"],
            ["mine", "我的合作"],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>載入合作資料中…</Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={styles.retry}>重試</Text>
            </Pressable>
          </View>
        ) : null}
        {!loading && !error && tab === "attention" ? (
          pending.length ? (
            pending.map((item) => (
              <InvitationCard
                key={item.id}
                item={item}
                saving={saving}
                onRespond={respond}
              />
            ))
          ) : (
            <Empty
              icon="inbox"
              title="暫時未有待回覆邀請"
              text="品牌直接邀請你時，會顯示喺呢度。"
            />
          )
        ) : null}
        {!loading && !error && tab === "open" ? (
          data?.campaigns.length ? (
            data.campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                applied={appliedIds.has(campaign.id)}
                onView={() => setSelected(campaign)}
                onApply={() => {
                  setPitch("");
                  setApplying(campaign);
                }}
              />
            ))
          ) : (
            <Empty
              icon="search"
              title="暫時未有公開招募"
              text="目前所有 Campaign 都未開放 KOL 申請；有新機會時會自動顯示。"
            />
          )
        ) : null}
        {!loading && !error && tab === "mine" ? (
          mine.length ? (
            mine.map((item) => (
              <DealCard key={`${item.id}-${item.status}`} item={item} />
            ))
          ) : (
            <Empty
              icon="briefcase"
              title="未有合作記錄"
              text="申請公開 Campaign 或接受品牌邀請後，進度會顯示喺呢度。"
            />
          )
        ) : null}
      </ScrollView>
      <CampaignModal
        campaign={selected}
        onClose={() => setSelected(null)}
        onApply={() => {
          if (selected) setApplying(selected);
          setSelected(null);
        }}
        applied={selected ? appliedIds.has(selected.id) : false}
      />
      <ApplyModal
        campaign={applying}
        pitch={pitch}
        setPitch={setPitch}
        saving={saving}
        onClose={() => setApplying(null)}
        onSubmit={apply}
      />
    </SafeAreaView>
  );
}

function CampaignCard({
  campaign,
  applied,
  onView,
  onApply,
}: {
  campaign: EggCampaign;
  applied: boolean;
  onView: () => void;
  onApply: () => void;
}) {
  return (
    <View style={styles.card}>
      {campaign.cover_image_url ? (
        <Image
          source={{ uri: campaign.cover_image_url }}
          style={styles.cover}
        />
      ) : null}
      <View style={styles.cardBody}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.title}>{campaign.name}</Text>
            <Text style={styles.muted}>
              {campaign.workspaces?.name || "SOON Creator Network"}
            </Text>
          </View>
          <StatusBadge
            status={campaign.status === "active" ? "open" : "upcoming"}
          />
        </View>
        {campaign.theme ? (
          <Text numberOfLines={3} style={styles.body}>
            {campaign.theme}
          </Text>
        ) : null}
        <View style={styles.tags}>
          {campaign.budget_range ? <Tag text={campaign.budget_range} /> : null}
          {campaign.collab_formats?.slice(0, 3).map((item) => (
            <Tag key={item} text={item} />
          ))}
        </View>
        <View style={styles.actions}>
          <Pressable onPress={onView} style={styles.secondary}>
            <Text style={styles.secondaryText}>查看詳情</Text>
          </Pressable>
          <Pressable
            disabled={applied}
            onPress={onApply}
            style={[styles.primary, applied && styles.disabled]}
          >
            <Text style={styles.primaryText}>
              {applied ? "已申請" : "申請合作"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
function InvitationCard({
  item,
  saving,
  onRespond,
}: {
  item: EggDealRecord;
  saving: boolean;
  onRespond: (item: EggDealRecord, status: "accepted" | "declined") => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.title}>{item.campaign_name || "品牌邀請"}</Text>
            <Text style={styles.muted}>{item.brand_name || "未命名品牌"}</Text>
          </View>
          <StatusBadge status="pending" />
        </View>
        {item.message ? (
          <View style={styles.messageBox}>
            <Text style={styles.body}>{item.message}</Text>
          </View>
        ) : null}
        {item.theme ? <Text style={styles.body}>{item.theme}</Text> : null}
        <View style={styles.tags}>
          {item.budget_range ? <Tag text={item.budget_range} /> : null}
          {item.collab_formats?.map((value) => (
            <Tag key={value} text={value} />
          ))}
        </View>
        <View style={styles.actions}>
          <Pressable
            disabled={saving}
            onPress={() => onRespond(item, "declined")}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>婉拒</Text>
          </Pressable>
          <Pressable
            disabled={saving}
            onPress={() => onRespond(item, "accepted")}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>
              {saving ? "同步中…" : "接受邀請"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
function DealCard({ item }: { item: EggDealRecord }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.title}>{item.campaign_name || "合作項目"}</Text>
            <Text style={styles.muted}>
              {item.brand_name || "SOON Creator Network"}
            </Text>
          </View>
          <StatusBadge status={item.status} />
        </View>
        {item.theme ? (
          <Text numberOfLines={2} style={styles.body}>
            {item.theme}
          </Text>
        ) : null}
        <Progress status={item.status} />
      </View>
    </View>
  );
}
function Progress({ status }: { status: string }) {
  const steps = ["applied", "accepted", "in_progress", "completed"];
  const current = status === "invited" ? 0 : Math.max(0, steps.indexOf(status));
  return (
    <View style={styles.progress}>
      {steps.map((step, index) => (
        <View key={step} style={styles.progressItem}>
          <View style={[styles.dot, index <= current && styles.dotActive]} />
          <Text
            style={[
              styles.progressText,
              index <= current && styles.progressTextActive,
            ]}
          >
            {statusLabel(step)}
          </Text>
        </View>
      ))}
    </View>
  );
}
function CampaignModal({
  campaign,
  onClose,
  onApply,
  applied,
}: {
  campaign: EggCampaign | null;
  onClose: () => void;
  onApply: () => void;
  applied: boolean;
}) {
  if (!campaign) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{campaign.name}</Text>
            <Pressable onPress={onClose}>
              <Feather name="x" size={24} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <Info label="品牌" value={campaign.workspaces?.name} />
            <Info label="合作預算" value={campaign.budget_range} />
            <Info label="開始日期" value={campaign.starts_on} />
            <Info label="申請截止" value={campaign.application_deadline} />
            <Block label="活動簡介" value={campaign.theme} />
            <Block label="品牌介紹" value={campaign.brand_overview} />
            <Block label="目標受眾" value={campaign.target_audience} />
            <Block
              label="合作內容"
              value={campaign.collab_formats?.join("、")}
            />
            {campaign.brand_website ? (
              <Pressable
                onPress={() =>
                  void WebBrowser.openBrowserAsync(campaign.brand_website!)
                }
              >
                <Text style={styles.link}>查看品牌網站 ↗</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          <Pressable
            disabled={applied}
            onPress={onApply}
            style={[styles.sheetButton, applied && styles.disabled]}
          >
            <Text style={styles.primaryText}>
              {applied ? "已申請" : "申請合作"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
function ApplyModal({
  campaign,
  pitch,
  setPitch,
  saving,
  onClose,
  onSubmit,
}: {
  campaign: EggCampaign | null;
  pitch: string;
  setPitch: (v: string) => void;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      visible={Boolean(campaign)}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.applySheet}>
          <Text style={styles.sheetTitle}>{campaign?.name}</Text>
          <Text style={styles.muted}>
            品牌會收到你的創作者資料及 Media Kit。
          </Text>
          <Text style={styles.label}>你的 Pitch（選填）</Text>
          <TextInput
            value={pitch}
            onChangeText={setPitch}
            multiline
            maxLength={1500}
            style={styles.input}
            placeholder="簡單介紹你點解適合呢個合作…"
            placeholderTextColor="#a8a29e"
          />
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.secondary}>
              <Text style={styles.secondaryText}>取消</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              onPress={onSubmit}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>
                {saving ? "提交中…" : "確認申請"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
function StatusBadge({ status }: { status: string }) {
  const label = statusLabel(status);
  const positive = ["accepted", "in_progress", "completed", "open"].includes(
    status,
  );
  return (
    <View style={[styles.badge, positive && styles.badgePositive]}>
      <Text style={[styles.badgeText, positive && styles.badgeTextPositive]}>
        {label}
      </Text>
    </View>
  );
}
function statusLabel(status: string) {
  return (
    (
      {
        open: "招募中",
        upcoming: "即將開始",
        pending: "待回覆",
        invited: "獲邀請",
        applied: "已申請",
        accepted: "已接受",
        in_progress: "進行中",
        completed: "已完成",
        declined: "已婉拒",
      } as Record<string, string>
    )[status] || status
  );
}
function Tag({ text }: { text: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{text}</Text>
    </View>
  );
}
function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.info}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.infoValue}>{value || "未提供"}</Text>
    </View>
  );
}
function Block({ label, value }: { label: string; value?: string | null }) {
  return value ? (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.body}>{value}</Text>
    </View>
  ) : null;
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name={icon} size={25} color={colors.textMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#faf8f6" },
  flex: { flex: 1 },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
  },
  tabTextActive: { color: colors.primary, fontFamily: fonts.bodyBold },
  content: { padding: 16, paddingBottom: 110, gap: 14 },
  loading: { alignItems: "center", gap: 10, paddingVertical: 60 },
  muted: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  errorBox: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#fef2f2",
    gap: 7,
  },
  errorText: { color: "#b91c1c", fontFamily: fonts.bodyMedium, fontSize: 13 },
  retry: { color: colors.primary, fontFamily: fonts.bodyBold },
  card: {
    overflow: "hidden",
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cover: { width: "100%", height: 150, backgroundColor: "#f5f5f4" },
  cardBody: { padding: 15, gap: 12 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16 },
  body: {
    color: "#57534e",
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 21,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: "#f5f5f4",
  },
  tagText: { color: "#57534e", fontFamily: fonts.bodyMedium, fontSize: 11 },
  actions: { flexDirection: "row", gap: 10 },
  secondary: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  secondaryText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  primary: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#211b18",
  },
  primaryText: { color: "#fff", fontFamily: fonts.bodyBold, fontSize: 13 },
  disabled: { opacity: 0.45 },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: "#fff7ed",
  },
  badgePositive: { backgroundColor: "#f0fdf4" },
  badgeText: { color: "#c2410c", fontFamily: fonts.bodyBold, fontSize: 10 },
  badgeTextPositive: { color: "#15803d" },
  messageBox: { padding: 11, borderRadius: 11, backgroundColor: "#f5f5f4" },
  progress: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
  },
  progressItem: { flex: 1, alignItems: "center", gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#d6d3d1" },
  dotActive: { backgroundColor: "#16a34a" },
  progressText: { color: "#a8a29e", fontFamily: fonts.body, fontSize: 9 },
  progressTextActive: { color: "#166534", fontFamily: fonts.bodyMedium },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,.45)",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 24,
  },
  applySheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 19,
  },
  sheetContent: { padding: 20, gap: 12 },
  sheetButton: {
    marginHorizontal: 20,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#211b18",
  },
  info: { padding: 12, borderRadius: 12, backgroundColor: "#fafafa", gap: 3 },
  infoValue: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 14 },
  block: { gap: 5, paddingTop: 5 },
  label: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 },
  link: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    paddingVertical: 8,
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    textAlignVertical: "top",
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  empty: {
    alignItems: "center",
    padding: 34,
    gap: 9,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: "#fff",
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f4",
  },
  emptyText: {
    maxWidth: 280,
    textAlign: "center",
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 19,
  },
});
