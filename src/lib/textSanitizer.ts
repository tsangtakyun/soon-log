export function stripCitationMarkup(value: string | null | undefined) {
  if (!value) return '';

  return value
    .replace(/<cite\b[^>]*>([\s\S]*?)<\/cite>/gi, '$1')
    .replace(/<\/?cite\b[^>]*>/gi, '')
    .replace(/\s+([，。！？、；：])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function cleanAiText(value: unknown) {
  return typeof value === 'string' ? stripCitationMarkup(value) : '';
}

export function isGenericSocialTitle(value: string | null | undefined) {
  const title = stripCitationMarkup(value).toLowerCase();
  if (!title) return true;

  const compact = title.replace(/\s+/g, ' ').trim();
  const platformOnly = [
    'instagram',
    'instagram reel',
    'ig reel',
    'tiktok',
    'threads',
    'facebook',
    'x',
    'youtube'
  ];

  if (platformOnly.includes(compact)) return true;
  if (/(log in|login|sign up|登入|註冊|登录|注册).*(instagram|tiktok|threads|facebook)/i.test(compact)) return true;
  if (/(instagram|tiktok|threads|facebook).*(log in|login|sign up|登入|註冊|登录|注册)/i.test(compact)) return true;
  if (/^(watch|view|see) .+ (on|in) (instagram|tiktok|threads|facebook)$/i.test(compact)) return true;

  return false;
}

function firstSentence(value: string) {
  return value
    .split(/[\n\r。！？!?]/)
    .map((item) => item.trim())
    .find(Boolean) ?? '';
}

export function deriveIdeaTitle(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const clean = stripCitationMarkup(value);
    if (!clean || isGenericSocialTitle(clean)) continue;

    const sentence = firstSentence(clean);
    if (sentence) {
      return sentence.length > 36 ? `${sentence.slice(0, 34)}...` : sentence;
    }
  }

  return '';
}
