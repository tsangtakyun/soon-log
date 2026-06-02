module.exports = {
  expo: {
    name: 'EGG',
    slug: 'soon-log',
    scheme: 'soonlog',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    jsEngine: 'jsc',
    newArchEnabled: false,
    splash: {
      image: './assets/loading-background.png',
      resizeMode: 'cover',
      backgroundColor: '#F9E293'
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.theirstudio.sooncreatorlog',
      icon: './assets/icon.png',
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
      },
      infoPlist: {
        CFBundleDisplayName: 'EGG',
        LSApplicationQueriesSchemes: [
          'googlechrome',
          'comgooglemaps'
        ],
        NSLocationWhenInUseUsageDescription: 'SOON LOG 需要你的位置以顯示附近題材',
        NSLocationAlwaysUsageDescription: 'SOON LOG 需要你的位置以顯示附近題材',
        NSPhotoLibraryAddUsageDescription: 'SOON-LOG 需要儲存影片到相簿',
        NSPhotoLibraryUsageDescription: 'SOON-LOG 需要存取相簿'
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#F5F2ED'
      }
    },
    extra: {
      eas: {
        projectId: 'd84b00bf-0152-4bd5-b572-0ea1021ff58e'
      }
    },
    plugins: [
      'expo-router',
      [
        'expo-image-picker',
        {
          photosPermission: 'SOON-LOG 需要存取相簿'
        }
      ],
      [
        'expo-share-intent',
        {
          iosActivationRules: {
            NSExtensionActivationSupportsWebURLWithMaxCount: 1,
            NSExtensionActivationSupportsWebPageWithMaxCount: 1
          },
          iosShareExtensionBundleIdentifier: 'com.theirstudio.sooncreatorlog.share'
        }
      ],
      [
        'react-native-vision-camera',
        {
          cameraPermissionText: 'SOON-LOG 需要使用相機來拍攝製作影片',
          enableMicrophonePermission: true,
          microphonePermissionText: 'SOON-LOG 需要使用麥克風來錄製聲音'
        }
      ],
      'expo-video'
    ]
  }
};
