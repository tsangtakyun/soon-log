import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { EggLoader } from '@/components/egg/EggLoader';

export function AppLoadingScreen() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <View style={styles.screen}><EggLoader size="large" label="正在準備你的創作者空間…" /></View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBF4EE'
  }
});
