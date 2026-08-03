import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Card, Container, Button } from '@/components/ui';
import { Colors } from '@/theme';
import { useJourneyStore } from '@/store/useJourneyStore';
import { extractDocumentFields } from '@/shared/api';

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: any) => void;
  routeParams?: Record<string, unknown>;
}

/* The captured photo is kept, not just previewed: the backend OCRs it, matches
 * its printed details against what the customer typed, and compares the photo
 * on it to the live selfie. Discarding it here would leave three of the
 * journey's checks with nothing to run against. */

export function IDDocumentScanScreen({
  navigate,
  goBack,
  dispatch,
}: Props) {
  const [phase, setPhase] = useState<'ready' | 'scanning' | 'done' | 'error'>('ready');
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [banner, setBanner] = useState('');
  const scanTimer = useRef<NodeJS.Timeout | null>(null);

  const fullName = useJourneyStore((s) => s.fullName);
  const idNumber = useJourneyStore((s) => s.idNumber);
  const documentType = useJourneyStore((s) => s.documentType);
  const setDocumentImage = useJourneyStore((s) => s.setDocumentImage);
  const record = useJourneyStore((s) => s.record);

  const verifying = phase === 'scanning';

  const sweepAnim = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    // Captured on mount: reading scanTimer.current inside the cleanup would read
    // whatever it points at when the component unmounts, not the timer this
    // effect is responsible for.
    const timer = scanTimer;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (phase === 'scanning') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(sweepAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(sweepAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      sweepAnim.stopAnimation();
      sweepAnim.setValue(0);
    }
  }, [phase, sweepAnim]);

  const sweepTranslateY = useMemo(
    () =>
      sweepAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-84, 84],
      }),
    [sweepAnim],
  );

  /* ── Navigation helpers ── */
  const handleBack = () => {
    if (goBack) {
      goBack();
    } else if (dispatch) {
      dispatch({ type: 'GO_BACK' });
    }
  };

  const handleNavigate = (screen: string, params?: any) => {
    if (navigate) {
      navigate(screen, params);
    } else if (dispatch) {
      dispatch({ type: 'NAVIGATE', payload: { screen, params } });
    }
  };

  /* ── Capture flow ── */
  const handleCapture = async () => {
    if (phase === 'scanning' || verifying) return;

    if (phase === 'done') {
      handleNavigate('FacialVerification');
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    const result =
      status !== 'granted'
        ? await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          quality: 0.8,
          base64: true,
        })
        : await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true });

    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.base64) {
      setPhase('error');
      setBanner('That photo could not be read. Take it again.');
      return;
    }
    startScanning(`data:image/jpeg;base64,${asset.base64}`);
  };

  /* Reads the document through the same OCR the journey runs, so a photo the
   * backend cannot read is caught here — while the customer still has the card
   * in their hand — rather than at the end of the journey. */
  const startScanning = async (dataUrl: string) => {
    setPhase('scanning');
    setBanner('');

    try {
      const ocr = await extractDocumentFields(dataUrl, fullName, idNumber);
      if (!ocr.success) {
        setPhase('error');
        setBanner(
          ocr.error?.includes('corrupted') || ocr.error?.includes('unsupported')
            ? 'That image could not be read. Keep the card flat and fill the frame.'
            : 'The text came out blurry. Steady your phone and keep the card flat.',
        );
        return;
      }
      setDocumentImage(dataUrl);
      record('ID document read', 'pass', ocr.full_name ?? 'details extracted');
      setPhase('done');
    } catch (err) {
      setPhase('error');
      setBanner(err instanceof Error ? err.message : 'The scan could not be completed.');
    }
  };

  const dismissBanner = () => {
    setBanner('');
    setPhase('ready');
  };

  /* The passport flow is the same scan — the backend branches on
   * document_type, which was chosen back on the SA ID selection screen. Send
   * the customer there to change it rather than dead-ending. */
  const handleUsePassport = () => {
    if (documentType === 'PASSPORT') {
      setBanner('You are already on the passport journey — photograph your passport page.');
      return;
    }
    handleNavigate('SAIDSelection');
  };

  const isDone = phase === 'done';
  const isError = phase === 'error';
  const isScanning = phase === 'scanning';
  const isBack = side === 'back';
  const accentColor = isError ? '#E0574A' : isDone ? '#2FA96B' : Colors.primary;

  const getChip = 
      (label: string, tone: 'good' | 'warn' | 'idle') => {
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
            borderWidth: 1,
            borderColor: map.bd,
          },
          textColor: map.fg,
        };
      };

  const chips = [
    getChip('Flat surface', isError ? 'warn' : isDone ? 'good' : 'idle'),
    getChip('No glare', isDone ? 'good' : 'idle'),
    getChip('All corners inside', isDone ? 'good' : 'idle'),
  ];

  const canContinue = phase === 'done' && side === 'back';

  const buttonLabel = verifying
    ? 'Verifying…'
    : isScanning
      ? 'Scanning…'
      : isError
        ? 'Try again'
        : canContinue
          ? 'Continue'
          : 'Capture';

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <Container>
        <Card style={styles.cardContainer}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Typography variant="subtitle" style={styles.headerTitle}>
                ID Document Scan
            </Typography>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.headlineContainer}>
            <View style={[styles.titleAccent, { backgroundColor: Colors.primary }]} />
            <Typography variant="h1" style={styles.headline}>
              {isBack
                ? 'Now capture the back of your ID'
                : 'Capture the front of your ID document'}
            </Typography>
          </View>

          <View
            style={[
              styles.viewport,
              isScanning && styles.viewportScanning,
              isDone && styles.viewportDone,
              isError && styles.viewportError,
            ]}
          >
            <View style={styles.cardPlaceholder}>
              <View style={styles.cardPlaceholderInner}>
                <View style={styles.cardLines}>
                  <View style={styles.cardLineShort} />
                  <View style={styles.cardLineLong} />
                </View>
                <View style={styles.cardPhoto} />
              </View>
            </View>

            {isScanning && (
              <Animated.View
                style={[
                  styles.sweepLine,
                  { transform: [{ translateY: sweepTranslateY }] },
                ]}
              />
            )}

            <View style={[styles.corner, styles.cornerTL, { borderColor: accentColor }]} />
            <View style={[styles.corner, styles.cornerTR, { borderColor: accentColor }]} />
            <View style={[styles.corner, styles.cornerBL, { borderColor: accentColor }]} />
            <View style={[styles.corner, styles.cornerBR, { borderColor: accentColor }]} />

            <View style={styles.liveBadge}>
              <View
                style={[
                  styles.liveDot,
                  isError
                    ? styles.liveDotError
                    : isDone
                      ? styles.liveDotDone
                      : isScanning
                        ? styles.liveDotScanning
                        : styles.liveDotReady,
                ]}
              />
              <Typography variant="caption" style={styles.liveLabel}>
                {isDone
                  ? 'Captured'
                  : isError
                    ? 'Paused'
                    : isScanning
                      ? 'Scanning'
                      : isBack
                        ? 'Back side'
                        : 'Front side'}
              </Typography>
            </View>

            <TouchableOpacity
              style={[styles.shutter, (isScanning || verifying) && styles.shutterDisabled]}
              onPress={handleCapture}
              disabled={isScanning || verifying}
            >
              {verifying ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.statusContainer}>
            <Typography variant="h2" style={styles.statusTitle}>
              {isScanning
                ? 'Hold steady'
                : isDone
                  ? isBack
                    ? 'Both sides captured'
                    : 'Front captured'
                  : isError
                    ? 'Let us try that again'
                    : 'Scan your ID document'}
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
                ? 'Reading the details on your card'
                : isDone
                  ? 'All details were readable'
                  : isError
                    ? 'Blurry image detected'
                    : 'Make sure all details are clear and visible'}
            </Typography>
          </View>

          {side === 'front' && isDone && (
            <View style={styles.sidePrompt}>
              <Typography variant="body" style={styles.sidePromptText}>
                    Great. Now flip the card and capture the back.
              </Typography>
            </View>
          )}

          {!banner && (
            <View style={styles.chipsContainer}>
              {chips.map((chip, idx) => (
                <View key={idx} style={chip.style}>
                  <Typography variant="caption" style={{ color: chip.textColor }}>
                    {chip.label}
                  </Typography>
                </View>
              ))}
            </View>
          )}

          {!!banner && (
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

          <View style={styles.actionContainer}>
            <Button
              onPress={handleCapture}
              variant={isScanning || verifying ? 'outline' : 'primary'}
              disabled={isScanning || verifying}
              style={isScanning || verifying ? styles.buttonDisabled : styles.buttonPrimary}
            >
              {buttonLabel}
            </Button>
            <TouchableOpacity onPress={handleUsePassport} style={styles.passportLink}>
              <Typography variant="caption" style={styles.passportText}>
                  Use passport instead
              </Typography>
            </TouchableOpacity>
          </View>

          <View style={styles.dotsContainer}>
            {Array.from({ length: 10 }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === 4 ? styles.dotActive : styles.dotInactive]}
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
  cardContainer: { paddingHorizontal: 24, paddingVertical: 16, alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#EFEBE1',
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15.5, fontWeight: '700', color: Colors.text },
  headerSpacer: { width: 42 },
  headlineContainer: { flexDirection: 'row', alignItems: 'stretch', gap: 13, marginBottom: 22 },
  titleAccent: { width: 4, borderRadius: 4 },
  headline: { fontSize: 25, lineHeight: 30, fontWeight: '800', color: Colors.text, letterSpacing: -0.6, maxWidth: 258 },
  viewport: { position: 'relative', width: '100%', height: 212, borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#1C1A16', alignItems: 'center', justifyContent: 'center', borderWidth: 0 },
  viewportScanning: { borderWidth: 4, borderColor: Colors.primary,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.16,
    shadowRadius: 8, elevation: 8 },
  viewportDone: { borderWidth: 4, borderColor: '#2FA96B', shadowColor: '#2FA96B', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16, shadowRadius: 8, elevation: 8 },
  viewportError: { borderWidth: 4, borderColor: '#E0574A', shadowColor: '#E0574A',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 8 },
  cardPlaceholder: { position: 'absolute', left: 22, right: 22, top: 26, bottom: 26, borderRadius: 12,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.28)', borderStyle: 'dashed', padding: 12 },
  cardPlaceholderInner: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardLines: { flex: 1, gap: 7 },
  cardLineShort: { width: '82%', height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
  cardLineLong: { width: '64%', height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
  cardPhoto: { width: 46, height: 58, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.14)' },
  sweepLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,203,5,0.95)',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 16, elevation: 10 },
  corner: { position: 'absolute', width: 26, height: 26, borderWidth: 3.8, borderRadius: 4 },
  cornerTL: { left: 10, top: 10, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { right: 10, top: 10, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { left: 10, bottom: 10, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { right: 10, bottom: 10, borderLeftWidth: 0, borderTopWidth: 0 },
  liveBadge: { position: 'absolute', left: 14, top: 14, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(18,16,13,0.72)' },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  liveDotReady: { backgroundColor: '#FF4D3D' },
  liveDotScanning: { backgroundColor: '#FF4D3D' },
  liveDotDone: { backgroundColor: '#2FA96B' },
  liveDotError: { backgroundColor: '#E0574A' },
  liveLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: '#FFFFFF', textTransform: 'uppercase' },
  shutter: { position: 'absolute', bottom: -26, left: '50%', transform: [{ translateX: -29 }], width: 58, height: 58,
    borderRadius: 29, borderWidth: 4, borderColor: '#FFFDF9', backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42, shadowRadius: 20, elevation: 10 },
  shutterDisabled: { backgroundColor: '#F5EFDC' },
  shutterInner: { width: 22, height: 22,
    borderRadius: 11, borderWidth: 2, borderColor: Colors.text },
  statusContainer: { marginTop: 30, alignItems: 'center' },
  statusTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  statusHint: { fontSize: 13.5, fontWeight: '600', textAlign: 'center', color: '#7A746A', marginTop: 4 },
  statusHintError: { color: '#C0362C' },
  statusHintDone: { color: '#1F7A4C' },
  sidePrompt: { marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: '#FFFCF2', borderWidth: 1.5,
    borderColor: '#F0DE9C' },
  sidePromptText: { fontSize: 13.5, fontWeight: '600', color: '#4A453D', textAlign: 'center' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#F3C9C3',
    borderRadius: 16, backgroundColor: '#FEF3F1', padding: 13, marginTop: 18 },
  bannerIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#FBE3E0', alignItems: 'center',
    justifyContent: 'center' },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#7A2820', lineHeight: 18.85 },
  bannerClose: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1 },
  actionContainer: { gap: 10, marginTop: 24 },
  buttonPrimary: { backgroundColor: Colors.primary },
  buttonDisabled: { backgroundColor: '#F5EFDC', color: '#A39B88' },
  passportLink: { alignItems: 'center', paddingVertical: 8 },
  passportText: { fontSize: 13.5, fontWeight: '600', color: '#1F7A4C', textDecorationLine: 'underline' },
  dotsContainer: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', paddingVertical: 22 },
  dot: { height: 7, borderRadius: 4 },
  dotActive: { width: 22, backgroundColor: Colors.primary },
  dotInactive: { width: 7, backgroundColor: '#E2DFD7' },
});