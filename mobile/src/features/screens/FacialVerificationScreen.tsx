// src/features/screens/FacialVerificationScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Container, Button } from '@/components/ui';

const { width, height } = Dimensions.get('window');
const GOLD = '#D4AF37';

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: any) => void;
  routeParams?: Record<string, unknown>;
}

export default function FacialVerificationScreen({
  navigate,
  goBack,
  dispatch,
  routeParams,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const circleRef = useRef<any>(null);

  const idNumber = (routeParams?.id_number as string) || '8107255492089';

  useEffect(() => {
    if (Platform.OS !== 'web') {
      (async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        setHasPermission(status === 'granted');
      })();
    }
  }, []);

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
        console.error('[FacialVerification] Preview failed:', err);
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

  const handleBack = () => {
    if (goBack) goBack();
    else if (dispatch) dispatch({ type: 'GO_BACK' });
  };

  const handleNavigate = (screen: string, params?: any) => {
    if (navigate) navigate(screen, params);
    else if (dispatch)
      dispatch({ type: 'NAVIGATE', payload: { screen, params } });
  };

  const uploadSelfie = async (imageData: string) => {
    try {
      const baseUrl =
          process.env.EXPO_PUBLIC_API_BASE_URL ||
          'https://backend-poc-bcd0hnd5c9e0cwfm.southafricanorth-01.azurewebsites.net';

      const response = await fetch(`${baseUrl}/api/v1/selfies`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id_number: idNumber,
          image: imageData,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const data = await response.json();
      console.log('[FacialVerification] Selfie uploaded:', data.selfie_id);

      // CRITICAL: pass id_number forward so Liveness → Fraud → Approved → Complete can all use it
      handleNavigate('LivenessDetection', {
        selfie_id: data.selfie_id,
        id_number: idNumber,
      });
    } catch (err) {
      console.error('[FacialVerification] Upload error:', err);
      handleNavigate('LivenessDetection', { id_number: idNumber });
    } finally {
      setLoading(false);
    }
  };

  const openGallery = async () => {
    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const imageData = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        await uploadSelfie(imageData);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('[Gallery] failed:', err);
      setLoading(false);
    }
  };

  const captureWebCamera = async (): Promise<string | null> => {
    try {
      const mediaDevices = (window as any).navigator.mediaDevices;
      if (!mediaDevices?.getUserMedia) throw new Error('getUserMedia not supported');
      const stream = await mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('autoplay', 'true');
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = reject;
        setTimeout(() => resolve(), 1000);
      });
      await video.play();
      await new Promise((r) => setTimeout(r, 600));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx?.translate(canvas.width, 0);
      ctx?.scale(-1, 1);
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      stream.getTracks().forEach((track: any) => track.stop());
      return base64;
    } catch (err) {
      console.error('[Web Camera] failed:', err);
      return null;
    }
  };

  const handleScan = async () => {
    if (loading) return;
    setLoading(true);
    if (Platform.OS === 'web') {
      if (videoRef.current) {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx?.translate(canvas.width, 0);
        ctx?.scale(-1, 1);
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        await uploadSelfie(base64);
        return;
      }
      await openGallery();
      return;
    }
    if (!hasPermission) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status !== 'granted') {
        Alert.alert('Camera Permission', 'Camera access is needed.');
        await openGallery();
        return;
      }
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.8,
        base64: true,
        allowsEditing: true,
        aspect: [4, 3],
        cameraType: ImagePicker.CameraType.front,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const imageData = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        await uploadSelfie(imageData);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('[Camera] failed:', err);
      await openGallery();
    }
  };

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
            Facial Verification
        </Typography>
        <View style={styles.placeholder} />
      </View>
      <Container style={styles.container}>
        <View style={styles.titleContainer}>
          <View style={styles.accentLine} />
          <Typography variant="h1" style={styles.headline}>
              Position your face{'\n'}inside the frame
          </Typography>
        </View>
        <View style={styles.scannerWrap}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          <View ref={circleRef} style={styles.faceCircle}>
            <View style={styles.faceOutline}>
              <View style={styles.headOutline} />
              <View style={styles.shoulderOutline} />
            </View>
            <View style={styles.badge}>
              <View style={styles.badgeDot} />
              <Typography variant="caption" style={styles.badgeText}>
                  CAMERA READY
              </Typography>
            </View>
          </View>
        </View>
        <Typography variant="body" style={styles.statusText}>
          {loading ? 'Processing…' : 'Scan your face'}
        </Typography>
      </Container>
      <View style={styles.bottomActions}>
        <Container style={styles.bottomContainer}>
          <View style={styles.buttonGroup}>
            <Button
              variant="primary"
              size="lg"
              onPress={handleScan}
              disabled={loading}
              style={
                loading
                  ? [styles.primaryBtn, styles.primaryBtnDisabled]
                  : [styles.primaryBtn, styles.primaryBtnActive]
              }
            >
              {loading ? <ActivityIndicator color="#14110C" /> : 'Scan my face'}
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
                i === 3 ? styles.progressDotActive : styles.progressDotInactive,
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
  titleContainer: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 32, width: '100%' },
  accentLine: { width: 4, borderRadius: 4, backgroundColor: '#FFCB05', marginTop: 6, height: 28 },
  headline: { fontWeight: '800', fontSize: 26, lineHeight: 32, color: '#14110C', letterSpacing: -0.5 },
  scannerWrap: { width: 262, height: 262, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  faceCircle: { width: 250, height: 250, borderRadius: 125, backgroundColor: '#1C1A16', alignItems: 'center',
    justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  faceOutline: { alignItems: 'center', justifyContent: 'flex-end', marginBottom: 20, zIndex: 1 },
  headOutline: { width: 90, height: 110, borderRadius: 45, borderWidth: 2, borderColor: 'rgba(255,255,255,0.22)',
    borderStyle: 'dashed', borderBottomWidth: 0 },
  shoulderOutline: { width: 120, height: 50, borderRadius: 60, borderWidth: 2, borderColor: 'rgba(255,255,255,0.22)',
    borderStyle: 'dashed', borderTopWidth: 0, marginTop: -8 },
  badge: { position: 'absolute', bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(28,26,22,0.85)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E0574A' },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#FFCB05', borderRadius: 4, zIndex: 2 },
  cornerTL: { left: 0, top: 0, borderTopWidth: 3, borderLeftWidth: 3,
    borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { right: 0, top: 0, borderTopWidth: 3, borderRightWidth: 3,
    borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { left: 0, bottom: 0, borderBottomWidth: 3, borderLeftWidth: 3,
    borderTopWidth: 0, borderRightWidth: 0 },
  cornerBR: { right: 0, bottom: 0, borderBottomWidth: 3, borderRightWidth: 3,
    borderTopWidth: 0, borderLeftWidth: 0 },
  statusText: { marginTop: 28, fontSize: 16, fontWeight: '700', color: '#14110C', textAlign: 'center' },
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