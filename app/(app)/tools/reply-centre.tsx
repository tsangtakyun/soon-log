import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { BackHeader } from "@/components/BackHeader";
import {
  createEggReplyProject,
  generateEggReply,
  loadEggReplyWorkspace,
  type EggReplyBrief,
  type EggReplyMessage,
  type EggReplyProject,
} from "@/lib/eggApi";

type Panel = "projects" | "brief" | "chat";
type Attachment = { data: string; mediaType: string; name: string };
type FeedbackMode = "project" | "workspace_rule";

export default function ReplyCentreScreen() {
  const params = useLocalSearchParams<{
    sharedUrl?: string;
    sharedText?: string;
    sharedImage?: string;
    sharedMime?: string;
  }>();
  const didApplySharedContent = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const loadSequence = useRef(0);
  const hasLoaded = useRef(false);
  const [projects, setProjects] = useState<EggReplyProject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<EggReplyMessage[]>([]);
  const [panel, setPanel] = useState<Panel>("chat");
  const [input, setInput] = useState("");
  const [image, setImage] = useState<Attachment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [newProjectVisible, setNewProjectVisible] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>("project");
  const activeProject = useMemo(
    () =>
      projects.find((project) => project.id === activeId) ??
      projects[0] ??
      null,
    [activeId, projects],
  );

  useEffect(() => {
    if (didApplySharedContent.current) return;
    const sharedUrl = typeof params.sharedUrl === "string" ? params.sharedUrl.trim() : "";
    const sharedText = typeof params.sharedText === "string" ? params.sharedText.trim() : "";
    const sharedImage = typeof params.sharedImage === "string" ? params.sharedImage.trim() : "";
    if (!sharedUrl && !sharedText && !sharedImage) return;

    didApplySharedContent.current = true;
    setInput([sharedText, sharedUrl].filter(Boolean).join("\n\n"));
    setPanel("chat");

    if (sharedImage && !/^https?:\/\//i.test(sharedImage)) {
      void FileSystem.readAsStringAsync(sharedImage, {
        encoding: FileSystem.EncodingType.Base64,
      }).then((data) => {
        if (data.length > 4_000_000) {
          setError("分享截圖太大，請在回覆中心重新選擇較細圖片。");
          return;
        }
        setImage({
          data,
          mediaType: params.sharedMime || "image/jpeg",
          name: "分享截圖",
        });
      }).catch(() => {
        setError("未能讀取分享截圖，請在回覆中心重新選擇圖片。");
      });
    }
  }, [params.sharedImage, params.sharedMime, params.sharedText, params.sharedUrl]);

  const load = useCallback(async (projectId?: string, quiet = false) => {
    const sequence = ++loadSequence.current;
    if (!quiet) setLoading(true);
    try {
      const result = await loadEggReplyWorkspace(projectId);
      if (sequence !== loadSequence.current) return;
      setProjects(result.projects);
      setActiveId(result.activeProjectId);
      activeIdRef.current = result.activeProjectId;
      setMessages(result.messages);
      setFeedbackMode("project");
      setError("");
      hasLoaded.current = true;
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setError(cause instanceof Error ? cause.message : "未能載入回覆中心");
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(activeIdRef.current ?? undefined, hasLoaded.current);
    }, [load]),
  );

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) return;
    try {
      const project = await createEggReplyProject(name);
      setProjects((current) => [project, ...current]);
      setActiveId(project.id);
      activeIdRef.current = project.id;
      setMessages([]);
      setNewProjectName("");
      setNewProjectVisible(false);
      setPanel("chat");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "建立 Project 失敗");
    }
  }

  async function chooseImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted)
      return Alert.alert("需要相片權限", "請允許 SOON-EGG 選取品牌查詢截圖。");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.72,
      base64: true,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    if (asset.base64.length > 4_000_000)
      return Alert.alert("圖片太大", "請先裁剪截圖或選擇較細圖片。");
    setImage({
      data: asset.base64,
      mediaType: asset.mimeType || "image/jpeg",
      name: asset.fileName || "品牌查詢截圖",
    });
  }

  async function send() {
    if (!activeProject || sending) return;
    const clean =
      input.trim() || (image ? "請閱讀截圖，整理查詢並草擬第一輪回覆。" : "");
    if (!clean) return;
    const attachment = image;
    const optimistic: EggReplyMessage = {
      role: "user",
      content: attachment ? `${clean}\n\n[已附上截圖]` : clean,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setInput("");
    setImage(null);
    setSending(true);
    setError("");
    try {
      const result = await generateEggReply({
        projectId: activeProject.id,
        message: clean,
        history: messages
          .slice(-6)
          .map(({ role, content }) => ({ role, content })),
        feedbackMode,
        image: attachment
          ? { data: attachment.data, mediaType: attachment.mediaType }
          : undefined,
      });
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: result.reply,
          created_at: new Date().toISOString(),
        },
      ]);
      setProjects((current) =>
        current.map((project) =>
          project.id === activeProject.id
            ? {
                ...project,
                name: result.projectName || project.name,
                brief: result.brief,
                updated_at: new Date().toISOString(),
              }
            : project,
        ),
      );
      if (result.ruleSaved) Alert.alert("商務規則已儲存", "呢個修改之後其他客戶都會套用，舊版本亦已保留。");
      setFeedbackMode("project");
      if (result.warning) setError(result.warning);
    } catch (cause) {
      setMessages((current) =>
        current.filter((message) => message !== optimistic),
      );
      setInput(clean);
      setImage(attachment);
      setError(cause instanceof Error ? cause.message : "AI 暫時處理唔到");
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={8}
    >
      <BackHeader title="回覆中心" backTo="/(egg)/creator/home" />
      <View style={styles.segment}>
        {(
          [
            ["projects", "Projects"],
            ["brief", "Brief"],
            ["chat", "AI 回覆"],
          ] as const
        ).map(([value, label]) => (
          <TouchableOpacity
            key={value}
            style={[
              styles.segmentButton,
              panel === value && styles.segmentActive,
            ]}
            onPress={() => setPanel(value)}
          >
            <Text
              style={[
                styles.segmentText,
                panel === value && styles.segmentTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => void load(activeId ?? undefined)}>
            <Text style={styles.retry}>重試</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#6b2218" />
          <Text style={styles.muted}>正在同步網站資料…</Text>
        </View>
      ) : (
        <>
          {panel === "projects" ? (
            <ProjectsPanel
              projects={projects}
              activeId={activeProject?.id}
              onSelect={(id) => {
                setPanel("chat");
                activeIdRef.current = id;
                void load(id);
              }}
              onAdd={() => setNewProjectVisible(true)}
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(activeId ?? undefined, true);
              }}
            />
          ) : null}
          {panel === "brief" ? <BriefPanel project={activeProject} /> : null}
          {panel === "chat" ? (
            <ChatPanel
              project={activeProject}
              messages={messages}
              input={input}
              image={image}
              sending={sending}
              feedbackMode={feedbackMode}
              onInput={setInput}
              onFeedbackMode={setFeedbackMode}
              onImage={chooseImage}
              onRemoveImage={() => setImage(null)}
              onSend={send}
              onShowProjects={() => setPanel("projects")}
            />
          ) : null}
        </>
      )}
      <Modal
        visible={newProjectVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNewProjectVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setNewProjectVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>建立 Project</Text>
            <TextInput
              autoFocus
              value={newProjectName}
              onChangeText={(value) => setNewProjectName(value.slice(0, 80))}
              placeholder="品牌／聯絡人名稱"
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setNewProjectVisible(false)}>
                <Text style={styles.cancel}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => void createProject()}
              >
                <Text style={styles.primaryText}>建立</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function ProjectsPanel({
  projects,
  activeId,
  onSelect,
  onAdd,
  refreshing,
  onRefresh,
}: {
  projects: EggReplyProject[];
  activeId?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={styles.contentPad}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.heading}>Projects</Text>
          <Text style={styles.muted}>網站與 App 共用同一份資料</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={onAdd}>
          <Feather name="plus" size={16} color="white" />
          <Text style={styles.primaryText}>新增</Text>
        </TouchableOpacity>
      </View>
      {projects.length ? (
        projects.map((project) => (
          <TouchableOpacity
            key={project.id}
            style={[
              styles.projectCard,
              project.id === activeId && styles.projectActive,
            ]}
            onPress={() => onSelect(project.id)}
          >
            <View style={styles.projectIcon}>
              <Feather name="folder" size={18} color="#6b2218" />
            </View>
            <View style={styles.flex}>
              <Text style={styles.projectName}>{project.name}</Text>
              <Text style={styles.muted} numberOfLines={1}>
                {project.brief?.summary || "尚未建立 Brief"}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="#9ca3af" />
          </TouchableOpacity>
        ))
      ) : (
        <Empty
          title="未有 Project"
          text="新增品牌或聯絡人，然後貼入第一個查詢。"
        />
      )}
    </ScrollView>
  );
}

