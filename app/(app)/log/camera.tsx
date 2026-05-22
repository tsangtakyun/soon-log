import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  VideoFile
} from 'react-native-vision-camera';
import { colors } from '@/theme/colors';

type DurationOption = '2' | '5';
type CameraFacing = 'front' | 'back';

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date: Date) {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function TopicClipCameraScreen() {
  const { room_id } = useLocalSearchParams<{ room_id: string }>();
  const roomId = Array.isArray(room_id) ? room_id[0] : room_id;
  const { hasPermission, requestPermission } = useCameraPermission();
  const {
    hasPermission: hasMicrophonePermission,
    requestPermission: requestMicrophonePermission
  } = useMicrophonePermission();
  const [duration, setDuration] = useState<DurationOption>('5');
  const [zoom, setZoom] = useState(1);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [audio, setAudio] = useState(true);
  const [facing, setFacing] = useState<CameraFacing>('back');
  const [timer, setTimer] = useState<0 | 3 | 10>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(formatTime(new Date()));
  const [currentDate, setCurrentDate] = useState(formatDate(new Date()));
  const cameraRef = useRef<Camera>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const backDevice = useCameraDevice('back', { physicalDevices: ['wide-angle-camera'] });
  const ultraWideDevice = useCameraDevice('back', { physicalDevices: ['ultra-wide-angle-camera'] });
  const frontDevice = useCameraDevice('front');
  const device = facing === 'front'
    ? frontDevice
    : zoom === 0.5 && ultraWideDevice
      ? ultraWideDevice
      : backDevice;
  const cameraZoom = zoom === 0.5 ? 1 : zoom;

  const clearRecordingTimers = useCallback(() => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    progressIntervalRef.current = null;
    stopTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    if (!roomId) {
      Alert.alert('找不到 Topic Room', '請由 Topic Room 重新開始拍攝。');
      router.back();
    }
  }, [roomId]);

  useEffect(() => {
    const requestPermissions = async () => {
      const cameraGranted = hasPermission || await requestPermission();
      const microphoneGranted = !audio || hasMicrophonePermission || await requestMicrophonePermission();

      if (!cameraGranted || !microphoneGranted) {
        Alert.alert('需要權限', '請允許 SOON-LOG 使用相機同麥克風。', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      }
    };

    requestPermissions();
  }, [audio, hasMicrophonePermission, hasPermission, requestMicrophonePermission, requestPermission]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(formatTime(now));
      setCurrentDate(formatDate(now));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearRecordingTimers();
    };
  }, [clearRecordingTimers]);

  const stopRecording = useCallback(() => {
    cameraRef.current?.stopRecording();
  }, []);

  const startRecordingNow = useCallback(async () => {
    if (!cameraRef.current || isRecording || !roomId) return;
    const maxDuration = Number(duration);
    setIsRecording(true);
    setRecordingProgress(0);

    const startTime = Date.now();
    progressIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setRecordingProgress(Math.min(elapsed / maxDuration, 1));
    }, 100);
    stopTimeoutRef.current = setTimeout(stopRecording, maxDuration * 1000);

    try {
      cameraRef.current.startRecording({
        flash,
        fileType: 'mp4',
        onRecordingFinished: (video: VideoFile) => {
        clearRecordingTimers();
        setIsRecording(false);
        setRecordingProgress(0);
        const now = new Date();

        router.push({
          pathname: '/(app)/log/preview',
          params: {
            uri: video.path,
            timeStr: formatTime(now),
            dateStr: formatDate(now),
            room_id: roomId
          }
        });
        },
        onRecordingError: (error) => {
        clearRecordingTimers();
        setIsRecording(false);
        setRecordingProgress(0);
        Alert.alert('錄影失敗', error.message);
        }
      });
    } catch (err: unknown) {
      clearRecordingTimers();
      setIsRecording(false);
      setRecordingProgress(0);
      const message = err instanceof Error ? err.message : '錄影失敗';
      Alert.alert('錄影失敗', message);
    }
  }, [clearRecordingTimers, duration, flash, isRecording, roomId, stopRecording]);

  const startRecording = useCallback(async () => {
    if (isRecording || countdown !== null) return;

    if (timer > 0) {
      for (let value = timer; value > 0; value -= 1) {
        setCountdown(value);
        await wait(1000);
      }
      setCountdown(null);
    }

    await startRecordingNow();
  }, [countdown, isRecording, startRecordingNow, timer]);

  const cycleTimer = () => {
    setTimer((value) => value === 0 ? 3 : value === 3 ? 10 : 0);
  };

  if (!device) {
    return (
      <View style={styles.permissionScreen}>
        <Text style={styles.permissionText}>找不到相機</Text>
      </View>
    );
  }

  if (!hasPermission || (audio && !hasMicrophonePermission)) {
    return (
      <View style={styles.permissionScreen}>
        <Text style={styles.permissionText}>準備相機權限...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        device={device}
        isActive
        video
        audio={audio}
        outputOrientation="device"
        enableZoomGesture
        zoom={cameraZoom * (device.minZoom ?? 1)}
      />

      <View pointerEvents="none" style={styles.timeOverlay}>
        <Text style={styles.timeText}>{currentTime}</Text>
        <Text style={styles.dateText}>{currentDate}</Text>
      </View>

      {isRecording ? (
        <View pointerEvents="none" style={styles.progressTrack}>
          <View style={[styles.progressFill, { height: `${recordingProgress * 100}%` }]} />
        </View>
      ) : null}

      {countdown ? (
        <View pointerEvents="none" style={styles.countdownOverlay}>
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      ) : null}

      <View style={styles.topControls}>
        <TouchableOpacity style={styles.topButton} onPress={() => router.back()}>
          <Text style={styles.topButtonText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topButton} onPress={() => setFacing((value) => value === 'front' ? 'back' : 'front')}>
          <Text style={styles.topButtonText}>🔄</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topButton} onPress={() => setAudio((value) => !value)}>
          <Text style={styles.topButtonText}>{audio ? '🔊' : '🔇'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.durationPill} onPress={() => setDuration((value) => value === '5' ? '2' : '5')}>
          <Text style={styles.durationText}>{duration}s</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.controls}>
        <View style={styles.zoomRow}>
          {[0.5, 1, 2, 4].map((value) => {
            const active = zoom === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.zoomButton, active && styles.zoomButtonActive]}
                onPress={() => setZoom(value)}
              >
                <Text style={[styles.zoomText, active && styles.zoomTextActive]}>{value === 0.5 ? '.5x' : `${value}x`}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.bottomControls}>
          <TouchableOpacity style={styles.sideButton} onPress={() => setFlash((value) => value === 'off' ? 'on' : 'off')}>
            <Text style={styles.sideButtonText}>{flash === 'off' ? '⚡' : '🔦'}</Text>
          </TouchableOpacity>

          <TouchableOpacity disabled={isRecording} style={styles.recordButton} onPress={startRecording}>
            <View style={[styles.recordInner, isRecording && styles.recordInnerRecording]} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.sideButton} onPress={cycleTimer}>
            <Text style={styles.timerText}>{timer === 0 ? '⏱' : `${timer}s`}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000'
  },
  camera: {
    flex: 1
  },
  permissionScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: 24
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center'
  },
  timeOverlay: {
    position: 'absolute',
    top: 155,
    left: -36,
    transform: [{ rotate: '-90deg' }]
  },
  timeText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5
  },
  dateText: {
    marginTop: 4,
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4
  },
  topControls: {
    position: 'absolute',
    top: 58,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)'
  },
  topButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800'
  },
  durationPill: {
    minWidth: 56,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    paddingHorizontal: 14
  },
  durationText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900'
  },
  progressTrack: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 6,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  progressFill: {
    width: '100%',
    backgroundColor: colors.primary
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)'
  },
  countdownText: {
    color: '#fff',
    fontSize: 120,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 48,
    alignItems: 'center'
  },
  zoomRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)'
  },
  zoomButton: {
    minWidth: 52,
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  zoomButtonActive: {
    backgroundColor: '#fff'
  },
  zoomText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800'
  },
  zoomTextActive: {
    color: '#000'
  },
  bottomControls: {
    width: '82%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sideButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)'
  },
  sideButtonText: {
    color: '#fff',
    fontSize: 22
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  recordInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff'
  },
  recordInnerRecording: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ef4444'
  },
  timerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900'
  }
});
