import { Session, User } from '@supabase/supabase-js';
import { router, useSegments } from 'expo-router';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile, Region } from '@/types';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

type RegisterInput = {
  email: string;
  password: string;
  username: string;
  region: Region;
  displayName?: string;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const segments = useSegments();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const user = session?.user ?? null;

  const refreshProfile = async () => {
    if (!session?.user) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) throw error;
    setProfile(data);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    refreshProfile().catch(() => setProfile(null));
  }, [session?.user?.id]);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inAuthCallback = segments[0] === 'auth';

    if (!session && !inAuthGroup && !inAuthCallback) {
      router.replace('/(auth)/login');
      return;
    }

    if (session && inAuthGroup) {
      router.replace('/(app)/feed');
    }
  }, [loading, session, segments]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user,
    profile,
    loading,
    refreshProfile,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    register: async ({ email, password, username, region, displayName }) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('未能建立帳戶，請稍後再試。');

      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        username: username.trim().toLowerCase(),
        display_name: displayName?.trim() || username.trim(),
        region,
        role: 'creator'
      });

      if (profileError) throw profileError;
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
  }), [loading, profile, session, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必須在 AuthProvider 之內使用。');
  return context;
}
