module.exports = {
  expo: {
    name: 'SOON LOG',
    slug: 'soon-log',
    scheme: 'soonlog',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    jsEngine: 'jsc',
    newArchEnabled: false,
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#F5F2ED'
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'network.sooncreator.log',
      icon: './assets/icon.png',
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
      },
      infoPlist: {
        LSApplicationQueriesSchemes: [
          'googlechrome',
          'comgooglemaps'
        ],
        NSLocationWhenInUseUsageDescription: 'SOON LOG 需要你的位置以顯示附近題材',
        NSLocationAlwaysUsageDescription: 'SOON LOG 需要你的位置以顯示附近題材'
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#F5F2ED'
      }
    },
    plugins: [
      'expo-router',
      [
        'expo-image-picker',
        {
          photosPermission: 'SOON-LOG 需要存取相片，用作上載創作紀錄圖片。'
        }
      ],
      [
        'expo-share-intent',
        {
          iosActivationRules: {
            NSExtensionActivationSupportsWebURLWithMaxCount: 1,
            NSExtensionActivationSupportsWebPageWithMaxCount: 1
          },
          iosShareExtensionBundleIdentifier: 'network.sooncreator.log.ShareExtension'
        }
      ]
    ]
  }
};