function BriefPanel({ project }: { project: EggReplyProject | null }) {
  const brief = project?.brief;
  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={styles.contentPad}
    >
      <Text style={styles.heading}>Enquiry Brief</Text>
      <Text style={styles.muted}>
        {project?.name || "未選擇 Project"} · 每次生成後自動更新
      </Text>
      {!brief || !Object.keys(brief).length ? (
        <Empty
          title="尚未建立 Brief"
          text="放入品牌查詢截圖或文字後，AI 會自動整理。"
        />
      ) : (
        <View style={styles.briefSections}>
          <View style={styles.summaryCard}><Text style={styles.summaryLabel}>查詢摘要</Text><Text style={styles.summaryText}>{brief.summary || "未提供"}</Text></View>
          <View style={styles.briefCard}><Text style={styles.groupTitle}>已知資料</Text><BriefField label="品牌／Agency" value={brief.brand} /><BriefField label="聯絡人" value={brief.contact} /><BriefField label="合作類型" value={brief.collaborationType} /><BriefField label="預算" value={brief.budget} /><BriefField label="Timeline" value={brief.timeline} /><BriefField label="Deliverables" value={brief.deliverables?.join("、")} /></View>
          <View style={styles.briefCard}><Text style={styles.groupTitle}>商務條款</Text><BriefField label="廣告授權／使用權" value={brief.usageRights} /><BriefField label="排他條款" value={brief.exclusivity} /></View>
          <BriefList label="待客戶補充" items={brief.missing} tone="missing" />
          <BriefList label="商業風險" items={brief.risks} tone="risk" />
          <BriefList label="建議下一步" items={brief.nextSteps} tone="next" />
        </View>
      )}
    </ScrollView>
  );
}

