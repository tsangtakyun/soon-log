import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const envSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const envSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if ((envSupabaseUrl && !envSupabaseAnonKey) || (!envSupabaseUrl && envSupabaseAnonKey)) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set together.');
}

const supabaseUrl = envSupabaseUrl || 'https://fqnnjwxxwxggreoognkv.supabase.co';
const supabaseAnonKey = envSupabaseAnonKey || 'sb_publishable_aazwFK_lVCjyxSWeG0uJ3A_Z3uCJod1';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  },
  realtime: {
    params: {
      eventsPerSecond: 8
    }
  }
});
