import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

type ClipPlayerProps = {
  clip: {
    id: string;
    video_url?: string | null;
    media_urls?: string[];
    caption?: string | null;
    time_str?: string | null;
    date_str?: string | null;
    caption_align?: 'left' | 'center' | 'right' | null;
    text_size?: 'small' | 'medium' | 'large' | null;
    background_color?: 'cream' | 'black' | null;
  };
  width: number;
  height: number;
  onDoubleTap?: () => void;
};

const captionSizeMap = {
  small: 14,
  medium: 18,
  large: 24
};

const timeSizeMap = {
  small: { time: 28, date: 13 },
  medium: { time: 34, date: 15 },
  large: { time: 42, date: 18 }
};

const alignMap = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end'
} as const;

export default function ClipPlayer({ clip, width, height, onDoubleTap }: ClipPlayerProps) {
  const lastTapRef = useRef(0);
  const player = useVideoPlayer(clip.video_url || null, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });
  const align = clip.caption_align || 'center';
  const size = clip.text_size || 'medium';
  const captionFontSize = captionSizeMap[size];
  const overlayFontSize = timeSizeMap[size];

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') {
      player.play();
    }
  });

  useEventListener(player, 'playToEnd', () => {
    player.replay();
  });

  if (clip.video_url) {
    return (
      <View style={[styles.frame, { width, height }]}>
        <VideoView
          player={player}
          style={{ width, height }}
          nativeControls={false}
          contentFit="cover"
          allowsVideoFrameAnalysis={false}
          onFirstFrameRender={() => player.play()}
        />

        <View pointerEvents="none" style={[styles.overlay, { width, height }]}>
          {(clip.time_str || clip.date_str) ? (
            <View style={styles.timestamp}>
              {clip.time_str ? (
                <Text
                  style={[
                    styles.timeText,
                    { fontSize: overlayFontSize.time, lineHeight: Math.round(overlayFontSize.time * 1.08) }
                  ]}
                >
                  {clip.time_str}
                </Text>
              ) : null}
              {clip.date_str ? (
                <Text
                  style={[
                    styles.dateText,
                    { fontSize: overlayFontSize.date, lineHeight: Math.round(overlayFontSize.date * 1.2) }
                  ]}
                >
                  {clip.date_str}
                </Text>
              ) : null}
            </View>
          ) : null}

          {clip.caption ? (
            <View style={[styles.captionWrap, { alignItems: alignMap[align] }]}>
              <Text
                style={[
                  styles.captionText,
                  {
                    fontSize: captionFontSize,
                    lineHeight: Math.round(captionFontSize * 1.3),
                    textAlign: align
                  }
                ]}
              >
                {clip.caption}
              </Text>
            </View>
          ) : null}
        </View>

        <Pressable
          style={[styles.tapLayer, { width, height }]}
          onPress={() => {
            const now = Date.now();
            if (onDoubleTap && now - lastTapRef.current < 320) {
              lastTapRef.current = 0;
              onDoubleTap();
              return;
            }

            lastTapRef.current = now;
            if (player.playing) {
              player.pause();
            } else {
              player.play();
            }
          }}
        />
      </View>
    );
  }

  if (clip.media_urls?.[0]) {
    return (
      <Image
        source={{ uri: clip.media_urls[0] }}
        style={[styles.frame, { width, height }]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={[styles.emptyFrame, { width, height }]}>
      <Text style={styles.emptyIcon}>🎬</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: '#000'
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0
  },
  timestamp: {
    position: 'absolute',
    top: 16,
    left: 16
  },
  timeText: {
    color: '#fff',
    fontWeight: '900',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5
  },
  dateText: {
    marginTop: 2,
    color: '#fff',
    fontWeight: '800',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4
  },
  captionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    paddingHorizontal: 16
  },
  captionText: {
    maxWidth: '100%',
    color: '#fff',
    fontWeight: '800',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5
  },
  tapLayer: {
    position: 'absolute',
    top: 0,
    left: 0
  },
  emptyFrame: {
    overflow: 'hidden',
    backgroundColor: '#141414',
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyIcon: {
    color: '#555',
    fontSize: 32
  }
});
