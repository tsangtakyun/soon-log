const SOON_CORE_AI_ENDPOINT = 'https://soon-core.vercel.app/api/ai/generate';

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

export async function generateAiText(options: AiGenerateOptions) {
  const response = await fetch(SOON_CORE_AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'AI 生成失敗');

  const text = (data?.content as AiTextBlock[] | undefined)
    ?.map((block) => block.text)
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (!text) throw new Error('AI 沒有返回內容');
  return text;
}
