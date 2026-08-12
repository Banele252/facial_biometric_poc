// src/screens/SimBarcodeScanScreen.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Typography, Button } from '@/components/ui';
import { Colors } from '@/theme';
import { NavigationAction } from '@/navigation/types';

interface Props {
    dispatch: React.Dispatch<NavigationAction>;
    stepCount?: number;      // Number of dots (optional, default 6)
    activeStep?: number;     // 1-based active dot index (optional, default 4)
}

type Phase = 'ready' | 'scanning' | 'done' | 'error';

const ICCID_REGEX = /^89\d{17,18}$/;

function passesLuhnCheck(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function isValidIccid(digits: string): boolean {
  return ICCID_REGEX.test(digits) && passesLuhnCheck(digits);
}

function formatDigits(raw: string, group: number[]): string {
  const d = raw.replace(/\D/g, '');
  const out: string[] = [];
  let i = 0;
  for (const size of group) {
    if (i >= d.length) break;
    out.push(d.slice(i, i + size));
    i += size;
  }
  if (i < d.length) out.push(d.slice(i));
  return out.join(' ');
}

/* ─── L-shaped corner bracket ─── */
function CornerBracket({
  color,
  position,
}: {
    color: string;
    position: 'tl' | 'tr' | 'bl' | 'br';
}) {
  const isTop = position.startsWith('t');
  const isLeft = position.endsWith('l');
  return (
    <View
      style={[
        styles.cornerBracket,
        {
          borderColor: color,
          borderTopWidth: isTop ? 3.8 : 0,
          borderBottomWidth: !isTop ? 3.8 : 0,
          borderLeftWidth: isLeft ? 3.8 : 0,
          borderRightWidth: !isLeft ? 3.8 : 0,
          top: isTop ? 10 : undefined,
          bottom: !isTop ? 10 : undefined,
          left: isLeft ? 10 : undefined,
          right: !isLeft ? 10 : undefined,
          borderTopLeftRadius: isTop && isLeft ? 4 : 0,
          borderTopRightRadius: isTop && !isLeft ? 4 : 0,
          borderBottomLeftRadius: !isTop && isLeft ? 4 : 0,
          borderBottomRightRadius: !isTop && !isLeft ? 4 : 0,
        },
      ]}
      pointerEvents="none"
    />
  );
}

/* ─── Fake barcode bars (decorative) ─── */
function DecorativeBars() {
  return (
    <View style={styles.barsRow}>
      {Array.from({ length: 34 }).map((_, i) => {
        const r = ((i * 9301 + 49297) % 233280) / 233280;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: 32 + r * 30,
              backgroundColor: `rgba(255,255,255,${0.16 + r * 0.24})`,
              borderRadius: 1,
              marginHorizontal: 1.5,
            }}
          />
        );
      })}
    </View>
  );
}

/* ─── Checklist chip ─── */
function Chip({ label, tone }: { label: string; tone: 'good' | 'warn' | 'idle' }) {
  const map = {
    good: { bg: '#E4F5EA', fg: '#1F7A4C', bd: '#C4E7D2' },
    warn: { bg: '#FEF3F1', fg: '#A8382C', bd: '#F3C9C3' },
    idle: { bg: '#FFFFFF', fg: '#6B6559', bd: '#ECE8DF' },
  }[tone];

  return (
    <View
      style={{
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: map.bg,
        borderWidth: 1,
        borderColor: map.bd,
      }}
    >
      <Typography
        variant="caption"
        style={{ color: map.fg, fontWeight: '600', fontSize: 12.5 }}
      >
        {label}
      </Typography>
    </View>
  );
}

