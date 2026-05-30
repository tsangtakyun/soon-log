import { enrichIdeaFromUrl } from '@/lib/ideaEnrichment';
import { mergeLocalIdeaBoards } from '@/lib/ideaBoards';
import { supabase } from '@/lib/supabase';

export const SHARE_INTENT_URL = 'soonlog://dataUrl=soonlogShareKey#weburl';

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, any> | null;
};

export function extractSharedUrl(text?: string | null) {
  return text?.match(/https?:\/\/[^\s]+/)?.[0]?.replace(/[),.]+$/, '') ?? '';
}

export function boardsFromShareMeta(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];

    try {
      return boardsFromShareMeta(JSON.parse(text));
    } catch {
      return text.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }

  return [];
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const next = value.trim();
    if (next && !seen.has(next)) {
      seen.add(next);
      result.push(next);
    }
  });

  return result;
}

export async function resolveWorkspaceId(user: AuthUser) {
  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (member?.workspace_id) return member.workspace_id as string;

  const { data: existing } = await supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from('workspaces')
    .insert({
      name: 'SOON-LOG',
      type: 'mixed',
      owner: user.email ?? null,
      owner_id: user.id
    })
    .select('id')
    .maybeSingle();

  if (error || !created?.id) return null;

  await supabase
    .from('workspace_members')
    .insert({
      workspace_id: created.id,
      user_id: user.id,
      email: user.email ?? null,
      display_name: user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'SOON',
      role: 'owner',
      status: 'active',
      invited_by: user.id
    });

  return created.id as string;
}

type ExistingIdea = {
  id: string;
  categories?: string[] | null;
  thumb?: string | null;
};

function isMissingColumnError(error: unknown, column: string) {
  const text = JSON.stringify(error).toLowerCase();
  return text.includes(column.toLowerCase()) && (text.includes('schema cache') || text.includes('column'));
}

function missingColumnName(error: unknown) {
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : JSON.stringify(error);

  if (!message.includes('schema cache') && !message.includes('Could not find')) return '';
  return message.match(/'([^']+)' column/)?.[1] ?? '';
}

async function findExistingIdea(userId: string, url: string): Promise<ExistingIdea | null> {
  const { data: bySource } = await supabase
    .from('ideas')
    .select('id, categories, thumb')
    .eq('user_id', userId)
    .eq('source_url', url)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (bySource?.id) return bySource as ExistingIdea;

  const { data: byUrl } = await supabase
    .from('ideas')
    .select('id, categories, thumb')
    .eq('user_id', userId)
    .eq('url', url)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return byUrl?.id ? byUrl as ExistingIdea : null;
}

async function updateExistingSharedIdea(existing: ExistingIdea, boardCategories: string[], previewImage: string, videoUrl: string) {
  const nextCategories = unique([...(Array.isArray(existing.categories) ? existing.categories : []), ...boardCategories]);
  const update: Record<string, unknown> = {
    categories: nextCategories
  };

  if (previewImage && !existing.thumb) {
    update.thumb = previewImage;
  }

  if (videoUrl) {
    update.video_url = videoUrl;
  }

  const { error } = await supabase
    .from('ideas')
    .update(update)
    .eq('id', existing.id);

  if (error && isMissingColumnError(error, 'video_url') && 'video_url' in update) {
    delete update.video_url;
    const { error: retryError } = await supabase
      .from('ideas')
      .update(update)
      .eq('id', existing.id);

    if (retryError) throw retryError;
  } else if (error) {
    throw error;
  }

  return nextCategories;
}

export async function saveSharedIdea(params: {
  user: AuthUser;
  url: string;
  selectedBoard?: string;
  sharedBoards?: string[];
  previewImage?: string;
  videoUrl?: string;
  sharedText?: string;
}) {
  const { user, url, selectedBoard = '', sharedBoards = [], previewImage = '', videoUrl = '', sharedText = '' } = params;
  const initialDescription = sharedText.trim();
  const boardCategories = unique(selectedBoard ? [selectedBoard] : []);
  const allBoards = unique([...sharedBoards, selectedBoard]);

  if (allBoards.length > 0) {
    await mergeLocalIdeaBoards(allBoards);
  }

  const existingIdea = await findExistingIdea(user.id, url);
  if (existingIdea) {
    const nextCategories = await updateExistingSharedIdea(existingIdea, boardCategories, previewImage, videoUrl);
    enrichIdeaFromUrl(existingIdea.id, url, nextCategories, sharedText).catch((error) => {
      console.log('[share-idea] existing background enrich skipped', error);
    });
    return { id: existingIdea.id, existing: true };
  }

  const workspaceId = await resolveWorkspaceId(user);
  const insertPayload: Record<string, unknown> = {
    workspace_id: workspaceId,
    user_id: user.id,
    url,
    thumb: previewImage || null,
    video_url: videoUrl || null,
    title: 'IG Reel 靈感',
    topic: 'IG Reel 靈感',
    summary: initialDescription || '已由 Instagram 儲存，AI 會稍後補充題材資料。',
    script_hook: '',
    country: 'HK',
    platform: 'instagram',
    tags: ['instagram', '待分析'],
    categories: boardCategories,
    place_name: '',
    place_address: '',
    shop_highlights: '',
    viral_score: 0,
    ai_viral_base: 0,
    date: new Date().toISOString(),
    notes: initialDescription ? '由分享 payload 自動帶入。' : '',
    lat: null,
    lng: null,
    description: initialDescription,
    hook: '',
    region: 'HK',
    viral_potential: 'medium',
    source_url: url
  };

  let savedId: string | undefined;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase
      .from('ideas')
      .insert(insertPayload)
      .select('id')
      .single();

    if (!error) {
      savedId = data?.id as string | undefined;
      break;
    }

    lastError = error;
    const column = missingColumnName(error);
    if (!column || !(column in insertPayload)) break;
    delete insertPayload[column];
  }

  if (!savedId && lastError) {
    throw lastError;
  }

  if (savedId) {
    enrichIdeaFromUrl(savedId, url, boardCategories, sharedText).catch((error) => {
      console.log('[share-idea] background enrich skipped', error);
    });
  }

  return { id: savedId as string, existing: false };
}
