import { Redirect } from 'expo-router';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { useAuth } from '@/hooks/useAuth';

export default function IndexRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return <AppLoadingScreen />;
  }

  return <Redirect href={session ? '/home' : '/login'} />;
}