export default function SimBarcodeScanScreen({
  dispatch,
  stepCount = 6,
  activeStep = 4,
}: Props) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [torch, setTorch] = useState(false);
  const [iccid, setIcid] = useState('');
  const [banner, setBanner] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  const phaseRef = useRef(phase);
  const hasHandledScanRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* ── Permission ── */
  const hasRequestedRef = useRef(false);
  useEffect(() => {
    if (!hasRequestedRef.current && permission && !permission.granted) {
      hasRequestedRef.current = true;
      requestPermission();
    }
  }, [permission, requestPermission]);

  /* ── Animations ── */
  const [sweepAnim] = useState(() => new Animated.Value(-72));
  const [pulseAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (phase !== 'scanning') {
      sweepAnim.setValue(-72);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(sweepAnim, {
          toValue: 72,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(sweepAnim, {
          toValue: -72,
          duration: 1400,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [phase, sweepAnim]);

  useEffect(() => {
    if (phase !== 'scanning') {
      pulseAnim.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.25,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [phase, pulseAnim]);

  /* ── Barcode handler ── */
  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (phaseRef.current !== 'scanning' || hasHandledScanRef.current) return;
      hasHandledScanRef.current = true;

      const digits = data.replace(/\D/g, '');
      if (!isValidIccid(digits)) {
        setPhase('error');
        setBanner(
          'Invalid SIM serial number detected. Please scan the barcode on your new SIM card.',
        );
        return;
      }

      setIcid(formatDigits(digits, [4, 4, 4, 4, 4]));
      setPhase('done');
    },
    [],
  );

  /* ── Actions ── */
  const startScanning = useCallback(() => {
    hasHandledScanRef.current = false;
    setIcid(''); // clear previous value
    setBanner('');
    setPhase('scanning');
  }, []);

  const tryAgain = useCallback(() => {
    hasHandledScanRef.current = false;
    setIcid('');
    setBanner('');
    setPhase('scanning');
  }, []);

  const confirmSim = useCallback(() => {
    dispatch({
      type: 'NAVIGATE',
      payload: {
        screen: 'SimSwapDetails',
        params: { scannedIcid: iccid },
      },
    });
  }, [dispatch, iccid]);

  const enterManually = useCallback(() => dispatch({ type: 'GO_BACK' }), [dispatch]);
  const dismissBanner = useCallback(() => setBanner(''), []);
  const toggleTorch = useCallback(() => setTorch((t) => !t), []);

  /* ── Derived UI ── */
  const scanning = phase === 'scanning';
  const done = phase === 'done';
  const err = phase === 'error';

  const accent = err ? '#E0574A' : done ? '#2FA96B' : Colors.primary;
  const dotColor = err ? '#E0574A' : done ? '#2FA96B' : '#FF4D3D';

  const liveLabel = done
    ? 'Barcode read'
    : err
      ? 'Paused'
      : scanning
        ? 'Scanning'
        : 'Camera ready';

  const statusTitle = scanning
    ? 'Hold steady'
    : done
      ? 'Barcode captured'
      : err
        ? 'Let us try that again'
        : 'Scan the barcode';

  const statusHint = scanning
    ? 'Reading the SIM serial number'
    : done
      ? 'Serial number matched to a new SIM'
      : err
        ? 'Barcode not detected'
        : 'Avoid glare and keep the card flat';

  const statusHintColor = err ? '#C0362C' : done ? '#1F7A4C' : '#7A746A';

  const ctaLabel = scanning
    ? 'Scanning…'
    : err
      ? 'Try again'
      : done
        ? 'Use this SIM'
        : 'Start scanning';

  const handlePrimaryAction = useCallback(() => {
    if (scanning) return;
    if (done) return confirmSim();
    if (err) return tryAgain();
    return startScanning();
  }, [scanning, done, err, confirmSim, tryAgain, startScanning]);

  if (!permission?.granted) {
    return (
      <SafeAreaView
        style={[
          styles.shell,
          { justifyContent: 'center', alignItems: 'center', gap: 16 },
        ]}
      >
        <StatusBar style="dark" />
        <Typography variant="body" style={{ textAlign: 'center', paddingHorizontal: 32 }}>
                    Camera access is required to scan the SIM barcode.
        </Typography>
        <Button variant="primary" onPress={requestPermission}>
                    Grant Permission
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />

      <View style={styles.patternTop} />
      <View style={styles.patternBottom} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={enterManually}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && { borderColor: Colors.primary, backgroundColor: '#FFFCF2' },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>

        <Typography variant="body" style={{ fontWeight: '700', fontSize: 15.5 }}>
                    Scan SIM Barcode
        </Typography>

        <Pressable
          onPress={toggleTorch}
          style={({ pressed }) => [
            styles.iconButton,
            {
              borderColor: torch ? Colors.primary : '#EFEBE1',
              backgroundColor: torch ? '#FFF7DB' : '#FFFFFF',
            },
            pressed && { borderColor: Colors.primary, backgroundColor: '#FFFCF2' },
          ]}
          accessibilityRole="button"
          accessibilityLabel={torch ? 'Turn off flashlight' : 'Turn on flashlight'}
        >
          <Ionicons
            name={torch ? 'flashlight' : 'flashlight-outline'}
            size={18}
            color={Colors.text}
          />
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces
      >
        {/* Title */}
        <View style={styles.titleBlock}>
          <View style={styles.accentLine} />
          <View style={{ flex: 1 }}>
            <Typography
              variant="h1"
              align="left"
              style={{ fontWeight: '800', fontSize: 22, lineHeight: 27 }}
            >
                            Scan the barcode on your new SIM
            </Typography>
            <Typography
              variant="body"
              color="textSecondary"
              style={{ marginTop: 8, lineHeight: 20, fontSize: 13.5 }}
            >
                            Line the barcode up inside the frame.
            </Typography>
          </View>
        </View>

        {/* Viewport */}
        <View
          style={[
            styles.viewport,
            scanning && styles.viewportScanning,
            done && styles.viewportDone,
            err && styles.viewportError,
          ]}
        >
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{
              barcodeTypes: ['code128', 'code39', 'ean13', 'itf14'],
            }}
            onBarcodeScanned={handleBarCodeScanned}
          />

          {/* Glow overlay */}
          <View
            style={[
              styles.glowOverlay,
              { backgroundColor: `rgba(255,203,5,${torch ? 0.26 : 0.11})` },
            ]}
            pointerEvents="none"
          />

          {/* Dashed frame */}
          <View style={styles.dashedFrame} pointerEvents="none">
            {phase !== 'done' && <DecorativeBars />}
            <Typography variant="caption" style={styles.ghostText}>
                            8901 4103 2111 1851 0720
            </Typography>
          </View>

          {/* Sweep line */}
          {scanning && (
            <Animated.View
              style={[
                styles.sweepLine,
                { transform: [{ translateY: sweepAnim }] },
              ]}
              pointerEvents="none"
            />
          )}

          {/* Corners */}
          <CornerBracket color={accent} position="tl" />
          <CornerBracket color={accent} position="tr" />
          <CornerBracket color={accent} position="bl" />
          <CornerBracket color={accent} position="br" />

          {/* Live badge */}
          <View style={styles.liveBadge} pointerEvents="none">
            <Animated.View
              style={[
                styles.liveDot,
                {
                  backgroundColor: dotColor,
                  opacity: scanning ? pulseAnim : 1,
                },
              ]}
            />
            <Typography
              variant="caption"
              style={[
                styles.liveLabel,
                { color: err ? '#FFB4AB' : '#FFFFFF' },
              ]}
            >
              {liveLabel}
            </Typography>
          </View>
        </View>

        {/* Status */}
        <View style={styles.statusBlock}>
          <Typography
            variant="body"
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: Colors.text,
              letterSpacing: -0.3,
            }}
          >
            {statusTitle}
          </Typography>
          <Typography
            variant="caption"
            style={{
              fontSize: 13.5,
              fontWeight: '600',
              textAlign: 'center',
              color: statusHintColor,
            }}
          >
            {statusHint}
          </Typography>
        </View>

        {/* Success card */}
        {done && (
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Typography
                variant="caption"
                style={{ fontWeight: '600', color: '#57806A', fontSize: 12 }}
              >
                                SIM serial number (ICCID)
              </Typography>
              <Typography
                variant="body"
                style={{
                  fontSize: 15.5,
                  fontWeight: '800',
                  color: '#1B7A4B',
                  letterSpacing: 0.5,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {iccid}
              </Typography>
            </View>
          </View>
        )}

        {/* Chips */}
        {!done && !banner && (
          <View style={styles.chipsRow}>
            <Chip label="Card flat" tone={err ? 'warn' : 'idle'} />
            <Chip label="No glare" tone="idle" />
            <Chip label="Barcode inside frame" tone="idle" />
          </View>
        )}

        {/* Error banner */}
        {!!banner && (
          <View
            style={styles.banner}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <View style={styles.bannerIcon}>
              <Ionicons name="alert-circle" size={16} color="#C0362C" />
            </View>
            <Typography
              variant="caption"
              style={{
                flex: 1,
                lineHeight: 20,
                fontWeight: '600',
                color: '#7A2820',
                fontSize: 13,
              }}
            >
              {banner}
            </Typography>
            <Pressable
              onPress={dismissBanner}
              style={styles.bannerClose}
              accessibilityRole="button"
              accessibilityLabel="Dismiss error message"
            >
              <Ionicons name="close" size={16} color="#7A2820" />
            </Pressable>
          </View>
        )}

        <View style={{ flex: 1 }} />

        {/* CTAs */}
        <View style={styles.ctaBlock}>
          <Button
            variant="primary"
            onPress={handlePrimaryAction}
            disabled={scanning}
            style={[
              styles.primaryBtn,
              !scanning && { backgroundColor: Colors.primary },
              scanning && { backgroundColor: '#F5EFDC' },
            ]}
          >
            {ctaLabel}
          </Button>

          <Button
            variant="outline"
            onPress={enterManually}
            style={styles.secondaryBtn}
          >
                        Enter number manually
          </Button>
        </View>

        {/* Dots */}
        <View style={styles.dotsContainer}>
          {Array.from({ length: stepCount }).map((_, i) => {
            const active = i === (activeStep - 1); // Configurable 1-based index
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  active ? styles.dotActive : styles.dotInactive,
                ]}
              />
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#FFFDF9' },
  patternTop: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 210,
    height: 210,
    backgroundColor: 'rgba(255,203,5,0.05)',
    opacity: 0.5,
  },
  patternBottom: {
    position: 'absolute',
    bottom: -80,
    left: -60,
    width: 320,
    height: 320,
    backgroundColor: 'rgba(255,203,5,0.15)',
    borderRadius: 160,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 6,
    zIndex: 10,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentScroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 16,
  },
  titleBlock: {
    flexDirection: 'row',
    gap: 13,
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  accentLine: {
    width: 4,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 6,
    height: 32,
  },
  viewport: {
    position: 'relative',
    width: '100%',
    height: 196,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#121110',
  },
  viewportScanning: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 4,
  },
  viewportDone: {
    shadowColor: '#2FA96B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 4,
  },
  viewportError: {
    shadowColor: '#E0574A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 4,
  },
  glowOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dashedFrame: {
    position: 'absolute',
    left: 26,
    right: 26,
    top: 34,
    bottom: 34,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.26)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 62,
    width: '100%',
  },
  ghostText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.4,
    color: 'rgba(255,255,255,0.42)',
    textAlign: 'center',
  },
  sweepLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 2,
    backgroundColor: Colors.primary,
    opacity: 0.95,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 8,
  },
  cornerBracket: {
    position: 'absolute',
    width: 26,
    height: 26,
    backgroundColor: 'transparent',
  },
  liveBadge: {
    position: 'absolute',
    left: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(18,16,13,0.72)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  liveLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statusBlock: {
    alignItems: 'center',
    gap: 7,
    marginTop: 24,
  },
  successCard: {
    alignSelf: 'stretch',
    marginTop: 18,
    borderWidth: 1.5,
    borderColor: '#C4E7D2',
    borderRadius: 18,
    backgroundColor: '#F3FBF6',
    paddingVertical: 15,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  successIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2FA96B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  banner: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#F3C9C3',
    borderRadius: 16,
    backgroundColor: '#FEF3F1',
    padding: 13,
    alignSelf: 'stretch',
  },
  bannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#FBE3E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerClose: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBlock: {
    gap: 10,
    alignSelf: 'stretch',
    marginTop: 'auto',
  },
  primaryBtn: {
    height: 54,
    borderRadius: 27,
    borderWidth: 0,
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  secondaryBtn: {
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surface,
    fontSize: 16.5,
    fontWeight: '600',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 18,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
  dotActive: {
    width: 22,
    backgroundColor: Colors.primary,
  },
  dotInactive: {
    width: 7,
    backgroundColor: '#E2DFD7',
  },
});