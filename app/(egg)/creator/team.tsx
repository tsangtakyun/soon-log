import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  loadEggTeam,
  loadEggPrompt,
  saveEggPrompt,
  updateEggTeam,
  type EggTeamInvitation,
  type EggTeamMember,
} from "@/lib/eggApi";
import { fonts } from "@/lib/theme";
import { colors } from "@/theme/colors";

export default function EggTeamScreen() {
  const [members, setMembers] = useState<EggTeamMember[]>([]);
  const [invitations, setInvitations] = useState<EggTeamInvitation[]>([]);
  const [role, setRole] = useState<"owner" | "admin" | "member">("member");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const data = await loadEggTeam();
      setMembers(data.members);
      setInvitations(data.invitations);
      setRole(data.currentRole);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未能載入團隊成員");
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  async function run(payload: Record<string, unknown>, success?: string) {
    setBusy(true);
    setError("");
    try {
      const result = await updateEggTeam(payload);
      await load();
      if (success)
        Alert.alert("完成", result.emailSent ? "邀請電郵已寄出。" : success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }
  function remove(payload: Record<string, unknown>) {
    Alert.alert("確認移除？", "呢個操作會即時生效。", [
      { text: "取消", style: "cancel" },
      {
        text: "移除",
        style: "destructive",
        onPress: () => void run({ action: "remove", ...payload }),
      },
    ]);
  }
  async function openPrompt() {
    setBusy(true);
    setError("");
    try {
      const data = await loadEggPrompt();
      setPrompt(data.systemPrompt);
      setPromptOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未能載入商務規則");
    } finally {
      setBusy(false);
    }
  }
  async function storePrompt() {
    setBusy(true);
    setError("");
    try {
      await saveEggPrompt(prompt);
      setPromptOpen(false);
      Alert.alert("已儲存", "專屬商務規則已建立新版本。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未能儲存商務規則");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <BackHeader title="團隊成員" backTo="/(egg)/creator/more" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>
          邀請經理人或團隊成員共同管理目前工作空間。
        </Text>
        {role === "owner" ? (
          <Pressable
            onPress={() => void openPrompt()}
            style={styles.promptButton}
          >
            <Feather name="shield" size={17} color={colors.primary} />
            <Text style={styles.promptText}>管理專屬商務規則</Text>
          </Pressable>
        ) : null}
        {role !== "member" ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>邀請成員</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="member@example.com"
              style={styles.input}
            />
            {role === "owner" ? (
              <View style={styles.roleRow}>
                {(["member", "admin"] as const).map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setInviteRole(item)}
                    style={[
                      styles.roleButton,
                      inviteRole === item && styles.roleButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        inviteRole === item && styles.roleButtonTextActive,
                      ]}
                    >
                      {label(item)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Pressable
              disabled={busy || !email.trim()}
              onPress={() =>
                void run(
                  { action: "invite", email, role: inviteRole },
                  "邀請已建立；對方登入後會自動加入。",
                )
              }
              style={[
                styles.primary,
                (busy || !email.trim()) && styles.disabled,
              ]}
            >
              <Text style={styles.primaryText}>
                {busy ? "處理中…" : "發出邀請"}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? (
          <View style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={styles.retry}>重試</Text>
            </Pressable>
          </View>
        ) : null}
        {!loading ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>目前成員</Text>
            {members.map((member) => (
              <View key={member.user_id} style={styles.personRow}>
                <View style={styles.initial}>
                  <Text style={styles.initialText}>
                    {member.email.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.email}>{member.email}</Text>
                  <Text style={styles.meta}>{label(member.role)}</Text>
                </View>
                {role === "owner" && member.role !== "owner" ? (
                  <Pressable
                    disabled={busy}
                    onPress={() =>
                      void run({
                        action: "role",
                        userId: member.user_id,
                        role: member.role === "admin" ? "member" : "admin",
                      })
                    }
                    style={styles.smallButton}
                  >
                    <Text style={styles.smallText}>
                      轉為{member.role === "admin" ? "成員" : "Admin"}
                    </Text>
                  </Pressable>
                ) : null}
                {member.role !== "owner" &&
                (role === "owner" || member.role === "member") ? (
                  <Pressable onPress={() => remove({ userId: member.user_id })}>
                    <Feather name="trash-2" size={18} color="#dc2626" />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {invitations.map((invite) => (
              <View key={invite.id} style={styles.personRow}>
                <View style={styles.initial}>
                  <Feather name="mail" size={16} color="#b45309" />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.email}>{invite.email}</Text>
                  <Text style={styles.pending}>
                    等待接受 · {label(invite.role)}
                  </Text>
                </View>
                <Pressable onPress={() => remove({ invitationId: invite.id })}>
                  <Feather name="x" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <Modal
        visible={promptOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPromptOpen(false)}
      >
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setPromptOpen(false)}>
              <Text style={styles.cancel}>取消</Text>
            </Pressable>
            <Text style={styles.modalTitle}>專屬商務規則</Text>
            <Pressable
              disabled={busy || prompt.trim().length < 100}
              onPress={() => void storePrompt()}
            >
              <Text
                style={[
                  styles.save,
                  (busy || prompt.trim().length < 100) && styles.muted,
                ]}
              >
                儲存
              </Text>
            </Pressable>
          </View>
          <View style={styles.promptBody}>
            <Text style={styles.lead}>
              只限擁有者查看及修改；每次儲存都會保留版本。
            </Text>
            <TextInput
              multiline
              value={prompt}
              onChangeText={setPrompt}
              textAlignVertical="top"
              style={styles.promptInput}
            />
            <Text style={styles.meta}>
              {prompt.length.toLocaleString()} / 50,000 字
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
const label = (role: string) =>
  role === "owner" ? "擁有者" : role === "admin" ? "Admin" : "成員";
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, paddingBottom: 40, gap: 14 },
  lead: { fontFamily: fonts.body, color: colors.textMuted, lineHeight: 22 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontFamily: fonts.body,
    color: colors.text,
  },
  roleRow: { flexDirection: "row", gap: 8 },
  roleButton: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  roleButtonActive: { backgroundColor: colors.primary },
  roleButtonText: { fontFamily: fonts.bodyBold, color: colors.textMuted },
  roleButtonTextActive: { color: "#fff" },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 13,
    alignItems: "center",
  },
  primaryText: { fontFamily: fonts.bodyBold, color: "#fff" },
  disabled: { opacity: 0.45 },
  error: { backgroundColor: "#fef2f2", borderRadius: 12, padding: 12, gap: 5 },
  errorText: { fontFamily: fonts.body, color: "#b91c1c" },
  retry: { fontFamily: fonts.bodyBold, color: colors.primary },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.bodyBorder,
  },
  initial: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  initialText: { fontFamily: fonts.bodyBold, color: colors.text },
  flex: { flex: 1 },
  email: { fontFamily: fonts.bodyBold, color: colors.text, fontSize: 13 },
  meta: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  pending: {
    fontFamily: fonts.body,
    color: "#b45309",
    fontSize: 12,
    marginTop: 2,
  },
  smallButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  smallText: { fontFamily: fonts.bodyBold, color: colors.text, fontSize: 10 },
  promptButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.bgCard,
  },
  promptText: { fontFamily: fonts.bodyBold, color: colors.primary },
  modalHeader: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.bodyBorder,
  },
  modalTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.text },
  cancel: { fontFamily: fonts.body, color: colors.textMuted },
  save: { fontFamily: fonts.bodyBold, color: colors.primary },
  muted: { opacity: 0.35 },
  promptBody: { flex: 1, padding: 18, gap: 12 },
  promptInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 14,
    padding: 14,
    fontFamily: fonts.body,
    color: colors.text,
  },
});