function ChatPanel({
  project,
  messages,
  input,
  image,
  sending,
  feedbackMode,
  onInput,
  onFeedbackMode,
  onImage,
  onRemoveImage,
  onSend,
  onShowProjects,
}: {
  project: EggReplyProject | null;
  messages: EggReplyMessage[];
  input: string;
  image: Attachment | null;
  sending: boolean;
  feedbackMode: FeedbackMode;
  onInput: (value: string) => void;
  onFeedbackMode: (value: FeedbackMode) => void;
  onImage: () => void;
  onRemoveImage: () => void;
  onSend: () => void;
  onShowProjects: () => void;
}) {
  return (
    <View style={styles.flex}>
      <View style={styles.chatHeader}>
        <View style={styles.flex}>
          <Text style={styles.heading}>{project?.name || "AI 客戶回覆"}</Text>
          <Text style={styles.muted}>只會草擬回覆，不會自動傳送或接受合作</Text>
        </View>
        <TouchableOpacity onPress={onShowProjects}>
          <Feather name="folder" size={20} color="#6b2218" />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.messages}
        bounces={false}
        overScrollMode="never"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {messages.length ? (
          messages.map((message, index) => (
            <MessageBubble
              key={message.id || `${message.role}-${index}`}
              message={message}
            />
          ))
        ) : (
          <Empty
            title="放入品牌查詢截圖"
            text="支援 WhatsApp、Instagram DM、Email 截圖或完整文字。"
          />
        )}
        {sending ? (
          <View style={styles.generating}>
            <ActivityIndicator size="small" color="#6b2218" />
            <Text style={styles.muted}>正在建立 Brief 及草擬回覆…</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.composer}>
        {messages.some((message) => message.role === "assistant") ? (
          <View style={styles.feedbackModes}>
            <TouchableOpacity style={[styles.feedbackMode, feedbackMode === "project" && styles.feedbackModeActive]} onPress={() => onFeedbackMode("project")}><Text style={[styles.feedbackModeText, feedbackMode === "project" && styles.feedbackModeTextActive]}>只修改今次草稿</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.feedbackMode, feedbackMode === "workspace_rule" && styles.ruleModeActive]} onPress={() => onFeedbackMode("workspace_rule")}><Text style={[styles.feedbackModeText, feedbackMode === "workspace_rule" && styles.feedbackModeTextActive]}>儲存為商務規則</Text></TouchableOpacity>
          </View>
        ) : null}
        {feedbackMode === "workspace_rule" ? <Text style={styles.ruleHint}>呢段修改會套用到 Workspace 之後所有客戶，並保留版本。</Text> : null}
        {image ? (
          <View style={styles.attachment}>
            <Feather name="image" size={18} color="#6b2218" />
            <Text style={styles.attachmentName} numberOfLines={1}>
              {image.name}
            </Text>
            <TouchableOpacity onPress={onRemoveImage}>
              <Feather name="x" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.composerRow}>
          <TouchableOpacity style={styles.iconButton} onPress={onImage}>
            <Feather name="image" size={20} color="#6b2218" />
          </TouchableOpacity>
          <TextInput
            style={styles.messageInput}
            multiline
            value={input}
            onChangeText={(value) => onInput(value.slice(0, 8000))}
            placeholder="貼上 Email／DM／WhatsApp…"
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              ((!input.trim() && !image) || sending || !project) &&
                styles.disabled,
            ]}
            disabled={(!input.trim() && !image) || sending || !project}
            onPress={onSend}
          >
            <Feather name="send" size={19} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: EggReplyMessage }) {
  const user = message.role === "user";
  return (
    <View style={[styles.bubbleRow, user && styles.bubbleRowUser]}>
      <View style={[styles.bubble, user ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.bubbleText, user && styles.userBubbleText]}>
          {message.content}
        </Text>
        {!user ? (
          <TouchableOpacity
            style={styles.copyRow}
            onPress={async () => {
              await Clipboard.setStringAsync(message.content);
              Alert.alert("已複製回覆草稿");
            }}
          >
            <Feather name="copy" size={14} color="#6b7280" />
            <Text style={styles.copyText}>複製草稿</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
function BriefField({ label, value }: { label: string; value?: string }) {
  const missing = !value || value === "未提供";
  return (
    <View style={styles.briefField}>
      <Text style={styles.label}>{label}</Text>
      {missing ? <Text style={styles.missingBadge}>未提供</Text> : <Text style={styles.body}>{value}</Text>}
    </View>
  );
}
function BriefList({
  label,
  items,
  tone,
}: {
  label: string;
  items?: string[];
  tone: "missing" | "risk" | "next";
}) {
  return (
    <View style={[styles.listBox, tone === "missing" && styles.missingBox, tone === "risk" && styles.riskBox, tone === "next" && styles.nextBox]}>
      <View style={styles.listHeader}><Text style={styles.listTitle}>{label}</Text><Text style={styles.countBadge}>{items?.length ?? 0}</Text></View>
      <Text style={styles.body}>
        {items?.length
          ? items.map((item) => `• ${item}`).join("\n")
          : "暫未發現"}
      </Text>
    </View>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Feather name="message-circle" size={32} color="#c7b6ae" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8f5f1" },
  flex: { flex: 1 },
  content: { flex: 1 },
  contentPad: { padding: 20, gap: 12 },
  segment: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginVertical: 10,
    padding: 4,
    borderRadius: 14,
    backgroundColor: "#eee8e3",
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 11,
  },
  segmentActive: { backgroundColor: "#181311" },
  segmentText: { color: "#6b7280", fontWeight: "600" },
  segmentTextActive: { color: "white" },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff0ef",
    flexDirection: "row",
    gap: 10,
  },
  errorText: { flex: 1, color: "#a51d16" },
  retry: { color: "#8b1e14", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { color: "#7b7f88", fontSize: 13, lineHeight: 19 },
  heading: { color: "#181311", fontSize: 20, fontWeight: "800" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  primaryButton: {
    backgroundColor: "#6b2218",
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  primaryText: { color: "white", fontWeight: "700" },
  projectCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e8e0da",
    borderRadius: 16,
    padding: 14,
  },
  projectActive: { borderColor: "#8b3b2f", backgroundColor: "#fff9f5" },
  projectIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5e9e2",
  },
  projectName: { fontWeight: "700", color: "#181311", marginBottom: 3 },
  briefCard: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e8e0da",
  },
  briefSections: { marginTop: 16, gap: 12 },
  summaryCard: { borderRadius: 18, padding: 18, backgroundColor: "#181311" },
  summaryLabel: { color: "#aaa3a0", fontSize: 11, fontWeight: "800", marginBottom: 8 },
  summaryText: { color: "white", fontSize: 15, lineHeight: 23 },
  groupTitle: { color: "#181311", fontSize: 14, fontWeight: "800", marginBottom: 14 },
  briefField: { marginBottom: 16 },
  label: { color: "#6b7280", fontSize: 12, fontWeight: "700", marginBottom: 5 },
  body: { color: "#24201e", lineHeight: 21 },
  missingBadge: { alignSelf: "flex-start", color: "#9a5b00", backgroundColor: "#fff6df", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, fontSize: 12, fontWeight: "700" },
  listBox: {
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#f7f5f3",
    marginBottom: 12,
  },
  missingBox: { backgroundColor: "#fff6df", borderWidth: 1, borderColor: "#f1d695" },
  riskBox: { backgroundColor: "#fff0ef", borderWidth: 1, borderColor: "#efc0ba" },
  nextBox: { backgroundColor: "#edf9f1", borderWidth: 1, borderColor: "#b8e2c6" },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 7 },
  listTitle: { color: "#24201e", fontSize: 12, fontWeight: "800" },
  countBadge: { backgroundColor: "rgba(255,255,255,0.75)", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, fontSize: 11, fontWeight: "700", color: "#6b7280" },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e8e0da",
  },
  messages: { flexGrow: 1, padding: 16, gap: 12 },
  bubbleRow: { flexDirection: "row", justifyContent: "flex-start" },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubble: { maxWidth: "88%", borderRadius: 18, padding: 13 },
  userBubble: { backgroundColor: "#181311", borderBottomRightRadius: 5 },
  aiBubble: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e8e0da",
    borderBottomLeftRadius: 5,
  },
  bubbleText: { color: "#24201e", lineHeight: 21 },
  userBubbleText: { color: "white" },
  copyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
  },
  copyText: { color: "#6b7280", fontSize: 12 },
  generating: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    padding: 10,
  },
  composer: {
    padding: 12,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderColor: "#e8e0da",
  },
  feedbackModes: { flexDirection: "row", backgroundColor: "#eee8e3", padding: 4, borderRadius: 12, marginBottom: 8 },
  feedbackMode: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9 },
  feedbackModeActive: { backgroundColor: "white" },
  ruleModeActive: { backgroundColor: "#6d28d9" },
  feedbackModeText: { color: "#6b7280", fontSize: 11, fontWeight: "700" },
  feedbackModeTextActive: { color: "#181311" },
  ruleHint: { color: "#5b21b6", backgroundColor: "#f3e8ff", padding: 9, borderRadius: 9, marginBottom: 8, fontSize: 11, lineHeight: 16 },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3ece7",
  },
  messageInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: "#ddd4ce",
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#181311",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6b2218",
  },
  disabled: { opacity: 0.35 },
  attachment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 9,
    backgroundColor: "#f8f5f1",
    borderRadius: 10,
    padding: 9,
  },
  attachmentName: { flex: 1, color: "#403a37", fontSize: 13 },
  empty: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 25,
  },
  emptyTitle: { fontWeight: "700", color: "#302a27", marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  modalCard: { borderRadius: 20, padding: 20, backgroundColor: "white" },
  modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd4ce",
    borderRadius: 12,
    padding: 13,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 18,
    marginTop: 16,
  },
  cancel: { color: "#6b7280", fontWeight: "600" },
});
