import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

const apiBase = (
  process.env.EXPO_PUBLIC_EGG_API_URL || "https://egg.sooncreator.network"
).replace(/\/$/, "");
const activeWorkspaceKey = "egg-active-workspace-id";

async function eggAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("請先登入");
  const workspaceId = await AsyncStorage.getItem(activeWorkspaceKey);
  return {
    authorization: `Bearer ${session.access_token}`,
    ...(workspaceId ? { "x-egg-workspace-id": workspaceId } : {}),
  };
}

export type EggWorkspace = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean | null;
  role: "owner" | "admin" | "member";
};

export type EggBootstrap = {
  user: { id: string; email: string | null };
  workspaces: EggWorkspace[];
  activeWorkspace: EggWorkspace | null;
  creator: {
    id: string;
    username: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    instagram_handle: string | null;
    instagram_followers: number | null;
    instagram_engagement_rate: number | null;
    onboarding_completed: boolean | null;
    ai_profile_summary: string | null;
  } | null;
  metrics: {
    pendingDeals: number;
    latest: {
      followers: number | null;
      engagement_rate: number | null;
      reach_7d: number | null;
      accounts_engaged_7d: number | null;
      captured_at: string;
    } | null;
    previous: {
      followers: number | null;
      engagement_rate: number | null;
      reach_7d: number | null;
      accounts_engaged_7d: number | null;
      captured_at: string;
    } | null;
  } | null;
};

