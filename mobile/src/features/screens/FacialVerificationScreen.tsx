import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Typography, Card, Container, Button } from '@/components/ui';
import { Colors } from '@/theme';
import { useJourneyStore } from '@/store/useJourneyStore';
import { captureSelfie } from '@/shared/api';

interface Props {
  dispatch: (action: any) => void;
  simulateFailure?: boolean;
  showChecklist?: boolean;
  showSecondaryAction?: boolean;
  ctaEmphasis?: 'glow' | 'flat';
  stepCount?: number;
  activeStep?: number;
}

export default function FacialVerificationScreen({
  dispatch,
  simulateFailure = false,
  showChecklist = true,
  showSecondaryAction = true,
  ctaEmphasis = 'glow',
  stepCount = 10,
  activeStep = 6,
}: Props) {
  const [phase, setPhase] = useState<'ready' | 'scanning' | 'done' | 'error'>('ready');
  const [banner, setBanner] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const idNumber = useJourneyStore((s) => s.idNumber);
  const setSelfieId = useJourneyStore((s) => s.setSelfieId);
  const record = useJourneyStore((s) => s.record);

  const pulseAnim = useMemo(() => new Animated.Value(0), []);

  const cornerAnim = useMemo(
    () =>
      pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.45],
      }),
    [pulseAnim],
  );

  const scanLineTranslateY = useMemo(
    () =>
      pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-54, 54],
      }),
    [pulseAnim],
  );

  useEffect(() => {
    // Captured on mount: reading timerRef.current inside the cleanup would read
    // whatever it points at when the component unmounts, not the timer this
    // effect is responsible for.
    const timer = timerRef;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (phase === 'scanning') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 1300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0);
    }
  }, [phase, pulseAnim]);

  /* Takes the selfie and registers it with the backend. The liveness check
   * runs on the next screen against the id returned here, and the same stored
   * image is later compared to the photo on the document and to the Home
   * Affairs record — so this one capture feeds three separate checks. */
  const startScan = async () => {
    if (phase === 'scanning') return;
    if (phase === 'done') {
      dispatch({ type: 'NAVIGATE', payload: { screen: 'LivenessDetection' } });
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setPhase('error');
      setBanner('We need camera access to check that a live person is present.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
      cameraType: ImagePicker.CameraType.front,
    });
    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.base64) {
      setPhase('error');
      setBanner('That photo could not be read. Try again.');
      return;
    }

    setPhase('scanning');
    setBanner('');
    try {
      const selfie = await captureSelfie(idNumber.trim(), `data:image/jpeg;base64,${asset.base64}`);
      setSelfieId(selfie.selfie_id);
      record('Selfie captured', 'info', selfie.content_type);
      setPhase('done');
    } catch (err) {
      setPhase('error');
      setBanner(
        err instanceof Error
          ? err.message
          : 'We could not get a clear read. Move to brighter light and try again.',
      );
    }
  };

  const dismissBanner = () => {
    setBanner('');
    setPhase('ready');
  };

  const isDone = phase === 'done';
  const isError = phase === 'error';
  const isScanning = phase === 'scanning';

  const accentColor = isError ? '#E0574A' : isDone ? '#2FA96B' : Colors.primary;
  const ringOpacity = isDone || isError || isScanning ? 1 : 0.35;

  const chip = (label: string, tone: 'good' | 'warn' | 'idle') => {
    const map = {
      good: { bg: '#E4F5EA', fg: '#1F7A4C', bd: '#C4E7D2' },
      warn: { bg: '#FEF3F1', fg: '#A8382C', bd: '#F3C9C3' },
      idle: { bg: Colors.surface, fg: '#6B6559', bd: '#ECE8DF' },
    }[tone];
    return {
      label,
      style: {
        fontSize: 12.5,
        fontWeight: '600' as const,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: map.bg,
        color: map.fg,
        borderWidth: 1,
        borderColor: map.bd,
      },
    };
  };

  const chips = [
    chip('Good lighting', isError ? 'warn' : isDone ? 'good' : 'idle'),
    chip('No hat or glasses', isDone ? 'good' : 'idle'),
    chip('Look straight ahead', isDone ? 'good' : 'idle'),
  ];

  const total = stepCount;
  const active = Math.min(Math.max(activeStep, 1), total) - 1;

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <Container>
        <Card style={styles.cardContainer}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => dispatch({ type: 'GO_BACK' })}
            >
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Typography variant="subtitle" style={styles.headerTitle}>
                Facial Verification
            </Typography>
            <View style={styles.headerSpacer} />
          </View>

          {/* Headline */}
          <View style={styles.headlineContainer}>
            <View style={[styles.titleAccent, { backgroundColor: Colors.primary }]} />
            <Typography variant="h1" style={styles.headline}>
                Position your face inside the frame
            </Typography>
          </View>

          {/* Face Circle */}
          <View style={styles.faceContainer}>
            <View style={styles.faceCircle}>
              <View style={styles.facePlaceholder} />
              {isScanning && (
                <Animated.View
                  style={[
                    styles.scanLine,
                    { transform: [{ translateY: scanLineTranslateY }] },
                  ]}
                />
              )}
            </View>
            <Animated.View
              style={[
                styles.ring,
                {
                  borderColor: accentColor,
                  opacity: ringOpacity,
                  shadowColor: isScanning ? Colors.primary : isDone ? '#2FA96B' : 'transparent',
                },
              ]}
            />
            <Animated.View
              style={[
                styles.corner,
                styles.cornerTL,
                { borderColor: accentColor, opacity: isScanning ? cornerAnim : 1 },
              ]}
            />
            <Animated.View
              style={[
                styles.corner,
                styles.cornerTR,
                { borderColor: accentColor, opacity: isScanning ? cornerAnim : 1 },
              ]}
            />
            <Animated.View
              style={[
                styles.corner,
                styles.cornerBL,
                { borderColor: accentColor, opacity: isScanning ? cornerAnim : 1 },
              ]}
            />
            <Animated.View
              style={[
                styles.corner,
                styles.cornerBR,
                { borderColor: accentColor, opacity: isScanning ? cornerAnim : 1 },
              ]}
            />
          </View>

          {/* Status */}
          <View style={styles.statusContainer}>
            <Typography variant="h2" style={styles.statusTitle}>
              {isScanning ? 'Hold still' : isDone ? 'Face captured' : isError ? 'Let us try that again' : 'Scan your face'}
            </Typography>
            <Typography
              variant="body"
              style={[
                styles.statusHint,
                isError && styles.statusHintError,
                isDone && styles.statusHintDone,
              ]}
            >
              {isScanning
                ? 'Keep your face inside the circle'
                : isDone
                  ? 'Your selfie matched the frame'
                  : isError
                    ? 'Poor lighting detected'
                    : 'Make sure it is well lit'}
            </Typography>
          </View>

          {/* Checklist */}
          {showChecklist && !banner && (
            <View style={styles.chipsContainer}>
              {chips.map((chip, idx) => (
                <View key={idx} style={chip.style}>
                  <Typography variant="caption" style={{ color: chip.style.color }}>
                    {chip.label}
                  </Typography>
                </View>
              ))}
            </View>
          )}

          {/* Error Banner */}
          {banner && (
            <View style={styles.banner}>
              <View style={styles.bannerIcon}>
                <Ionicons name="alert-circle" size={16} color="#C0362C" />
              </View>
              <Typography variant="body" style={styles.bannerText}>
                {banner}
              </Typography>
              <TouchableOpacity onPress={dismissBanner} style={styles.bannerClose}>
                <Ionicons name="close" size={16} color="#7A2820" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.spacer} />

          {/* Actions */}
          <View style={styles.actionContainer}>
            <Button
              onPress={startScan}
              variant={isScanning ? 'outline' : 'primary'}
              disabled={isScanning}
              style={isScanning ? styles.buttonDisabled : styles.buttonPrimary}
            >
              {isScanning ? 'Scanning…' : isDone ? 'Continue' : isError ? 'Try again' : 'Scan my face'}
            </Button>
            {showSecondaryAction && (
              <Button onPress={() => {}} variant="outline" style={styles.secondaryButton}>
                    Need help?
              </Button>
            )}
          </View>

          {/* Step dots — 10 steps, step 6 active */}
          <View style={styles.dotsContainer}>
            {Array.from({ length: total }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === active ? styles.dotActive : styles.dotInactive]}
              />
            ))}
          </View>
        </Card>
      </Container>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: Colors.background },
  cardContainer: { paddingHorizontal: 24, paddingVertical: 16, alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  backButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#EFEBE1',
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15.5, fontWeight: '700', color: Colors.text },
  headerSpacer: { width: 42 },
  headlineContainer: { flexDirection: 'row', alignItems: 'stretch', gap: 13, width: '100%', marginBottom: 26 },
  titleAccent: { width: 4, borderRadius: 4 },
  headline: { fontSize: 25, lineHeight: 30, fontWeight: '800', color: Colors.text, letterSpacing: -0.6, maxWidth: 260 },
  faceContainer: { position: 'relative', width: 262, height: 262, marginBottom: 26 },
  faceCircle: { position: 'absolute', inset: 0, borderRadius: 131, overflow: 'hidden', backgroundColor: '#F1EEE7' },
  facePlaceholder: { flex: 1, backgroundColor: '#E8E4DC' },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: Colors.primary,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 18, elevation: 10 },
  ring: { position: 'absolute', inset: -6, borderRadius: 137, borderWidth: 3, shadowOffset: { width: 0,
    height: 0 }, shadowRadius: 8, elevation: 6 },
  corner: { position: 'absolute', width: 24, height: 24, borderWidth: 3.6, borderRadius: 4 },
  cornerTL: { left: -14, top: -14, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { right: -14, top: -14, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { left: -14, bottom: -14, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { right: -14, bottom: -14, borderLeftWidth: 0, borderTopWidth: 0 },
  statusContainer: { alignItems: 'center', gap: 7 },
  statusTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  statusHint: { fontSize: 13.5, fontWeight: '600', textAlign: 'center', color: '#7A746A' },
  statusHintError: { color: '#C0362C' },
  statusHintDone: { color: '#1F7A4C' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#F3C9C3',
    borderRadius: 16, backgroundColor: '#FEF3F1', padding: 13, marginTop: 18, width: '100%' },
  bannerIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#FBE3E0',
    alignItems: 'center', justifyContent: 'center' },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#7A2820', lineHeight: 19 },
  bannerClose: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1 },
  actionContainer: { gap: 10, width: '100%', marginTop: 24 },
  buttonPrimary: { backgroundColor: Colors.primary },
  buttonDisabled: { backgroundColor: '#F5EFDC', color: '#A39B88' },
  secondaryButton: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: '#F0DE9C' },
  dotsContainer: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', paddingVertical: 22 },
  dot: { height: 7, borderRadius: 4 },
  dotActive: { width: 22, backgroundColor: Colors.primary },
  dotInactive: { width: 7, backgroundColor: '#E2DFD7' },
});