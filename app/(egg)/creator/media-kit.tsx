import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { EggLoader } from "@/components/egg/EggLoader";
import { BackHeader } from "@/components/BackHeader";
import {
  loadEggMediaKit,
  updateEggMediaKit,
  type EggMediaKit,
  type EggMediaKitProfile,
  type EggRateCard,
} from "@/lib/eggApi";
import { fonts } from "@/lib/theme";
import { colors } from "@/theme/colors";

type Tab = "content" | "design" | "rates" | "featured";
const siteBase = (
  process.env.EXPO_PUBLIC_EGG_API_URL || "https://egg.sooncreator.network"
).replace(/\/$/, "");
const presets = [
  {
    name: "暖調雜誌",
    bg: "#FFF5E6",
    text: "#1A1A1A",
    accent: "#E63946",
    accentText: "#FFFFFF",
  },
  {
    name: "深夜藍",
    bg: "#111827",
    text: "#F9FAFB",
    accent: "#60A5FA",
    accentText: "#0B1220",
  },
  {
    name: "抹茶柔和",
    bg: "#F4F7ED",
    text: "#1F2933",
    accent: "#6A994E",
    accentText: "#FFFFFF",
  },
  {
    name: "工作室粉紅",
    bg: "#FFF1F5",
    text: "#2A1720",
    accent: "#DB2777",
    accentText: "#FFFFFF",
  },
  {
    name: "極簡黑白",
    bg: "#F8FAFC",
    text: "#0F172A",
    accent: "#111827",
    accentText: "#FFFFFF",
  },
  {
    name: "日落金",
    bg: "#FFF7ED",
    text: "#24140A",
    accent: "#F59E0B",
    accentText: "#1A1200",
  },
];

