import { supabase } from './supabase';

const COSTS = {
  tool_enter: 10,
  ai_generate: 3
} as const;

type CreditAction = keyof typeof COSTS;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getCredits(email: string): Promise<number> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return 0;

  const { data } = await supabase
    .from('user_credits')
    .select('balance')
    .eq('email', normalizedEmail)
    .maybeSingle();

  return data?.balance ?? 0;
}

export async function deductCredits(
  email: string,
  action: CreditAction
): Promise<{ success: boolean; balance: number; error?: string }> {
  const normalizedEmail = normalizeEmail(email);
  const cost = COSTS[action];

  if (!normalizedEmail) return { success: false, balance: 0, error: 'missing_email' };

  const { data: row } = await supabase
    .from('user_credits')
    .select('balance, total_used')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (!row) return { success: false, balance: 0, error: 'no_credits_record' };
  if (row.balance < cost) return { success: false, balance: row.balance, error: 'insufficient_credits' };

  const nextBalance = row.balance - cost;
  const { error } = await supabase
    .from('user_credits')
    .update({
      balance: nextBalance,
      total_used: (row.total_used ?? 0) + cost,
      updated_at: new Date().toISOString()
    })
    .eq('email', normalizedEmail);

  if (error) return { success: false, balance: row.balance, error: 'update_failed' };
  return { success: true, balance: nextBalance };
}
