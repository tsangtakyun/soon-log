import { Image, StyleProp, Text, TextStyle, View } from 'react-native';

export type Platform = 'instagram' | 'youtube' | 'tiktok' | 'xiaohongshu' | 'threads';

const PLATFORM_CONFIG = {
  instagram: {
    label: 'Instagram',
    color: '#E1306C',
    logo: require('../../assets/icons/instagram.png'),
  },
  youtube: {
    label: 'YouTube',
    color: '#FF0000',
    logo: require('../../assets/icons/youtube.png'),
  },
  tiktok: {
    label: 'TikTok',
    color: '#000000',
    logo: require('../../assets/icons/tiktok.png'),
  },
  xiaohongshu: {
    label: '小紅書',
    color: '#FF2442',
    logo: null,
  },
  threads: {
    label: 'Threads',
    color: '#000000',
    logo: require('../../assets/icons/threads.png'),
  },
} as const;

type Props = {
  platform: Platform;
  size?: number;
  showLabel?: boolean;
  labelStyle?: StyleProp<TextStyle>;
};

export function PlatformLogo({ platform, size = 24, showLabel = false, labelStyle }: Props) {
  const config = PLATFORM_CONFIG[platform];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {config.logo ? (
        <Image
          source={config.logo}
          style={{ width: size, height: size, borderRadius: size * 0.2 }}
          resizeMode="contain"
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            backgroundColor: config.color,
            borderRadius: size * 0.2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: 'white', fontSize: size * 0.5, fontWeight: '700' }}>書</Text>
        </View>
      )}

      {showLabel ? (
        <Text
          style={[
            {
              color: config.color,
              fontWeight: '600',
              fontSize: 14,
            },
            labelStyle,
          ]}
        >
          {config.label}
        </Text>
      ) : null}
    </View>
  );
}
