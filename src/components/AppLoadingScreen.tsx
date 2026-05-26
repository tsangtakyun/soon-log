import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ImageBackground, StyleSheet } from 'react-native';

export function AppLoadingScreen() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <ImageBackground
      source={require('../../assets/loading-background.png')}
      style={styles.screen}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F9E293'
  }
});