export default function EggMediaKitScreen() {
  const [data, setData] = useState<EggMediaKit | null>(null);
  const [draft, setDraft] = useState<EggMediaKitProfile | null>(null);
  const [tab, setTab] = useState<Tab>("content");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loadEggMediaKit();
      setData(next);
      setDraft(next.profile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未能載入 Media Kit");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function saveProfile() {
    if (!draft || !data?.canEdit) return;
    setSaving(true);
    setError("");
    try {
      await updateEggMediaKit({ action: "update_profile", values: draft });
      setData({ ...data, profile: draft });
      Alert.alert("已儲存", "Media Kit 已同步更新到公開頁面。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未能儲存 Media Kit");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFeatured(id: string, featured: boolean) {
    if (!data?.canEdit) return;
    setSaving(true);
    setError("");
    try {
      await updateEggMediaKit({ action: "toggle_featured", id, featured });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未能更新精選內容");
    } finally {
      setSaving(false);
    }
  }

  const featuredCount =
    data?.media.filter((item) => item.is_featured).length ?? 0;
  return (
    <SafeAreaView style={styles.safe}>
      <BackHeader title="Media Kit" backTo="/(egg)/creator/more" />
      <View style={styles.tabBar}>
        {(
          [
            ["content", "內容"],
            ["design", "外觀"],
            ["rates", "報價"],
            ["featured", `精選 ${featuredCount}/5`],
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
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.loading}>
            <EggLoader label="正在載入 Media Kit…" />
            <Text style={styles.muted}>正在讀取 Media Kit…</Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={styles.retry}>重新整理</Text>
            </Pressable>
          </View>
        ) : null}
        {!loading && draft && data ? (
          <>
            {!data.canEdit ? (
              <View style={styles.notice}>
                <Feather name="eye" size={17} color="#92400e" />
                <Text style={styles.noticeText}>
                  你目前只有檢視權限；擁有者或管理員先可以編輯。
                </Text>
              </View>
            ) : null}
            {tab === "content" ? (
              <ContentTab
                draft={draft}
                setDraft={setDraft}
                disabled={!data.canEdit}
                cases={data.caseStudies}
                partners={data.brandPartners}
                reload={load}
              />
            ) : null}
            {tab === "design" ? (
              <DesignTab
                draft={draft}
                setDraft={setDraft}
                disabled={!data.canEdit}
              />
            ) : null}
            {tab === "rates" ? (
              <RatesTab
                rates={data.rates}
                disabled={!data.canEdit}
                reload={load}
              />
            ) : null}
            {tab === "featured" ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>精選 Instagram 內容</Text>
                <Text style={styles.muted}>
                  選擇最多 5 個內容顯示喺公開 Media Kit。
                </Text>
                {data.media.length ? (
                  data.media.map((media) => (
                    <Pressable
                      key={media.id}
                      disabled={!data.canEdit || saving}
                      onPress={() =>
                        void toggleFeatured(media.id, !media.is_featured)
                      }
                      style={[
                        styles.mediaRow,
                        media.is_featured && styles.mediaSelected,
                      ]}
                    >
                      {media.thumbnail_url || media.media_url ? (
                        <Image
                          source={{
                            uri: media.thumbnail_url || media.media_url || "",
                          }}
                          style={styles.mediaImage}
                        />
                      ) : (
                        <View style={[styles.mediaImage, styles.imageFallback]}>
                          <Feather
                            name="instagram"
                            size={22}
                            color={colors.textMuted}
                          />
                        </View>
                      )}
                      <View style={styles.flex}>
                        <Text numberOfLines={2} style={styles.mediaCaption}>
                          {media.caption || "Instagram 內容"}
                        </Text>
                        <Text style={styles.muted}>
                          {mediaLabel(
                            media.media_product_type,
                            media.media_type,
                          )}
                        </Text>
                      </View>
                      <Feather
                        name={media.is_featured ? "check-circle" : "circle"}
                        size={22}
                        color={media.is_featured ? "#16a34a" : colors.textMuted}
                      />
                    </Pressable>
                  ))
                ) : (
                  <Empty text="尚未同步 Instagram 內容" />
                )}
              </View>
            ) : null}
            {(tab === "content" || tab === "design") && data.canEdit ? (
              <Pressable
                disabled={saving}
                onPress={() => void saveProfile()}
                style={[styles.saveButton, saving && styles.disabled]}
              >
                <Text style={styles.saveText}>
                  {saving ? "儲存中…" : "儲存變更"}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync(
                  `${siteBase}/${draft.username}/mediakit`,
                )
              }
              style={styles.previewButton}
            >
              <Feather name="external-link" size={17} color={colors.primary} />
              <Text style={styles.previewText}>預覽公開 Media Kit</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ContentTab({
  draft,
  setDraft,
  disabled,
  cases,
  partners,
  reload,
}: {
  draft: EggMediaKitProfile;
  setDraft: (value: EggMediaKitProfile) => void;
  disabled: boolean;
  cases: EggMediaKit["caseStudies"];
  partners: EggMediaKit["brandPartners"];
  reload: () => Promise<void>;
}) {
  const set = (key: keyof EggMediaKitProfile, value: string | boolean) =>
    setDraft({ ...draft, [key]: value });
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>公開狀態</Text>
        <ToggleRow
          title="公開 Media Kit"
          description="品牌可以透過公開連結查看"
          value={draft.mediakit_is_public !== false}
          disabled={disabled}
          onChange={(v) => set("mediakit_is_public", v)}
        />
        <ToggleRow
          title="接受品牌配對"
          description="允許 SOON 推薦適合你的合作"
          value={draft.mediakit_allow_matching !== false}
          disabled={disabled}
          onChange={(v) => set("mediakit_allow_matching", v)}
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>關於我</Text>
        <Field
          label="段落標題"
          value={draft.mediakit_about_title || "關於我"}
          disabled={disabled}
          onChange={(v) => set("mediakit_about_title", v)}
        />
        <Field
          label="個人簡介"
          value={draft.mediakit_bio || ""}
          multiline
          disabled={disabled}
          onChange={(v) => set("mediakit_bio", v)}
        />
        <ToggleRow
          title="顯示關於我"
          value={!draft.mediakit_lock_about}
          disabled={disabled}
          onChange={(v) => set("mediakit_lock_about", !v)}
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>合作聯絡</Text>
        <Field
          label="合作標題"
          value={draft.mediakit_collab_title || "合作邀請"}
          disabled={disabled}
          onChange={(v) => set("mediakit_collab_title", v)}
        />
        <Field
          label="合作訊息"
          value={draft.mediakit_collab_message || ""}
          multiline
          disabled={disabled}
          onChange={(v) => set("mediakit_collab_message", v)}
        />
        <Field
          label="聯絡電郵"
          value={draft.contact_email || ""}
          disabled={disabled}
          keyboard="email-address"
          onChange={(v) => set("contact_email", v)}
        />
        <ToggleRow
          title="顯示聯絡方式"
          value={!draft.mediakit_lock_contact}
          disabled={disabled}
          onChange={(v) => set("mediakit_lock_contact", !v)}
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>公開段落</Text>
        <ToggleRow
          title={`品牌合作（${partners.length}）`}
          value={!draft.mediakit_lock_brand_partners}
          disabled={disabled}
          onChange={(v) => set("mediakit_lock_brand_partners", !v)}
        />
        <ToggleRow
          title={`合作案例（${cases.length}）`}
          value={!draft.mediakit_lock_case_studies}
          disabled={disabled}
          onChange={(v) => set("mediakit_lock_case_studies", !v)}
        />
        <ToggleRow
          title="合作報價"
          value={!draft.mediakit_lock_rates}
          disabled={disabled}
          onChange={(v) => set("mediakit_lock_rates", !v)}
        />
        <ToggleRow
          title="社交數據"
          value={!draft.mediakit_lock_analytics}
          disabled={disabled}
          onChange={(v) => set("mediakit_lock_analytics", !v)}
        />
      </View>
      <PartnerEditor items={partners} disabled={disabled} reload={reload} />
      <CaseEditor items={cases} disabled={disabled} reload={reload} />
    </>
  );
}

function DesignTab({
  draft,
  setDraft,
  disabled,
}: {
  draft: EggMediaKitProfile;
  setDraft: (value: EggMediaKitProfile) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>顏色主題</Text>
      <Text style={styles.muted}>主題會即時套用到公開 Media Kit。</Text>
      <View style={styles.presetGrid}>
        {presets.map((preset) => (
          <Pressable
            key={preset.name}
            disabled={disabled}
            onPress={() =>
              setDraft({
                ...draft,
                mediakit_color_preset: preset.name,
                mediakit_bg_color: preset.bg,
                mediakit_text_color: preset.text,
                mediakit_accent_color: preset.accent,
                mediakit_accent_text_color: preset.accentText,
              })
            }
            style={[
              styles.preset,
              draft.mediakit_color_preset === preset.name &&
                styles.presetActive,
            ]}
          >
            <View style={[styles.colorPreview, { backgroundColor: preset.bg }]}>
              <View
                style={[styles.colorAccent, { backgroundColor: preset.accent }]}
              />
            </View>
            <Text style={styles.presetName}>{preset.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.cardTitle, { marginTop: 12 }]}>版面</Text>
      <View style={styles.layoutRow}>
        {[
          ["webpage", "網頁"],
          ["one-page", "單頁"],
        ].map(([value, label]) => (
          <Pressable
            key={value}
            disabled={disabled}
            onPress={() => setDraft({ ...draft, mediakit_layout: value })}
            style={[
              styles.choice,
              (draft.mediakit_layout || "webpage") === value &&
                styles.choiceActive,
            ]}
          >
            <Text style={styles.choiceText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function RatesTab({
  rates,
  disabled,
  reload,
}: {
  rates: EggRateCard[];
  disabled: boolean;
  reload: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  async function add() {
    if (!name.trim() || !price.trim())
      return Alert.alert("未完成", "請填寫服務名稱及價錢。");
    setSaving(true);
    try {
      await updateEggMediaKit({
        action: "save_rate",
        serviceName: name,
        platform: "Instagram",
        price: Number(price),
        currency: "HKD",
        isStartingPrice: true,
      });
      setName("");
      setPrice("");
      await reload();
    } catch (cause) {
      Alert.alert(
        "儲存失敗",
        cause instanceof Error ? cause.message : "請稍後再試",
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    setSaving(true);
    try {
      await updateEggMediaKit({ action: "delete_rate", id });
      await reload();
    } catch (cause) {
      Alert.alert(
        "刪除失敗",
        cause instanceof Error ? cause.message : "請稍後再試",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>合作報價</Text>
      <Text style={styles.muted}>公開頁會顯示「起」，保留實際報價彈性。</Text>
      {rates.map((rate) => (
        <View key={rate.id} style={styles.rateRow}>
          <View style={styles.flex}>
            <Text style={styles.rateName}>
              {rate.service_name_zh || rate.service_name}
            </Text>
            <Text style={styles.muted}>{rate.platform || "Instagram"}</Text>
          </View>
          <Text style={styles.ratePrice}>
            {rate.currency || "HKD"} {Number(rate.price).toLocaleString()} 起
          </Text>
          {!disabled ? (
            <Pressable
              disabled={saving}
              onPress={() =>
                Alert.alert(
                  "刪除報價？",
                  rate.service_name_zh || rate.service_name,
                  [
                    { text: "取消", style: "cancel" },
                    {
                      text: "刪除",
                      style: "destructive",
                      onPress: () => void remove(rate.id),
                    },
                  ],
                )
              }
            >
              <Feather name="trash-2" size={18} color="#dc2626" />
            </Pressable>
          ) : null}
        </View>
      ))}
      {!rates.length ? <Empty text="未有合作報價" /> : null}
      {!disabled ? (
        <View style={styles.addRate}>
          <Field
            label="服務名稱"
            value={name}
            onChange={setName}
            disabled={saving}
          />
          <Field
            label="價錢（HKD）"
            value={price}
            onChange={setPrice}
            disabled={saving}
            keyboard="numeric"
          />
          <Pressable
            onPress={() => void add()}
            disabled={saving}
            style={styles.smallButton}
          >
            <Text style={styles.smallButtonText}>
              {saving ? "儲存中…" : "加入報價"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function PartnerEditor({
  items,
  disabled,
  reload,
}: {
  items: EggMediaKit["brandPartners"];
  disabled: boolean;
  reload: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);

  function edit(item: EggMediaKit["brandPartners"][number]) {
    setEditingId(item.id);
    setName(item.brand_name);
    setLogoUrl(item.brand_logo_url || "");
  }
  function clear() {
    setEditingId(null);
    setName("");
    setLogoUrl("");
  }
  async function save() {
    if (!name.trim()) return Alert.alert("未完成", "請填寫品牌名稱。");
    setSaving(true);
    try {
      await updateEggMediaKit({
        action: "save_partner",
        id: editingId,
        brandName: name,
        logoUrl,
      });
      clear();
      await reload();
    } catch (cause) {
      Alert.alert(
        "儲存失敗",
        cause instanceof Error ? cause.message : "請稍後再試",
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    setSaving(true);
    try {
      await updateEggMediaKit({ action: "delete_partner", id });
      if (editingId === id) clear();
      await reload();
    } catch (cause) {
      Alert.alert(
        "刪除失敗",
        cause instanceof Error ? cause.message : "請稍後再試",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>品牌合作</Text>
      <Text style={styles.muted}>
        加入真正合作過的品牌；冇資料就唔會顯示假內容。
      </Text>
      {items.map((item) => (
        <View key={item.id} style={styles.recordRow}>
          {item.brand_logo_url ? (
            <Image source={{ uri: item.brand_logo_url }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.imageFallback]}>
              <Feather name="briefcase" size={18} color={colors.textMuted} />
            </View>
          )}
          <Text style={[styles.rateName, styles.flex]}>{item.brand_name}</Text>
          {!disabled ? (
            <>
              <Pressable onPress={() => edit(item)}>
                <Feather name="edit-2" size={18} color={colors.primary} />
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={() =>
                  Alert.alert("刪除品牌？", item.brand_name, [
                    { text: "取消", style: "cancel" },
                    {
                      text: "刪除",
                      style: "destructive",
                      onPress: () => void remove(item.id),
                    },
                  ])
                }
              >
                <Feather name="trash-2" size={18} color="#dc2626" />
              </Pressable>
            </>
          ) : null}
        </View>
      ))}
      {!items.length ? <Empty text="未有品牌合作資料" /> : null}
      {!disabled ? (
        <View style={styles.addRate}>
          <Text style={styles.formTitle}>
            {editingId ? "編輯品牌" : "新增品牌"}
          </Text>
          <Field
            label="品牌名稱"
            value={name}
            onChange={setName}
            disabled={saving}
          />
          <Field
            label="品牌 Logo 網址（選填）"
            value={logoUrl}
            onChange={setLogoUrl}
            disabled={saving}
            keyboard="url"
          />
          <View style={styles.actionRow}>
            {editingId ? (
              <Pressable onPress={clear} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>取消</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => void save()}
              disabled={saving}
              style={[styles.smallButton, styles.flex]}
            >
              <Text style={styles.smallButtonText}>
                {saving ? "儲存中…" : "儲存品牌"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CaseEditor({
  items,
  disabled,
  reload,
}: {
  items: EggMediaKit["caseStudies"];
  disabled: boolean;
  reload: () => Promise<void>;
}) {
  const empty = {
    id: "",
    title: "",
    brandName: "",
    description: "",
    result: "",
    imageUrl: "",
    linkUrl: "",
  };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  function edit(item: EggMediaKit["caseStudies"][number]) {
    setForm({
      id: item.id,
      title: item.title,
      brandName: item.brand_name || "",
      description: item.description || "",
      result: item.result || "",
      imageUrl: item.image_url || "",
      linkUrl: item.link_url || "",
    });
  }
  async function save() {
    if (!form.title.trim()) return Alert.alert("未完成", "請填寫案例名稱。");
    setSaving(true);
    try {
      await updateEggMediaKit({ action: "save_case", ...form });
      setForm(empty);
      await reload();
    } catch (cause) {
      Alert.alert(
        "儲存失敗",
        cause instanceof Error ? cause.message : "請稍後再試",
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    setSaving(true);
    try {
      await updateEggMediaKit({ action: "delete_case", id });
      if (form.id === id) setForm(empty);
      await reload();
    } catch (cause) {
      Alert.alert(
        "刪除失敗",
        cause instanceof Error ? cause.message : "請稍後再試",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>合作案例</Text>
      <Text style={styles.muted}>只加入真實完成的項目及可核實結果。</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.caseRow}>
          <View style={styles.flex}>
            <Text style={styles.rateName}>{item.title}</Text>
            {item.brand_name ? (
              <Text style={styles.muted}>{item.brand_name}</Text>
            ) : null}
            {item.result ? (
              <Text numberOfLines={2} style={styles.resultText}>
                {item.result}
              </Text>
            ) : null}
          </View>
          {!disabled ? (
            <>
              <Pressable onPress={() => edit(item)}>
                <Feather name="edit-2" size={18} color={colors.primary} />
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={() =>
                  Alert.alert("刪除案例？", item.title, [
                    { text: "取消", style: "cancel" },
                    {
                      text: "刪除",
                      style: "destructive",
                      onPress: () => void remove(item.id),
                    },
                  ])
                }
              >
                <Feather name="trash-2" size={18} color="#dc2626" />
              </Pressable>
            </>
          ) : null}
        </View>
      ))}
      {!items.length ? <Empty text="未有合作案例" /> : null}
      {!disabled ? (
        <View style={styles.addRate}>
          <Text style={styles.formTitle}>
            {form.id ? "編輯案例" : "新增案例"}
          </Text>
          <Field
            label="案例名稱"
            value={form.title}
            onChange={(v) => setForm({ ...form, title: v })}
            disabled={saving}
          />
          <Field
            label="品牌名稱"
            value={form.brandName}
            onChange={(v) => setForm({ ...form, brandName: v })}
            disabled={saving}
          />
          <Field
            label="合作內容"
            value={form.description}
            onChange={(v) => setForm({ ...form, description: v })}
            disabled={saving}
            multiline
          />
          <Field
            label="成果"
            value={form.result}
            onChange={(v) => setForm({ ...form, result: v })}
            disabled={saving}
          />
          <Field
            label="作品連結（選填）"
            value={form.linkUrl}
            onChange={(v) => setForm({ ...form, linkUrl: v })}
            disabled={saving}
            keyboard="url"
          />
          <View style={styles.actionRow}>
            {form.id ? (
              <Pressable
                onPress={() => setForm(empty)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>取消</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => void save()}
              disabled={saving}
              style={[styles.smallButton, styles.flex]}
            >
              <Text style={styles.smallButtonText}>
                {saving ? "儲存中…" : "儲存案例"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
  disabled = false,
  keyboard = "default",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  keyboard?: "default" | "email-address" | "numeric" | "url";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        multiline={multiline}
        keyboardType={keyboard}
        style={[
          styles.input,
          multiline && styles.textarea,
          disabled && styles.disabled,
        ]}
        placeholderTextColor="#a8a29e"
      />
    </View>
  );
}
function ToggleRow({
  title,
  description,
  value,
  onChange,
  disabled,
}: {
  title: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={styles.toggleTitle}>{title}</Text>
        {description ? <Text style={styles.muted}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: "#d6d3d1", true: "#86efac" }}
        thumbColor={value ? "#16a34a" : "#f5f5f4"}
      />
    </View>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

function mediaLabel(productType?: string | null, mediaType?: string | null) {
  const value = `${productType || ""} ${mediaType || ""}`.toUpperCase();
  if (value.includes("REEL")) return "Reel";
  if (value.includes("CAROUSEL")) return "Carousel";
  if (value.includes("VIDEO")) return "影片";
  return "相片貼文";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#faf8f6" },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 110, gap: 14 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 13,
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
  loading: { alignItems: "center", gap: 10, paddingVertical: 50 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 13,
  },
  cardTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 17 },
  muted: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  notice: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fffbeb",
  },
  noticeText: {
    flex: 1,
    color: "#92400e",
    fontFamily: fonts.body,
    fontSize: 12,
  },
  errorBox: {
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    gap: 6,
  },
  errorText: { color: "#b91c1c", fontFamily: fonts.bodyMedium, fontSize: 13 },
  retry: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 13 },
  field: { gap: 6 },
  label: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 13 },
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fafafa",
    paddingHorizontal: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  textarea: { minHeight: 108, paddingTop: 12, textAlignVertical: "top" },
  disabled: { opacity: 0.55 },
  toggleRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  toggleTitle: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
  },
  saveButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: colors.primary,
  },
  saveText: { color: "#fff", fontFamily: fonts.bodyBold, fontSize: 15 },
  previewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 48,
  },
  previewText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  preset: {
    width: "47%",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 9,
    gap: 7,
  },
  presetActive: { borderColor: colors.primary, borderWidth: 2 },
  colorPreview: {
    height: 42,
    borderRadius: 8,
    padding: 8,
    justifyContent: "flex-end",
  },
  colorAccent: { width: 42, height: 8, borderRadius: 5 },
  presetName: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
  },
  layoutRow: { flexDirection: "row", gap: 10 },
  choice: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceActive: { borderColor: colors.primary, backgroundColor: "#fff7f5" },
  choiceText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  mediaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 9,
  },
  mediaSelected: { borderColor: "#16a34a", backgroundColor: "#f0fdf4" },
  mediaImage: {
    width: 58,
    height: 58,
    borderRadius: 9,
    backgroundColor: "#f5f5f4",
  },
  imageFallback: { alignItems: "center", justifyContent: "center" },
  mediaCaption: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: 12,
  },
  rateName: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  ratePrice: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: 10,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#f5f5f4",
  },
  caseRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: 12,
  },
  resultText: {
    color: "#166534",
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    marginTop: 4,
  },
  formTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  addRate: {
    gap: 12,
    marginTop: 5,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  smallButton: {
    alignItems: "center",
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#211b18",
  },
  smallButtonText: { color: "#fff", fontFamily: fonts.bodyBold, fontSize: 14 },
  empty: { alignItems: "center", paddingVertical: 28 },
});
