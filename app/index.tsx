import { Redirect } from 'expo-router';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { useAuth } from '@/hooks/useAuth';
import { isEggCreatorBuild } from '@/lib/appMode';

export default function IndexRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return <AppLoadingScreen />;
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  if (isEggCreatorBuild) return <Redirect href={'/creator/home' as never} />;
  return <Redirect href="/home" />;
}
