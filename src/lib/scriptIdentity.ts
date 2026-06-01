import { supabase } from './supabase';

type UserCreditIdentity = {
  user_id?: string | null;
  egg_user_id?: string | null;
};

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

async function fetchCreditIdentity(email?: string | null): Promise<UserCreditIdentity | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const { data } = await supabase
    .from('user_credits')
    .select('user_id, egg_user_id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  return (data as UserCreditIdentity | null) ?? null;
}

export async function resolveScriptOwnerId(userId: string, email?: string | null) {
  const identity = await fetchCreditIdentity(email);
  return identity?.user_id || identity?.egg_user_id || userId;
}

export async function resolveLinkedScriptOwnerIds(userId: string, email?: string | null) {
  const ids = new Set<string>([userId]);
  const identity = await fetchCreditIdentity(email);

  if (identity?.user_id) ids.add(identity.user_id);
  if (identity?.egg_user_id) ids.add(identity.egg_user_id);

  return Array.from(ids);
}
