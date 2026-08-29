import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BackHeader } from "@/components/BackHeader";
import {
  checkEggUsername,
  loadEggSettings,
  saveEggSettings,
  uploadEggAvatar,
  type EggProfileLink,
  type EggSettingsProfile,
} from "@/lib/eggApi";
import { fonts } from "@/lib/theme";
import { colors } from "@/theme/colors";

const categories = [
  "生活美學",
  "美容護膚",
  "時尚穿搭",
  "美食",
  "旅遊",
  "健康運動",
  "親子",
  "科技",
  "財經",
  "教育",
  "娛樂",
  "其他",
];
const website = (
  process.env.EXPO_PUBLIC_EGG_API_URL || "https://egg.sooncreator.network"
).replace(/\/$/, "");

export default function EggSettingsScreen() {
  const [profile, setProfile] = useState<EggSettingsProfile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [bio, setBio] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [facebook, setFacebook] = useState("");
  const [threads, setThreads] = useState("");
  const [links, setLinks] = useState<EggProfileLink[]>([]);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [usernameState, setUsernameState] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const load = useCallback(async () => {
    setError("");
    try {
      const data = await loadEggSettings();
      const p = data.profile;
      setProfile(p);
      setEmail(data.email);
      setCanEdit(data.canEdit);
      setDisplayName(p.display_name || "");
      setUsername(p.username || "");
      setOriginalUsername(p.username || "");
      setBio(p.bio || "");
      setSelected(p.content_categories || []);
      setFacebook(p.facebook_handle || "");
      setThreads(p.threads_handle || "");
      setLinks(data.links || []);
      setUsernameState("available");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未能載入設定");
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    if (!canEdit) return;
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/.test(normalized)) {
      setUsernameState("invalid");
      return;
    }
    if (normalized === originalUsername) {
      setUsernameState("available");
      return;
    }
    setUsernameState("checking");
    const timer = setTimeout(() => {
      void checkEggUsername(normalized)
        .then((ok) => setUsernameState(ok ? "available" : "taken"))
        .catch(() => setUsernameState("idle"));
    }, 450);
    return () => clearTimeout(timer);
  }, [canEdit, originalUsername, username]);
  async function save() {
    setSaving(true);
    setError("");
    try {
      await saveEggSettings({
        display_name: displayName,
        username,
        bio,
        content_categories: selected,
        facebook_handle: facebook,
        threads_handle: threads,
      });
      await load();
      Alert.alert("已儲存", "設定已更新。公開頁亦會使用新資料。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }
  function toggle(item: string) {
    setSelected((current) =>
      current.includes(item)
        ? current.filter((x) => x !== item)
        : [...current, item],
    );
  }
  async function open(path: string) {
    await WebBrowser.openBrowserAsync(`${website}${path}`, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: colors.primary,
    });
  }
  async function changeAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted)
      return Alert.alert(
        "需要相片權限",
        "請允許 SOON-EGG 讀取相片先可以更換頭像。",
      );
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]) return;
    setSaving(true);
    setError("");
    try {
      await uploadEggAvatar(
        result.assets[0].uri,
        result.assets[0].mimeType || "image/jpeg",
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "頭像上傳失敗");
    } finally {
      setSaving(false);
    }
  }
  async function saveLink() {
    setSaving(true);
    setError("");
    try {
      await saveEggSettings({
        action: "save_link",
        id: editingLink || undefined,
        title: linkTitle,
        url: linkUrl,
      });
      setLinkTitle("");
      setLinkUrl("");
      setEditingLink(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未能儲存連結");
    } finally {
      setSaving(false);
    }
  }
  function deleteLink(id: string) {
    Alert.alert("刪除連結？", "公開主頁會即時移除呢條連結。", [
      { text: "取消", style: "cancel" },
      {
        text: "刪除",
        style: "destructive",
        onPress: () =>
          void (async () => {
            setSaving(true);
            try {
              await saveEggSettings({ action: "delete_link", id });
              await load();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "未能刪除連結");
            } finally {
              setSaving(false);
            }
          })(),
      },
    ]);
  }
  return (
    <SafeAreaView style={styles.safe}>
      <BackHeader title="設定" backTo="/(egg)/creator/more" />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? (
          <View style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={styles.retry}>重試</Text>
            </Pressable>
          </View>
        ) : null}
        {profile ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>工作空間資料</Text>
              <View style={styles.identity}>
                <Pressable
                  disabled={!canEdit || saving}
                  onPress={() => void changeAvatar()}
                >
                  {profile.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Feather name="user" size={22} color={colors.textMuted} />
                    </View>
                  )}
                  {canEdit ? (
                    <View style={styles.camera}>
                      <Feather name="camera" size={12} color="#fff" />
                    </View>
                  ) : null}
                </Pressable>
                <View style={styles.flex}>
                  <Text style={styles.name}>
                    {profile.display_name || profile.username}
                  </Text>
                  <Text style={styles.meta}>{email}</Text>
                </View>
              </View>
              {!canEdit ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>
                    你係一般成員；只有擁有者或 Admin 可以修改工作空間資料。
                  </Text>
                </View>
              ) : null}
              <Field label="創作者名稱">
                <TextInput
                  editable={canEdit}
                  value={displayName}
                  onChangeText={setDisplayName}
                  style={[styles.input, !canEdit && styles.readonly]}
                />
              </Field>
              <Field label="公開網址用戶名">
                <TextInput
                  editable={canEdit}
                  autoCapitalize="none"
                  value={username}
                  onChangeText={(value) =>
                    setUsername(
                      value.toLowerCase().replace(/[^a-z0-9._-]/g, ""),
                    )
                  }
                  style={[styles.input, !canEdit && styles.readonly]}
                />
                <Text
                  style={[
                    styles.help,
                    (usernameState === "taken" ||
                      usernameState === "invalid") &&
                      styles.bad,
                  ]}
                >
                  {usernameState === "checking"
                    ? "檢查中…"
                    : usernameState === "available"
                      ? `egg.sooncreator.network/${username}`
                      : usernameState === "taken"
                        ? "已被使用"
                        : usernameState === "invalid"
                          ? "格式不正確"
                          : ""}
                </Text>
              </Field>
              <Field label="一句介紹">
                <TextInput
                  editable={canEdit}
                  multiline
                  value={bio}
                  onChangeText={(value) => setBio(value.slice(0, 150))}
                  style={[
                    styles.input,
                    styles.textarea,
                    !canEdit && styles.readonly,
                  ]}
                />
                <Text style={styles.counter}>{bio.length}/150</Text>
              </Field>
              <Text style={styles.label}>內容類型</Text>
              <View style={styles.chips}>
                {categories.map((item) => (
                  <Pressable
                    disabled={!canEdit}
                    key={item}
                    onPress={() => toggle(item)}
                    style={[
                      styles.chip,
                      selected.includes(item) && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected.includes(item) && styles.chipTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>個人連結</Text>
              <Text style={styles.meta}>App 同網站共用同一批公開連結。</Text>
              {links.map((link) => (
                <Pressable
                  key={link.id}
                  disabled={!canEdit}
                  onPress={() => {
                    setEditingLink(link.id);
                    setLinkTitle(link.title);
                    setLinkUrl(link.url);
                  }}
                  style={styles.linkRow}
                >
                  <View style={styles.flex}>
                    <Text style={styles.name}>{link.title}</Text>
                    <Text numberOfLines={1} style={styles.meta}>
                      {link.url}
                    </Text>
                  </View>
                  {canEdit ? (
                    <Pressable onPress={() => deleteLink(link.id)}>
                      <Feather name="trash-2" size={18} color="#dc2626" />
                    </Pressable>
                  ) : null}
                </Pressable>
              ))}
              {canEdit ? (
                <>
                  <Field label={editingLink ? "編輯連結" : "新增連結"}>
                    <TextInput
                      value={linkTitle}
                      onChangeText={setLinkTitle}
                      placeholder="顯示名稱"
                      style={styles.input}
                    />
                    <TextInput
                      value={linkUrl}
                      onChangeText={setLinkUrl}
                      autoCapitalize="none"
                      keyboardType="url"
                      placeholder="https://..."
                      style={styles.input}
                    />
                  </Field>
                  <Pressable
                    disabled={saving || !linkTitle.trim() || !linkUrl.trim()}
                    onPress={() => void saveLink()}
                    style={[
                      styles.outline,
                      (saving || !linkTitle.trim() || !linkUrl.trim()) &&
                        styles.disabled,
                    ]}
                  >
                    <Text style={styles.outlineText}>
                      {editingLink ? "更新連結" : "加入連結"}
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>社交平台</Text>
              <Social
                label="Instagram"
                value={
                  profile.instagram_handle
                    ? `@${profile.instagram_handle}`
                    : "未連接"
                }
                detail={
                  profile.instagram_followers
                    ? `${profile.instagram_followers.toLocaleString()} followers · OAuth 已連接`
                    : "到網站版安全連接帳戶"
                }
              />
              <Pressable
                onPress={() => void open("/settings")}
                style={styles.outline}
              >
                <Text style={styles.outlineText}>管理／重新連接 Instagram</Text>
              </Pressable>
              <Field label="Facebook">
                <TextInput
                  editable={canEdit}
                  value={facebook}
                  onChangeText={setFacebook}
                  placeholder="@username"
                  autoCapitalize="none"
                  style={[styles.input, !canEdit && styles.readonly]}
                />
              </Field>
              <Field label="Threads">
                <TextInput
                  editable={canEdit}
                  value={threads}
                  onChangeText={setThreads}
                  placeholder="@username"
                  autoCapitalize="none"
                  style={[styles.input, !canEdit && styles.readonly]}
                />
              </Field>
              <Social label="YouTube" value="暫時未開放" />
              <Social label="TikTok" value="暫時未開放" />
              <Social label="小紅書" value="暫時未開放" />
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>收款設定</Text>
              <Social
                label="Stripe Connect"
                value={
                  profile.stripe_onboarding_complete
                    ? "已連接並可收款"
                    : "尚未完成設定"
                }
              />
              <Pressable
                onPress={() => void open("/settings")}
                style={styles.outline}
              >
                <Text style={styles.outlineText}>
                  {profile.stripe_onboarding_complete
                    ? "管理收款設定"
                    : "到網站完成 Stripe 驗證"}
                </Text>
              </Pressable>
            </View>
            {canEdit ? (
              <Pressable
                disabled={
                  saving || !displayName.trim() || usernameState !== "available"
                }
                onPress={() => void save()}
                style={[
                  styles.primary,
                  (saving ||
                    !displayName.trim() ||
                    usernameState !== "available") &&
                    styles.disabled,
                ]}
              >
                <Text style={styles.primaryText}>
                  {saving ? "儲存中…" : "儲存設定"}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}
function Social({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <View style={styles.social}>
      <View>
        <Text style={styles.socialLabel}>{label}</Text>
        {detail ? <Text style={styles.meta}>{detail}</Text> : null}
      </View>
      <Text style={styles.socialValue}>{value}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, paddingBottom: 42, gap: 14 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    padding: 16,
    gap: 14,
  },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  identity: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarFallback: {
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  camera: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.bgCard,
  },
  flex: { flex: 1 },
  name: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  meta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  notice: { padding: 11, borderRadius: 10, backgroundColor: "#fff7ed" },
  noticeText: { fontFamily: fonts.body, color: "#9a3412", lineHeight: 19 },
  field: { gap: 7 },
  label: { fontFamily: fonts.bodyBold, color: colors.text, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontFamily: fonts.body,
    color: colors.text,
  },
  textarea: { minHeight: 90, textAlignVertical: "top" },
  readonly: { backgroundColor: "#f4f4f5", color: colors.textMuted },
  help: { fontFamily: fonts.body, fontSize: 11, color: "#059669" },
  bad: { color: "#dc2626" },
  counter: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "right",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 12 },
  chipTextActive: { color: "#fff" },
  social: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bodyBorder,
  },
  socialLabel: { fontFamily: fonts.bodyBold, color: colors.text },
  socialValue: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "right",
    maxWidth: "52%",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bodyBorder,
  },
  outline: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 12,
    padding: 11,
    alignItems: "center",
  },
  outlineText: { fontFamily: fonts.bodyBold, color: colors.primary },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: 13,
    padding: 14,
    alignItems: "center",
  },
  primaryText: { fontFamily: fonts.bodyBold, color: "#fff" },
  disabled: { opacity: 0.45 },
  error: { backgroundColor: "#fef2f2", borderRadius: 12, padding: 12, gap: 5 },
  errorText: { fontFamily: fonts.body, color: "#b91c1c" },
  retry: { fontFamily: fonts.bodyBold, color: colors.primary },
});
