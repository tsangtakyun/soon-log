const SOON_CORE_AI_ENDPOINT = 'https://soon-core.vercel.app/api/ai/generate';
const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;

type AiMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type AiGenerateOptions = {
  prompt?: string;
  model?: string;
  maxTokens?: number;
  system?: string;
  messages?: AiMessage[];
};

type AiTextBlock = {
  type?: string;
  text?: string;
};

function extractText(data: { content?: AiTextBlock[] }) {
  return data.content
    ?.map((block) => block.text)
    .filter(Boolean)
    .join('\n\n')
    .trim() ?? '';
}

function responseError(data: Record<string, unknown>, status: number) {
  const error = data.error;
  const message =
    (typeof error === 'object' && error && 'message' in error ? String((error as { message?: unknown }).message ?? '') : '') ||
    (typeof error === 'string' ? error : '') ||
    (typeof data.message === 'string' ? data.message : '') ||
    `AI 生成失敗 (${status})`;

  return new Error(message);
}

async function generateWithAnthropic(options: AiGenerateOptions) {
  if (!ANTHROPIC_KEY) throw new Error('AI server 失敗，而且未設定 EXPO_PUBLIC_ANTHROPIC_KEY fallback。');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: options.model ?? 'claude-sonnet-4-6',
      max_tokens: options.maxTokens ?? 2048,
      system: options.system,
      messages: options.messages ?? (options.prompt ? [{ role: 'user', content: options.prompt }] : [])
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw responseError(data, response.status);

  const text = extractText(data);
  if (!text) throw new Error('AI 沒有返回內容');
  return text;
}

export async function generateAiText(options: AiGenerateOptions) {
  const response = await fetch(SOON_CORE_AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const primaryError = responseError(data, response.status);
    if (response.status >= 500) {
      try {
        return await generateWithAnthropic(options);
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`${primaryError.message}；fallback 亦失敗：${fallbackMessage}`);
      }
    }
    throw primaryError;
  }

  const text = extractText(data);
  if (!text) throw new Error('AI 沒有返回內容');
  return text;
}