export async function loadEggBootstrap(
  workspaceId?: string | null,
): Promise<EggBootstrap> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("請先登入");
  // Only send a workspace ID when the user actively switches. Otherwise the
  // server preference is canonical, so a choice made on web is reflected here.
  const selectedId = workspaceId ?? null;
  const response = await fetch(`${apiBase}/api/mobile/bootstrap`, {
    headers: {
      authorization: `Bearer ${session.access_token}`,
      ...(selectedId ? { "x-egg-workspace-id": selectedId } : {}),
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能連接 Egg 工作空間");
  if (result.activeWorkspace?.id)
    await AsyncStorage.setItem(activeWorkspaceKey, result.activeWorkspace.id);
  return result as EggBootstrap;
}

export async function rememberEggWorkspace(workspaceId: string) {
  await AsyncStorage.setItem(activeWorkspaceKey, workspaceId);
}

export type EggTeamMember = {
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member";
  created_at?: string;
};

export type EggTeamInvitation = {
  id: string;
  email: string;
  role: "admin" | "member";
  expires_at?: string;
  created_at?: string;
};

export async function loadEggTeam() {
  const response = await fetch(`${apiBase}/api/mobile/team`, {
    headers: await eggAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能載入團隊成員");
  return result as {
    members: EggTeamMember[];
    invitations: EggTeamInvitation[];
    currentRole: "owner" | "admin" | "member";
  };
}

export async function updateEggTeam(payload: Record<string, unknown>) {
  const response = await fetch(`${apiBase}/api/mobile/team`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await eggAuthHeaders()),
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能更新團隊成員");
  return result;
}

export async function loadEggPrompt() {
  const response = await fetch(`${apiBase}/api/mobile/prompt`, {
    headers: await eggAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能載入商務規則");
  return result as { systemPrompt: string; updatedAt: string | null };
}

export async function saveEggPrompt(systemPrompt: string) {
  const response = await fetch(`${apiBase}/api/mobile/prompt`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(await eggAuthHeaders()),
    },
    body: JSON.stringify({ systemPrompt }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能儲存商務規則");
}

export type EggSettingsProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  content_categories: string[] | null;
  instagram_handle: string | null;
  instagram_followers: number | null;
  facebook_handle: string | null;
  threads_handle: string | null;
  youtube_handle: string | null;
  tiktok_handle: string | null;
  xiaohongshu_handle: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
};

export type EggProfileLink = {
  id: string;
  title: string;
  url: string;
  is_visible: boolean;
  sort_order: number;
};

export async function loadEggSettings() {
  const response = await fetch(`${apiBase}/api/mobile/settings`, {
    headers: await eggAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能載入設定");
  return result as {
    profile: EggSettingsProfile;
    links: EggProfileLink[];
    email: string | null;
    role: "owner" | "admin" | "member";
    canEdit: boolean;
  };
}

export async function checkEggUsername(username: string) {
  const response = await fetch(
    `${apiBase}/api/mobile/settings?username=${encodeURIComponent(username)}`,
    { headers: await eggAuthHeaders() },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能檢查用戶名");
  return Boolean(result.available);
}

export async function saveEggSettings(payload: Record<string, unknown>) {
  const response = await fetch(`${apiBase}/api/mobile/settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await eggAuthHeaders()),
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能儲存設定");
  return result;
}

export async function uploadEggAvatar(uri: string, mimeType = "image/jpeg") {
  const form = new FormData();
  form.append("file", {
    uri,
    type: mimeType,
    name: `avatar.${mimeType === "image/png" ? "png" : "jpg"}`,
  } as unknown as Blob);
  const response = await fetch(`${apiBase}/api/mobile/avatar`, {
    method: "POST",
    headers: await eggAuthHeaders(),
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "頭像上傳失敗");
  return result.avatarUrl as string;
}

export type EggProduct = {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  product_type: "physical" | "digital" | "service" | "workshop" | "other";
  thumbnail_url: string | null;
  external_url: string | null;
  stock: number | null;
  is_unlimited_stock: boolean | null;
  is_active: boolean | null;
};

export async function loadEggProducts() {
  const response = await fetch(`${apiBase}/api/mobile/products`, {
    headers: await eggAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能載入產品");
  return result as { products: EggProduct[]; canEdit: boolean };
}

export async function saveEggProduct(payload: Record<string, unknown>) {
  const response = await fetch(`${apiBase}/api/mobile/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await eggAuthHeaders()),
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能更新產品");
  return result;
}

export type EggScript = {
  id: string;
  title?: string | null;
  topic?: string | null;
  background?: string | null;
  ai_draft?: string | null;
  created_at?: string | null;
};

export async function generateEggScript(payload: Record<string, unknown>) {
  const response = await fetch(`${apiBase}/api/tools/script/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await eggAuthHeaders()),
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能生成劇本");
  return result as {
    script: string;
    script_id?: string;
    saved?: EggScript | null;
  };
}

export async function loadEggScripts(): Promise<EggScript[]> {
  const response = await fetch(`${apiBase}/api/mobile/scripts`, {
    headers: await eggAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能載入劇本");
  return result.scripts ?? [];
}

export async function deleteEggScript(id: string) {
  const response = await fetch(
    `${apiBase}/api/mobile/scripts?id=${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: await eggAuthHeaders(),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能刪除劇本");
}

export type EggReplyBrief = {
  summary?: string;
  brand?: string;
  contact?: string;
  collaborationType?: string;
  deliverables?: string[];
  timeline?: string;
  usageRights?: string;
  exclusivity?: string;
  budget?: string;
  missing?: string[];
  risks?: string[];
  nextSteps?: string[];
};

export type EggReplyProject = {
  id: string;
  name: string;
  brief: EggReplyBrief;
  updated_at: string;
};

export type EggReplyMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export async function loadEggReplyWorkspace(projectId?: string) {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const response = await fetch(`${apiBase}/api/mobile/reply${query}`, {
    headers: await eggAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能載入回覆中心");
  return result as {
    projects: EggReplyProject[];
    activeProjectId: string | null;
    messages: EggReplyMessage[];
  };
}

export async function createEggReplyProject(name: string) {
  const response = await fetch(`${apiBase}/api/mobile/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await eggAuthHeaders()),
    },
    body: JSON.stringify({ action: "create_project", name }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能建立 Project");
  return result.project as EggReplyProject;
}

export async function generateEggReply(payload: {
  projectId: string;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  image?: { data: string; mediaType: string };
}) {
  const response = await fetch(`${apiBase}/api/mobile/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await eggAuthHeaders()),
    },
    body: JSON.stringify({ action: "chat", ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能生成回覆");
  return result as { reply: string; brief: EggReplyBrief; warning?: string };
}

export type EggAnalyticsSnapshot = {
  snapshot_date: string;
  followers: number;
  engagement_rate: number | null;
  reach_7d: number | null;
  accounts_engaged_7d: number | null;
  total_interactions_7d: number | null;
  captured_at: string;
};

export type EggInstagramMedia = {
  id: string;
  media_type: string | null;
  media_product_type?: string | null;
  caption: string | null;
  permalink: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  views: number | null;
  reach: number | null;
  plays: number | null;
  total_interactions: number | null;
  like_count: number | null;
  comments_count: number | null;
  published_at: string | null;
};

export type EggAnalytics = {
  instagram: {
    connected: boolean;
    handle: string | null;
    followers: number | null;
    engagementRate: number | null;
    sync: {
      synced_at?: string;
      engagement_sample_size?: number;
      reach_7d?: number | null;
      accounts_engaged_7d?: number | null;
      total_interactions_7d?: number | null;
    };
    snapshots: EggAnalyticsSnapshot[];
    topMedia: EggInstagramMedia[];
  };
  threads: { connected: boolean; message: string };
};

export async function loadEggAnalytics(): Promise<EggAnalytics> {
  const response = await fetch(`${apiBase}/api/mobile/analytics`, {
    headers: await eggAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能載入社交平台數據");
  return result as EggAnalytics;
}

export async function syncEggInstagram() {
  const response = await fetch(`${apiBase}/api/mobile/analytics`, {
    method: "POST",
    headers: await eggAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能更新 Instagram 數據");
  return result as {
    success: boolean;
    syncedAt: string;
    engagementUnavailableReason?: string | null;
    insightsUnavailableReason?: string | null;
  };
}

export type EggMediaKitProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  contact_email: string | null;
  instagram_handle: string | null;
  mediakit_is_public: boolean | null;
  mediakit_allow_matching: boolean | null;
  mediakit_about_title: string | null;
  mediakit_bio: string | null;
  mediakit_collab_title: string | null;
  mediakit_collab_message: string | null;
  mediakit_layout: string | null;
  mediakit_font: string | null;
  mediakit_color_preset: string | null;
  mediakit_bg_color: string | null;
  mediakit_text_color: string | null;
  mediakit_accent_color: string | null;
  mediakit_accent_text_color: string | null;
  mediakit_lock_contact: boolean | null;
  mediakit_lock_about: boolean | null;
  mediakit_lock_case_studies: boolean | null;
  mediakit_lock_brand_partners: boolean | null;
  mediakit_lock_rates: boolean | null;
  mediakit_lock_analytics: boolean | null;
};

export type EggRateCard = {
  id: string;
  service_name: string;
  service_name_zh: string | null;
  platform: string | null;
  price: number;
  currency: string | null;
  description: string | null;
  is_starting_price: boolean | null;
};

export type EggMediaKit = {
  profile: EggMediaKitProfile;
  rates: EggRateCard[];
  caseStudies: Array<{
    id: string;
    title: string;
    brand_name: string | null;
    description: string | null;
    result: string | null;
    image_url: string | null;
    link_url: string | null;
  }>;
  brandPartners: Array<{
    id: string;
    brand_name: string;
    brand_logo_url: string | null;
  }>;
  media: Array<
    EggInstagramMedia & { is_featured: boolean; sort_order: number }
  >;
  canEdit: boolean;
};

export async function loadEggMediaKit(): Promise<EggMediaKit> {
  const response = await fetch(`${apiBase}/api/mobile/media-kit`, {
    headers: await eggAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能載入 Media Kit");
  return result as EggMediaKit;
}

export async function updateEggMediaKit(payload: Record<string, unknown>) {
  const response = await fetch(`${apiBase}/api/mobile/media-kit`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(await eggAuthHeaders()),
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能更新 Media Kit");
  return result as { success: boolean; id?: string };
}

export type EggCampaign = {
  id: string;
  name: string;
  theme: string | null;
  status: string | null;
  starts_on: string | null;
  duration_weeks: number | null;
  target_audience: string | null;
  call_to_action: string | null;
  cover_image_url: string | null;
  workspace_id: string;
  application_deadline: string | null;
  brand_overview: string | null;
  brand_website: string | null;
  budget_range: string | null;
  collab_formats: string[];
  workspaces?: { name?: string | null } | null;
};

export type EggDealRecord = {
  id: string;
  cw_campaign_id: string;
  campaign_name: string | null;
  brand_name: string | null;
  cover_image_url: string | null;
  theme: string | null;
  call_to_action: string | null;
  starts_on: string | null;
  status: string;
  applied_at?: string | null;
  sent_at?: string | null;
  responded_at?: string | null;
  brand_overview?: string | null;
  brand_website?: string | null;
  budget_range?: string | null;
  duration_weeks?: number | null;
  collab_formats?: string[] | null;
  message?: string | null;
};

export type EggDeals = {
  campaigns: EggCampaign[];
  applications: EggDealRecord[];
  invitations: EggDealRecord[];
};

export async function loadEggDeals(): Promise<EggDeals> {
  const response = await fetch(`${apiBase}/api/mobile/deals`, {
    headers: await eggAuthHeaders(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能載入合作機會");
  return result as EggDeals;
}

export async function updateEggDeal(payload: Record<string, unknown>) {
  const response = await fetch(`${apiBase}/api/mobile/deals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await eggAuthHeaders()),
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "未能更新合作狀態");
  return result as { success: boolean };
}
