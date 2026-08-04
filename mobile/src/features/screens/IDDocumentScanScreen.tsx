// src/features/screens/IDDocumentScanScreen.tsx
import React, { useState } from 'react';
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
import { API_BASE_URL } from '@/config/apiBase';

const { width, height } = Dimensions.get('window');
const GOLD = '#D4AF37';

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: any) => void;
  routeParams?: Record<string, unknown>;
}

export function IDDocumentScanScreen({
  navigate,
  goBack,
  dispatch,
  routeParams,
}: Props) {
  const [loading, setLoading] = useState(false);

  const handleBack = () => {
    if (goBack) goBack();
    else if (dispatch) dispatch({ type: 'GO_BACK' });
  };

  const handleNavigate = (screen: string, params?: any) => {
    if (navigate) navigate(screen, params);
    else if (dispatch)
      dispatch({ type: 'NAVIGATE', payload: { screen, params } });
  };

  /* ── Shared upload to selfies endpoint ── */
  const uploadDocument = async (imageData: string) => {
    try {
      const baseUrl = API_BASE_URL;

      const idNumber = (routeParams?.id_number as string) || '8107255492089';

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

      console.log('[IDDocumentScan] Document uploaded successfully');
      handleNavigate('FacialVerification');
    } catch (err) {
      console.error('[IDDocumentScan] Upload error:', err);
      handleNavigate('FacialVerification');
    } finally {
      setLoading(false);
    }
  };

  /* ── Web: capture via getUserMedia (rear camera for ID) ── */
  const captureWebCamera = async (): Promise<string | null> => {
    try {
      const mediaDevices = (window as any).navigator.mediaDevices;
      if (!mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia not supported');
      }

      const stream = await mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
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
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      stream.getTracks().forEach((track: any) => track.stop());

      return base64;
    } catch (err) {
      console.error('[Web Camera] failed:', err);
      return null;
    }
  };

  /* ── 1. Capture ID via camera ── */
  const handleCapture = async () => {
    if (loading) return;
    setLoading(true);

    if (Platform.OS === 'web') {
      const imageData = await captureWebCamera();
      if (imageData) {
        await uploadDocument(imageData);
        return;
      }
      Alert.alert(
        'Camera unavailable',
        'Could not access webcam. Please upload an image instead.',
      );
      setLoading(false);
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.8,
        base64: true,
        allowsEditing: true,
        aspect: [4, 3],
        cameraType: ImagePicker.CameraType.back,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const imageData = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        await uploadDocument(imageData);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('[Camera] failed:', err);
      setLoading(false);
    }
  };

  /* ── 2. Upload ID from gallery ── */
  const handleUpload = async () => {
    if (loading) return;
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
        await uploadDocument(imageData);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('[Gallery] failed:', err);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />

      {/* Gold dot pattern — top right */}
      <View style={styles.dotsPattern}>
        {[...Array(5)].map((_, row) => (
          <View key={row} style={styles.dotRow}>
            {[...Array(5)].map((_, col) => (
              <View key={col} style={styles.dot} />
            ))}
          </View>
        ))}
      </View>

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#14110C" />
        </Pressable>
        <Typography variant="body" style={styles.topBarTitle}>
            ID Document Scan
        </Typography>
        <View style={styles.placeholder} />
      </View>

      <Container style={styles.container}>
        {/* Title */}
        <View style={styles.titleContainer}>
          <View style={styles.accentLine} />
          <Typography variant="h1" style={styles.headline}>
              Capture the front of{'\n'}your ID document
          </Typography>
        </View>

        {/* Scanner viewport */}
        <View style={styles.viewport}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />

          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Typography variant="caption" style={styles.badgeText}>
                CAMERA OFF
            </Typography>
          </View>

          <View style={styles.idPlaceholder}>
            <View style={styles.idPhoto} />
            <View style={styles.idLines}>
              <View style={styles.idLineLong} />
              <View style={styles.idLineMedium} />
              <View style={styles.idLineShort} />
            </View>
          </View>

          {/* Shutter button — triggers camera */}
          <Pressable
            style={styles.shutterButton}
            onPress={handleCapture}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#14110C" size="small" />
            ) : (
              <Ionicons name="camera-outline" size={24} color="#14110C" />
            )}
          </Pressable>
        </View>

        <Typography variant="body" style={styles.statusText}>
          {loading ? 'Processing…' : 'Scan your ID document'}
        </Typography>
      </Container>

      {/* Bottom actions */}
      <View style={styles.bottomActions}>
        <Container style={styles.bottomContainer}>
          <View style={styles.buttonGroup}>
            {/* Primary: Capture */}
            <Button
              variant="primary"
              size="lg"
              onPress={handleCapture}
              disabled={loading}
              style={
                loading
                  ? [styles.primaryBtn, styles.primaryBtnDisabled]
                  : [styles.primaryBtn, styles.primaryBtnActive]
              }
            >
              {loading ? (
                <ActivityIndicator color="#14110C" />
              ) : (
                'Capture'
              )}
            </Button>

            {/* Secondary: Upload an image */}
            <Pressable
              onPress={handleUpload}
              disabled={loading}
              style={[
                styles.uploadBtn,
                loading && styles.uploadBtnDisabled,
              ]}
            >
              <Ionicons
                name="arrow-up-outline"
                size={18}
                color="#14110C"
                style={{ marginRight: 8 }}
              />
              <Typography
                variant="body"
                style={{ fontWeight: '600', fontSize: 16, color: '#14110C' }}
              >
                  Upload an image
              </Typography>
            </Pressable>

            <View style={styles.homeIndicator} />
          </View>
        </Container>

        {/* Progress dots — 5 dots, 4th active */}
        <View style={styles.dotsContainer}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i === 3
                  ? styles.progressDotActive
                  : styles.progressDotInactive,
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
  topBarTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: '#14110C',
  },
  placeholder: { width: 40, height: 40 },
  container: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 28,
    width: '100%',
  },
  accentLine: {
    width: 4,
    borderRadius: 4,
    backgroundColor: '#FFCB05',
    marginTop: 6,
    height: 28,
  },
  headline: {
    fontWeight: '800',
    fontSize: 26,
    lineHeight: 32,
    color: '#14110C',
    letterSpacing: -0.5,
  },
  viewport: {
    width: '100%',
    height: 220,
    borderRadius: 20,
    backgroundColor: '#1C1A16',
    position: 'relative',
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#FFCB05',
    borderRadius: 4,
    zIndex: 2,
  },
  cornerTL: {
    left: 12,
    top: 12,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTR: {
    right: 12,
    top: 12,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBL: {
    left: 12,
    bottom: 12,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  cornerBR: {
    right: 12,
    bottom: 12,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,26,22,0.85)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    zIndex: 2,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E0574A',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  idPlaceholder: {
    position: 'absolute',
    left: 36,
    right: 36,
    top: 36,
    bottom: 36,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    borderStyle: 'dashed',
    borderRadius: 12,
    flexDirection: 'row',
    padding: 14,
    gap: 14,
  },
  idPhoto: {
    width: 48,
    height: 58,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  idLines: {
    flex: 1,
    gap: 8,
    justifyContent: 'center',
  },
  idLineLong: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    width: '100%',
  },
  idLineMedium: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    width: '72%',
  },
  idLineShort: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    width: '48%',
  },
  shutterButton: {
    position: 'absolute',
    bottom: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFCB05',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FBF7EE',
    shadowColor: '#FFCB05',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 10,
  },
  statusText: {
    marginTop: 40,
    fontSize: 16,
    fontWeight: '700',
    color: '#14110C',
    textAlign: 'center',
  },
  bottomActions: {
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: '#FBF7EE',
    borderTopWidth: 1,
    borderTopColor: '#EFEBE1',
    width: '100%',
  },
  bottomContainer: { paddingHorizontal: 24 },
  buttonGroup: { gap: 12, width: '100%' },
  primaryBtn: {
    height: 54,
    borderRadius: 27,
  },
  primaryBtnActive: { backgroundColor: '#FFCB05' },
  primaryBtnDisabled: { backgroundColor: '#F5EFDC' },
  uploadBtn: {
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: '#F0DE9C',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtnDisabled: {
    opacity: 0.6,
  },
  homeIndicator: {
    width: 134,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(20,17,12,0.25)',
    alignSelf: 'center',
    marginTop: 8,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 18,
  },
  progressDot: { height: 7, borderRadius: 4 },
  progressDotActive: { width: 22, backgroundColor: '#FFCB05' },
  progressDotInactive: { width: 7, backgroundColor: '#E2DFD7' },
});

export default IDDocumentScanScreen;