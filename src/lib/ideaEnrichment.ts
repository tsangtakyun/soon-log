import { supabase } from '@/lib/supabase';
import type { ViralPotential } from '@/types';

const AUTOFILL_API = 'https://idea-brainstorm.vercel.app/api/autofill-link';
const VIDEO_RESOLVE_API = 'https://idea-brainstorm.vercel.app/api/resolve-video';

type AnalysisResult = {
  title: string;
  topic?: string;
  description?: string;
  desc?: string;
  hook?: string;
  script_hook?: string;
  region?: string;
  country?: string;
  viral_potential: ViralPotential;
  tags: string[];
  platform: string;
  image?: string;
  videoUrl?: string;
  video_url?: string;
  placeName?: string;
  placeAddress?: string;
  categories?: string[];
};

type IdeaUpdate = Record<string, unknown>;

type VideoResolveResult = {
  title?: string;
  description?: string;
  image?: string;
  videoUrl?: string;
};

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

async function analyzeUrl(targetUrl: string): Promise<AnalysisResult> {
  const response = await fetch(AUTOFILL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: targetUrl })
  });

  if (!response.ok) throw new Error(`API error ${response.status}`);

  const data = await response.json();
  return {
    title: data.title || 'IG Reel 靈感',
    topic: data.title || '',
    description: data.desc || data.metadataDescription || '',
    desc: data.desc || '',
    hook: data.hook || '',
    script_hook: data.script_hook || '',
    country: data.country || 'HK',
    region: data.country || 'HK',
    viral_potential: data.viral_potential || 'medium',
    tags: asStringArray(data.tags),
    platform: data.platform || 'instagram',
    image: data.image || data.image_url || data.thumbnail || data.thumbnail_url || data.ogImage || data.og_image || data.media?.thumbnail_url || '',
    videoUrl: data.videoUrl || data.video_url || data.video || data.media_url || data.playback_url || data.hls_url || data.media?.video_url || data.media?.playback_url || '',
    video_url: data.video_url || data.videoUrl || data.video || data.media_url || data.playback_url || data.hls_url || data.media?.video_url || data.media?.playback_url || '',
    placeName: data.placeName || data.place_name || '',
    placeAddress: data.placeAddress || data.place_address || '',
    categories: asStringArray(data.categories)
  };
}

async function resolveVideoFromUrl(targetUrl: string): Promise<VideoResolveResult | null> {
  try {
    const response = await fetch(VIDEO_RESOLVE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl })
    });

    if (!response.ok) return null;

    const data = await response.json();
    return {
      title: firstString(data.title),
      description: firstString(data.description, data.desc, data.metadataDescription),
      image: firstString(data.image, data.image_url, data.thumbnail, data.thumbnail_url, data.ogImage, data.og_image, data.media?.thumbnail_url),
      videoUrl: firstString(data.video_url, data.videoUrl, data.video, data.media_url, data.playback_url, data.hls_url, data.media?.video_url, data.media?.playback_url)
    };
  } catch (error) {
    console.log('[idea-enrich] video resolver skipped', error);
    return null;
  }
}

async function geocodePlace(placeName: string, country: string) {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key || !placeName.trim()) return null;

  const query = encodeURIComponent(`${placeName}, ${country}`);
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${key}`);
  const data = await response.json();
  const location = data.results?.[0]?.geometry?.location;

  if (typeof location?.lat === 'number' && typeof location?.lng === 'number') {
    return {
      lat: location.lat,
      lng: location.lng
    };
  }

  return null;
}

function missingColumnName(error: unknown) {
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : String(error ?? '');

  if (!message.includes('schema cache') && !message.includes('Could not find')) return '';
  return message.match(/'([^']+)' column/)?.[1] ?? '';
}

async function updateIdeaWithFallback(ideaId: string, update: IdeaUpdate) {
  let payload = { ...update };
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase.from('ideas').update(payload).eq('id', ideaId);
    if (!error) return;

    lastError = error;
    const column = missingColumnName(error);
    if (!column) break;

    const beforeKeys = Object.keys(payload).length;
    delete payload[column];
    delete payload[`${column}s`];
    if (column.endsWith('s')) {
      delete payload[column.slice(0, -1)];
    }

    if (Object.keys(payload).length === beforeKeys || Object.keys(payload).length === 0) break;
  }

  const safePayload: IdeaUpdate = {};
  [
    'title',
    'description',
    'hook',
    'region',
    'viral_potential',
    'source_url',
    'platform',
    'tags'
  ].forEach((key) => {
    if (key in update) safePayload[key] = update[key];
  });

  if (Object.keys(safePayload).length > 0) {
    const { error } = await supabase.from('ideas').update(safePayload).eq('id', ideaId);
    if (!error) return;
    lastError = error;
  }

  throw lastError;
}

export async function enrichIdeaFromUrl(ideaId: string, targetUrl: string, boardCategories: string[] = []) {
  const result = await analyzeUrl(targetUrl);
  const resolved = result.video_url || result.videoUrl ? null : await resolveVideoFromUrl(targetUrl);
  const resolvedVideoUrl = result.video_url || result.videoUrl || resolved?.videoUrl || null;
  const resolvedImage = result.image || resolved?.image || '';
  const resolvedDescription = firstString(result.description, result.desc, resolved?.description);
  const blockedTitle = result.title === 'Instagram' || result.title === 'TikTok' || !result.title;
  const title = blockedTitle ? (resolved?.title || 'Instagram Reel 靈感') : result.title;
  const placeQuery = result.placeName || result.placeAddress || '';
  const coords = placeQuery ? await geocodePlace(placeQuery, result.country || 'HK') : null;
  const mergedCategories = Array.from(new Set([...(result.categories ?? []), ...boardCategories].filter(Boolean)));
  const description = resolvedDescription;
  const update: IdeaUpdate = {
    title,
    topic: result.topic || title,
    summary: description,
    script_hook: result.script_hook ?? result.hook ?? '',
    country: result.country ?? 'HK',
    platform: result.platform ?? 'instagram',
    tags: result.tags?.length ? result.tags : ['instagram'],
    categories: mergedCategories,
    place_name: result.placeName ?? '',
    place_address: result.placeAddress ?? '',
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    description: result.desc ?? result.description ?? '',
    hook: result.hook ?? '',
    region: result.country ?? 'HK',
    viral_potential: result.viral_potential ?? 'medium',
    source_url: targetUrl
  };

  if (resolvedImage) {
    update.thumb = resolvedImage;
  }
  if (resolvedVideoUrl) {
    update.video_url = resolvedVideoUrl;
  }

  await updateIdeaWithFallback(ideaId, update);
}
