import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { EggScreen } from "@/components/egg/EggScreen";
import { useAuth } from "@/hooks/useAuth";
import { useEggBootstrap } from "@/hooks/useEggBootstrap";
import { colors } from "@/theme/colors";
import { fonts } from "@/lib/theme";

type FeatherName = keyof typeof Feather.glyphMap;
const websiteBase = (
  process.env.EXPO_PUBLIC_EGG_API_URL || "https://egg.sooncreator.network"
).replace(/\/$/, "");

export default function EggMoreScreen() {
  const { signOut } = useAuth();
  const { data, loading, error, refresh } = useEggBootstrap();
  const active = data?.activeWorkspace;
  const role = active?.role;
  const canManage = role === "owner" || role === "admin";

  async function openWebsite(path: string) {
    await WebBrowser.openBrowserAsync(`${websiteBase}${path}`, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: colors.primary,
    });
  }

  function confirmSignOut() {
    Alert.alert("登出 SOON-EGG？", "下次需要重新登入先可以使用工作空間。", [
      { text: "取消", style: "cancel" },
      { text: "登出", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  return (
    <EggScreen title="更多">
      <View style={styles.workspaceCard}>
        <View style={styles.workspaceMain}>
          {active?.avatar_url ? (
            <Image source={{ uri: active.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Feather name="user" size={22} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.flex}>
            <Text style={styles.workspaceName}>
              {active?.display_name ||
                active?.username ||
                (loading ? "載入工作空間中…" : "未有工作空間")}
            </Text>
            <Text style={styles.workspaceMeta}>
              {roleLabel(role)} · 創作者工作空間
            </Text>
          </View>
          {data && data.workspaces.length > 1 ? (
            <Feather name="chevron-down" size={20} color={colors.textMuted} />
          ) : null}
        </View>
        {error ? (
          <Pressable onPress={() => void refresh()}>
            <Text style={styles.errorText}>{error} · 重新整理</Text>
          </Pressable>
        ) : null}
        {data && data.workspaces.length > 1 ? (
          <View style={styles.workspaceList}>
            {data.workspaces.map((workspace) => (
              <Pressable
                key={workspace.id}
                onPress={() => void refresh(workspace.id)}
                style={[
                  styles.workspaceOption,
                  workspace.id === active?.id && styles.workspaceOptionActive,
                ]}
              >
                <Text style={styles.workspaceOptionName}>
                  {workspace.display_name || workspace.username}
                </Text>
                <Text style={styles.workspaceOptionRole}>
                  {workspace.id === active?.id
                    ? "目前使用"
                    : roleLabel(workspace.role)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <MenuSection title="創作者資料">
        <MenuItem
          icon="bar-chart-2"
          title="社交平台數據"
          description="粉絲、觸及、互動率及升跌趨勢"
          onPress={() => router.push("/creator/analytics" as never)}
        />
        <MenuItem
          icon="file-text"
          title="Media Kit"
          description="編輯公開資料、作品及合作報價"
          onPress={() => router.push("/creator/media-kit" as never)}
        />
        <MenuItem
          icon="external-link"
          title="公開主頁"
          description={
            active?.username
              ? `egg.sooncreator.network/${active.username}`
              : "查看品牌會見到的公開資料"
          }
          badge="網站版"
          onPress={() =>
            active?.username && void openWebsite(`/${active.username}`)
          }
          disabled={!active?.username}
        />
      </MenuSection>

      <MenuSection title="創作工具">
        <MenuItem
          icon="zap"
          title="題材靈感庫"
          description="收藏新題材，或者直接開始寫劇本"
          onPress={() => router.push("/creator/topics" as never)}
        />
        <MenuItem
          icon="film"
          title="字幕工作台"
          description="影片轉錄、字幕校對及匯出"
          badge="網站版"
          onPress={() => void openWebsite("/tools/subtitle")}
        />
      </MenuSection>

      <MenuSection title="商務工具">
        <MenuItem
          icon="shopping-bag"
          title="數位產品"
          description="管理產品、服務、售價及公開狀態"
          onPress={() => router.push("/creator/products" as never)}
        />
        <MenuItem
          icon="briefcase"
          title="合作機會"
          description="查看品牌邀請、申請及合作紀錄"
          onPress={() => router.push("/creator/deals" as never)}
        />
        <MenuItem
          icon="target"
          title="Meta Ads"
          description={
            canManage
              ? "建立 PAUSED 廣告並到 Ads Manager 檢查"
              : "只有擁有者或管理員可以使用"
          }
          badge="網站版"
          onPress={() => void openWebsite("/meta-ads")}
          disabled={!canManage}
        />
      </MenuSection>

      <MenuSection title="工作空間與帳戶">
        <MenuItem
          icon="users"
          title="團隊成員"
          description={
            canManage
              ? "邀請及管理工作空間成員"
              : "只有擁有者或管理員可以管理成員"
          }
          onPress={() => router.push("/creator/team" as never)}
          disabled={!canManage}
        />
        <MenuItem
          icon="settings"
          title="設定"
          description="帳戶、社交平台及收款設定"
          onPress={() => router.push("/creator/settings" as never)}
        />
        <MenuItem
          icon="log-out"
          title="登出"
          description="離開目前帳戶"
          danger
          onPress={confirmSignOut}
        />
      </MenuSection>
    </EggScreen>
  );
}

function MenuSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.menuCard}>{children}</View>
    </View>
  );
}

function MenuItem({
  icon,
  title,
  description,
  badge,
  disabled = false,
  danger = false,
  onPress,
}: {
  icon: FeatherName;
  title: string;
  description: string;
  badge?: string;
  disabled?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        pressed && !disabled && styles.menuItemPressed,
        disabled && styles.menuItemDisabled,
      ]}
    >
      <View style={[styles.iconBox, danger && styles.dangerIcon]}>
        <Feather
          name={icon}
          size={19}
          color={danger ? "#dc2626" : colors.primary}
        />
      </View>
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text style={[styles.itemTitle, danger && styles.dangerText]}>
            {title}
          </Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.itemDescription}>{description}</Text>
      </View>
      {!disabled ? (
        <Feather name="chevron-right" size={19} color="#a8a29e" />
      ) : (
        <Feather name="lock" size={16} color="#a8a29e" />
      )}
    </Pressable>
  );
}

function roleLabel(role?: "owner" | "admin" | "member") {
  if (role === "owner") return "擁有者";
  if (role === "admin") return "管理員";
  if (role === "member") return "成員";
  return "未載入角色";
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  workspaceCard: {
    backgroundColor: "#211b18",
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  workspaceMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#fff" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  workspaceName: { color: "#fff", fontFamily: fonts.bodyBold, fontSize: 17 },
  workspaceMeta: {
    color: "#b8ada7",
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 3,
  },
  errorText: { color: "#fca5a5", fontFamily: fonts.body, fontSize: 12 },
  workspaceList: {
    borderTopWidth: 1,
    borderTopColor: "#403733",
    paddingTop: 10,
    gap: 6,
  },
  workspaceOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  workspaceOptionActive: { backgroundColor: "#3d322d" },
  workspaceOptionName: {
    color: "#fff",
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  workspaceOptionRole: {
    color: "#b8ada7",
    fontFamily: fonts.body,
    fontSize: 11,
  },
  section: { gap: 8 },
  sectionTitle: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    marginLeft: 4,
  },
  menuCard: {
    overflow: "hidden",
    backgroundColor: colors.bgCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItem: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuItemPressed: { backgroundColor: "#f7f3f0" },
  menuItemDisabled: { opacity: 0.48 },
  iconBox: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#f4e9e3",
  },
  dangerIcon: { backgroundColor: "#fef2f2" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 },
  dangerText: { color: "#dc2626" },
  itemDescription: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  badge: {
    borderRadius: 999,
    backgroundColor: "#eee9e6",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { color: "#716761", fontFamily: fonts.bodyBold, fontSize: 9 },
});
