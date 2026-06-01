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
