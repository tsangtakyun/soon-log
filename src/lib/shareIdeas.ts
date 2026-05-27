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

async function findExistingIdea(userId: string, url: string) {
  const { data: bySource } = await supabase
    .from('ideas')
    .select('id')
    .eq('user_id', userId)
    .eq('source_url', url)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (bySource?.id) return bySource.id as string;

  const { data: byUrl } = await supabase
    .from('ideas')
    .select('id')
    .eq('user_id', userId)
    .eq('url', url)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return byUrl?.id ? byUrl.id as string : null;
}

export async function saveSharedIdea(params: {
  user: AuthUser;
  url: string;
  selectedBoard?: string;
  sharedBoards?: string[];
}) {
  const { user, url, selectedBoard = '', sharedBoards = [] } = params;
  const boardCategories = unique(selectedBoard ? [selectedBoard] : []);
  const allBoards = unique([...sharedBoards, selectedBoard]);

  if (allBoards.length > 0) {
    await mergeLocalIdeaBoards(allBoards);
  }

  const existingId = await findExistingIdea(user.id, url);
  if (existingId) {
    return { id: existingId, existing: true };
  }

  const workspaceId = await resolveWorkspaceId(user);
  const { data, error } = await supabase
    .from('ideas')
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      url,
      thumb: null,
      title: 'IG Reel 靈感',
      topic: 'IG Reel 靈感',
      summary: '已由 Instagram 儲存，AI 會稍後補充題材資料。',
      script_hook: '',
      country: 'HK',
      platform: 'instagram',
      tags: ['instagram', '待分析'],
      categories: boardCategories,
      place_name: '',
      place_address: '',
      viral_score: 0,
      ai_viral_base: 0,
      date: new Date().toISOString(),
      notes: '',
      lat: null,
      lng: null,
      description: '',
      hook: '',
      region: 'HK',
      viral_potential: 'medium',
      source_url: url
    })
    .select('id')
    .single();

  if (error) throw error;

  if (data?.id) {
    enrichIdeaFromUrl(data.id, url, boardCategories).catch((error) => {
      console.warn('[share-idea] background enrich failed', error);
    });
  }

  return { id: data?.id as string, existing: false };
}
