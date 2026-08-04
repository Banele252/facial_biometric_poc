// src/features/screens/LivenessDetectionScreen.tsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  ActivityIndicator,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Container, Button } from '@/components/ui';
import { API_BASE_URL } from '@/config/apiBase';

const { width, height } = Dimensions.get('window');
const GOLD = '#D4AF37';

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: any) => void;
  routeParams?: Record<string, unknown>;
}

export default function LivenessDetectionScreen({
  navigate,
  goBack,
  dispatch,
  routeParams,
}: Props) {
  const [phase, setPhase] = useState<'ready' | 'checking' | 'done' | 'error'>('ready');
  const [banner, setBanner] = useState('');
  const [result, setResult] = useState<any>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const circleRef = useRef<any>(null);
  const cameraRef = useRef<CameraView | null>(null);

  const breatheScale = useMemo(() => new Animated.Value(1), []);
  const sweepTranslateY = useMemo(() => new Animated.Value(-118), []);

  const baseUrl = API_BASE_URL;

  const idNumber = routeParams?.id_number as string;
  const selfieId = routeParams?.selfie_id as string;

  /* Web camera preview */
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let stream: MediaStream | null = null;
    const startPreview = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        const container = circleRef.current;
        if (!container) return;
        const old = container.querySelector('video');
        if (old) old.remove();
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.transform = 'scaleX(-1)';
        video.style.position = 'absolute';
        video.style.top = '0';
        video.style.left = '0';
        video.style.borderRadius = '125px';
        container.insertBefore(video, container.firstChild);
        await video.play();
        videoRef.current = video;
      } catch (err) {
        console.error('[Liveness] Preview failed:', err);
      }
    };
    startPreview();
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /* Mobile camera permission */
  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  /* Animations */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase === 'checking') {
      const breathe = Animated.loop(
        Animated.sequence([
          Animated.timing(breatheScale, {
            toValue: 1.035,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(breatheScale, {
            toValue: 1,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      const sweep = Animated.loop(
        Animated.sequence([
          Animated.timing(sweepTranslateY, {
            toValue: 118,
            duration: 1900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(sweepTranslateY, {
            toValue: -118,
            duration: 1900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      breathe.start();
      sweep.start();
      return () => {
        breathe.stop();
        sweep.stop();
      };
    } else {
      breatheScale.stopAnimation();
      breatheScale.setValue(1);
      sweepTranslateY.stopAnimation();
      sweepTranslateY.setValue(-118);
    }
    return undefined;
  }, [phase, breatheScale, sweepTranslateY]);

  /* Navigation */
  const handleBack = () => {
    if (goBack) goBack();
    else if (dispatch) dispatch({ type: 'GO_BACK' });
  };

  const handleNavigate = (screen: string, params?: any) => {
    if (navigate) navigate(screen, params);
    else if (dispatch)
      dispatch({ type: 'NAVIGATE', payload: { screen, params } });
  };

  /* Helpers */
  const captureWebFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const uploadSelfie = async (imageData: string): Promise<string | null> => {
    const response = await fetch(`${baseUrl}/api/v1/selfies`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id_number: idNumber || '8107255492089',
        image: imageData,
      }),
    });
    if (!response.ok) throw new Error(`Selfie upload failed (${response.status})`);
    const data = await response.json();
    return data.selfie_id;
  };

  const runLiveness = async (sid: string) => {
    const response = await fetch(`${baseUrl}/api/v1/selfies/${sid}/liveness`, {
      method: 'POST',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Liveness check failed (${response.status})`);
    return response.json();
  };

  /**
   * Grab a frame from the live preview above.
   *
   * This previously called ImagePicker.launchCameraAsync, which handed control
   * to the system camera app — complete with a crop step — so the customer
   * composed and approved a still image before it was checked. A liveness test
   * on a picture the subject chose is not a liveness test.
   *
   * quality is 0.5 rather than 0.8: the frame is only ever compared against a
   * face, and a full-resolution capture base64-encodes to several megabytes,
   * which is a lot of string to hold on a mid-range handset.
   */
  const captureFromPreview = async (): Promise<string | null> => {
    if (!hasPermission) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status !== 'granted') {
        Alert.alert('Camera Permission', 'Camera access is needed for liveness.');
        return null;
      }
    }

    const cam = cameraRef.current;
    if (!cam) {
      throw new Error('Camera is not ready yet. Give it a moment and try again.');
    }

    const photo = await cam.takePictureAsync({ base64: true, quality: 0.5, skipProcessing: true });
    if (!photo?.base64) return null;
    return `data:image/jpeg;base64,${photo.base64}`;
  };

  /* Start liveness */
  const start = useCallback(async () => {
    if (phase === 'checking') return;
    setPhase('checking');
    setBanner('');

    try {
      let sid = selfieId;

      /* Capture fresh face if on web or no selfie_id yet */
      if (Platform.OS === 'web' || !sid) {
        let imageData: string | null = null;

        if (Platform.OS === 'web') {
          imageData = captureWebFrame();
          if (!imageData) throw new Error('Camera not ready. Please allow camera access.');
        } else {
          imageData = await captureFromPreview();
          if (!imageData) {
            setPhase('ready');
            return;
          }
        }

        const uploadedId = await uploadSelfie(imageData);
        if (!uploadedId) throw new Error('Failed to upload selfie.');
        sid = uploadedId;
      }

      const data = await runLiveness(sid);
      setResult(data);

      if (data.is_live) {
        setPhase('done');
        timerRef.current = setTimeout(() => {
          // CRITICAL: pass both id_number AND selfie_id forward
          handleNavigate('FraudIntelligenceChecks', {
            id_number: idNumber,
            selfie_id: sid,
          });
        }, 800);
      } else {
        setPhase('error');
        setBanner(data.detail || 'Liveness check failed. Please try again.');
      }
    } catch (err: any) {
      console.error('[LivenessDetection] error:', err);
      setPhase('error');
      setBanner(err.message || 'Network error. Please try again.');
    }
  }, [phase, idNumber, selfieId, hasPermission]);

  const dismissBanner = () => {
    setBanner('');
    setPhase('ready');
  };

  const isChecking = phase === 'checking';
  const isDone = phase === 'done';
  const isError = phase === 'error';
  const accent = isError ? '#E0574A' : isDone ? '#2FA96B' : isChecking ? '#2FA96B' : GOLD;

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />

      <View style={styles.dotsPattern}>
        {[...Array(5)].map((_, row) => (
          <View key={row} style={styles.dotRow}>
            {[...Array(5)].map((_, col) => (
              <View key={col} style={styles.dot} />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.topBar}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#14110C" />
        </Pressable>
        <Typography variant="body" style={styles.topBarTitle}>
            Liveness Detection
        </Typography>
        <View style={styles.placeholder} />
      </View>

      <Container style={styles.container}>
        <View style={styles.titleContainer}>
          <View style={styles.accentLine} />
          <Typography variant="h1" style={styles.headline}>
              Follow the on-screen{'\n'}instructions
          </Typography>
        </View>

        {/* Scanner */}
        <View style={styles.scannerWrap}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />

          <Animated.View
            style={[styles.circleInner, { transform: [{ scale: breatheScale }] }]}
          >
            <View ref={circleRef} style={styles.circleBackground}>
              {/* A live preview, not a snapshot. The system camera app used to
                  be launched here, which meant the customer took a photo and
                  handed it over — the opposite of what a liveness check is for.
                  The frame is grabbed off this preview instead, so the person
                  stays in front of the lens while the prompts run. */}
              {Platform.OS !== 'web' && hasPermission && (
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing="front"
                  mode="picture"
                />
              )}
              {!isChecking && !isDone && !isError && (
                <View style={styles.faceOverlay}>
                  <View style={styles.headOutline} />
                  <View style={styles.shoulderOutline} />
                </View>
              )}
              {isChecking && (
                <Animated.View
                  style={[
                    styles.sweepLine,
                    { transform: [{ translateY: sweepTranslateY }] },
                  ]}
                />
              )}
            </View>
          </Animated.View>

          <View style={styles.liveBadge}>
            <View
              style={[
                styles.liveDot,
                isError ? styles.liveDotError : isDone ? styles.liveDotDone : styles.liveDotRunning,
              ]}
            />
            <Typography variant="caption" style={styles.liveLabel}>
              {isDone ? 'Verified' : isError ? 'Paused' : isChecking ? 'Analyzing…' : 'Camera ready'}
            </Typography>
          </View>

          <View style={styles.ringWrapper}>
            <View style={styles.ringTrack} />
            <View
              style={[
                styles.ringProgress,
                { borderTopColor: accent, borderRightColor: accent },
              ]}
            />
          </View>

          <View
            style={[
              styles.halo,
              { shadowColor: accent, opacity: isChecking || isDone || isError ? 1 : 0 },
            ]}
          />
        </View>

        {/* Prompt */}
        <View style={styles.promptContainer}>
          <Typography variant="h2" style={styles.promptLabel}>
            {isDone
              ? 'All done'
              : isError
                ? 'Try again'
                : isChecking
                  ? 'Checking liveness…'
                  : 'Prove it is a live person'}
          </Typography>
          <View style={styles.feedbackRow}>
            <View
              style={[
                styles.feedbackDot,
                (isChecking || isDone) && styles.feedbackDotActive,
              ]}
            >
              {(isChecking || isDone) && <Ionicons name="checkmark" size={10} color="#FFF" />}
            </View>
            <Typography
              variant="body"
              style={[
                styles.feedbackText,
                isError && styles.feedbackTextError,
                (isChecking || isDone) && styles.feedbackTextSuccess,
              ]}
            >
              {isDone
                ? 'Liveness confirmed'
                : isError
                  ? result?.detail || 'No movement detected'
                  : isChecking
                    ? 'Analyzing your selfie…'
                    : 'One quick check, about two seconds'}
            </Typography>
          </View>
        </View>

        {/* Error Banner */}
        {banner && (
          <View style={styles.banner}>
            <View style={styles.bannerIcon}>
              <Ionicons name="alert-circle" size={16} color="#C0362C" />
            </View>
            <Typography variant="body" style={styles.bannerText}>
              {banner}
            </Typography>
            <Pressable onPress={dismissBanner} style={styles.bannerClose}>
              <Ionicons name="close" size={16} color="#7A2820" />
            </Pressable>
          </View>
        )}
      </Container>

      <View style={styles.bottomActions}>
        <Container style={styles.bottomContainer}>
          <View style={styles.buttonGroup}>
            <Button
              variant="primary"
              size="lg"
              onPress={start}
              disabled={isChecking}
              style={
                isChecking
                  ? [styles.primaryBtn, styles.primaryBtnDisabled]
                  : [styles.primaryBtn, styles.primaryBtnActive]
              }
            >
              {isChecking ? (
                <ActivityIndicator color="#14110C" />
              ) : isDone ? (
                'Continue'
              ) : isError ? (
                'Try again'
              ) : (
                'Start liveness check'
              )}
            </Button>

            <Button variant="secondary" size="lg" onPress={() => {}} style={styles.secondaryBtn}>
                Need help?
            </Button>

            <View style={styles.homeIndicator} />
          </View>
        </Container>

        <View style={styles.dotsContainer}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i === 2 ? styles.progressDotActive : styles.progressDotInactive,
              ]}
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#FBF7EE' },
  dotsPattern: {
    position: 'absolute',
    top: height * 0.06,
    right: width * 0.06,
    zIndex: 0,
  },
  dotRow: { flexDirection: 'row', marginBottom: 6 },
  dot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
    backgroundColor: GOLD,
    marginHorizontal: 5,
    opacity: 0.35,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 6,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E4DA',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: { fontWeight: '700', fontSize: 16, color: '#14110C' },
  placeholder: { width: 40, height: 40 },
  container: { flex: 1, paddingTop: 20, paddingHorizontal: 24, alignItems: 'center' },
  titleContainer: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 24, width: '100%' },
  accentLine: { width: 4, borderRadius: 4, backgroundColor: '#FFCB05', marginTop: 6, height: 28 },
  headline: { fontWeight: '800', fontSize: 26, lineHeight: 32, color: '#14110C', letterSpacing: -0.5 },

  scannerWrap: { width: 262, height: 262, position: 'relative', alignItems: 'center', 
    justifyContent: 'center', marginBottom: 24 },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#FFCB05', borderRadius: 4, zIndex: 2 },
  cornerTL: { left: 0, top: 0, borderTopWidth: 3,
    borderLeftWidth: 3, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { right: 0, top: 0, borderTopWidth: 3,
    borderRightWidth: 3, borderLeftWidth: 0,
    borderBottomWidth: 0 },
  cornerBL: { left: 0, bottom: 0, borderBottomWidth: 3,
    borderLeftWidth: 3, borderTopWidth: 0, borderRightWidth: 0 },
  cornerBR: { right: 0, bottom: 0, borderBottomWidth: 3,
    borderRightWidth: 3, borderTopWidth: 0, borderLeftWidth: 0 },

  circleInner: { position: 'absolute', inset: 8, borderRadius: 121, overflow: 'hidden', backgroundColor: '#1C1A16' },
  circleBackground: { ...StyleSheet.absoluteFill, backgroundColor: '#1C1A16', alignItems: 'center',
    justifyContent: 'center' },
  faceOverlay: { alignItems: 'center', justifyContent: 'flex-end', marginBottom: 20, zIndex: 1 },
  headOutline: { width: 90, height: 110, borderRadius: 45, borderWidth: 2, borderColor: 'rgba(255,255,255,0.22)',
    borderStyle: 'dashed', borderBottomWidth: 0 },
  shoulderOutline: { width: 120, height: 50, borderRadius: 60, borderWidth: 2, borderColor: 'rgba(255,255,255,0.22)',
    borderStyle: 'dashed', borderTopWidth: 0, marginTop: -8 },

  sweepLine: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: 'rgba(47,169,107,0.9)', 
    shadowColor: '#2FA96B', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 16, elevation: 10 },

  liveBadge: { position: 'absolute', bottom: 18, left: '50%', transform: [{ translateX: -50 }], 
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 11, 
    borderRadius: 999, backgroundColor: 'rgba(18,16,13,0.72)' },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  liveDotRunning: { backgroundColor: '#FF4D3D' },
  liveDotDone: { backgroundColor: '#2FA96B' },
  liveDotError: { backgroundColor: '#E0574A' },
  liveLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: '#FFFFFF', textTransform: 'uppercase' },

  ringWrapper: { position: 'absolute', inset: 0 },
  ringTrack: { ...StyleSheet.absoluteFill, borderRadius: 129, borderWidth: 6, borderColor: '#EDE9E0' },
  ringProgress: { ...StyleSheet.absoluteFill, borderRadius: 129, borderWidth: 6, borderBottomColor: 'transparent', 
    borderLeftColor: 'transparent', transform: [{ rotate: '45deg' }] },
  halo: { position: 'absolute', inset: 8, borderRadius: 121, 
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 10, elevation: 8 },

  promptContainer: { alignItems: 'center', gap: 12, marginBottom: 20 },
  promptLabel: { fontSize: 18, fontWeight: '800', color: '#14110C', letterSpacing: -0.4 },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedbackDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#7A746A', 
    justifyContent: 'center', alignItems: 'center' },
  feedbackDotActive: { borderColor: '#2FA96B', backgroundColor: '#2FA96B' },
  feedbackText: { fontSize: 13.5, fontWeight: '600', color: '#7A746A' },
  feedbackTextError: { color: '#C0362C' },
  feedbackTextSuccess: { color: '#1F7A4C' },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#F3C9C3',
    borderRadius: 16, backgroundColor: '#FEF3F1', padding: 13, width: '100%', marginBottom: 16 },
  bannerIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#FBE3E0', 
    justifyContent: 'center', alignItems: 'center' },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#7A2820', lineHeight: 19 },
  bannerClose: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },

  bottomActions: { paddingTop: 12, paddingBottom: 24, backgroundColor: '#FBF7EE', borderTopWidth: 1, 
    borderTopColor: '#EFEBE1', width: '100%' },
  bottomContainer: { paddingHorizontal: 24 },
  buttonGroup: { gap: 12, width: '100%' },
  primaryBtn: { height: 54, borderRadius: 27 },
  primaryBtnActive: { backgroundColor: '#FFCB05' },
  primaryBtnDisabled: { backgroundColor: '#F5EFDC' },
  secondaryBtn: { height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: '#F0DE9C',
    backgroundColor: '#FFFFFF', color: '#14110C' },
  homeIndicator: { width: 134, height: 5, borderRadius: 3, backgroundColor: 'rgba(20,17,12,0.25)', 
    alignSelf: 'center', marginTop: 8 },
  dotsContainer: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', paddingTop: 18 },
  progressDot: { height: 7, borderRadius: 4 },
  progressDotActive: { width: 22, backgroundColor: '#FFCB05' },
  progressDotInactive: { width: 7, backgroundColor: '#E2DFD7' },
});