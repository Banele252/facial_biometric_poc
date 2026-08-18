import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Typography } from '@/components/ui';

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: any) => void;
}

const STEP = 3;
const TOTAL_STEPS = 5;
const ACCENT = '#FFCB05';

const CUES = [
  { key: 'blink', label: 'Blink', head: 'Blink slowly', sub: 'Close and open your eyes once.', ms: 2100 },
  { key: 'turn', label: 'Turn left', head: 'Turn your head left', sub: 'Slowly — keep your face inside the frame.', ms: 2100 },
  { key: 'smile', label: 'Smile', head: 'Now smile', sub: 'A natural smile is all we need.', ms: 2000 },
];
const SCAN_MS = 2800;

type Stage = 'idle' | 'scanning' | 'liveness' | 'passed';

export default function FaceCheckScreen({ navigate, goBack, dispatch }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [pct, setPct] = useState(0);
  const [step, setStep] = useState(0);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [camError, setCamError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sweepAnim = useRef(new Animated.Value(-38)).current;
  const glowPulse = useRef(new Animated.Value(0.4)).current;
  const avatarBounce = useRef(new Animated.Value(0)).current;
  const eyeBlink = useRef(new Animated.Value(1)).current;
  const mouthSmile = useRef(new Animated.Value(1)).current;

  /* ─── cleanup ─── */
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  /* ─── sweep animation ─── */
  useEffect(() => {
    if (stage !== 'scanning') {
      sweepAnim.setValue(-38);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(sweepAnim, { toValue: 38, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sweepAnim, { toValue: -38, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [stage, sweepAnim]);

  /* ─── glow pulse ─── */
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 0.8, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0.4, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [glowPulse]);

  /* ─── avatar animations ─── */
  useEffect(() => {
    if (stage === 'liveness' && step === 1) {
      // nod left
      Animated.loop(
        Animated.sequence([
          Animated.timing(avatarBounce, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(avatarBounce, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ).start();
    } else {
      avatarBounce.setValue(0);
    }

    if (stage === 'liveness' && step === 0) {
      // blink
      Animated.loop(
        Animated.sequence([
          Animated.timing(eyeBlink, { toValue: 0.08, duration: 150, easing: Easing.easeInOut, useNativeDriver: true }),
          Animated.timing(eyeBlink, { toValue: 1, duration: 150, easing: Easing.easeInOut, useNativeDriver: true }),
          Animated.delay(1300),
        ]),
      ).start();
    } else {
      eyeBlink.setValue(1);
    }

    if (stage === 'liveness' && step === 2) {
      // smile
      Animated.loop(
        Animated.sequence([
          Animated.timing(mouthSmile, { toValue: 1.5, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(mouthSmile, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ).start();
    } else {
      mouthSmile.setValue(1);
    }
  }, [stage, step, avatarBounce, eyeBlink, mouthSmile]);

  /* ─── run sequence ─── */
  const run = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    if (tickRef.current) clearInterval(tickRef.current);

    setStage('scanning');
    setPct(0);
    setStep(0);

    const t0 = Date.now();
    tickRef.current = setInterval(() => {
      const p = Math.min(100, Math.round((Date.now() - t0) / SCAN_MS * 100));
      setPct(p);
      if (p >= 100 && tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }, 60);

    let t = SCAN_MS + 350;
    timersRef.current.push(setTimeout(() => setStage('liveness'), t));

    CUES.forEach((c, i) => {
      t += c.ms;
      timersRef.current.push(setTimeout(() => {
        if (i === CUES.length - 1) {
          setStage('passed');
          setStep(CUES.length);
        } else {
          setStep(i + 1);
        }
      }, t));
    });
  }, []);

  /* ─── camera ─── */
  const startCam = useCallback(async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        setCamError('Camera access was blocked. Allow it in your settings to continue.');
        return false;
      }
    }
    return true;
  }, [permission, requestPermission]);

  const handlePrimary = useCallback(async () => {
    if (stage === 'idle') {
      const ok = await startCam();
      if (!ok) return;
      run();
      return;
    }
    if (stage === 'passed') {
      if (navigate) navigate('ScanSimScreen');
      else if (dispatch) dispatch({ type: 'NAVIGATE', payload: { screen: 'ScanSimScreen' } });
    }
  }, [stage, startCam, run, navigate, dispatch]);

  const handleSecondary = useCallback(() => {
    if (stage === 'idle') {
      if (goBack) goBack();
      else if (dispatch) dispatch({ type: 'GO_BACK' });
      return;
    }
    timersRef.current.forEach(clearTimeout);
    if (tickRef.current) clearInterval(tickRef.current);
    setStage('idle');
    setPct(0);
    setStep(0);
    setCamError('');
  }, [stage, goBack, dispatch]);

  const handleBack = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    if (tickRef.current) clearInterval(tickRef.current);
    if (goBack) goBack();
    else if (dispatch) dispatch({ type: 'GO_BACK' });
  }, [goBack, dispatch]);

  /* ─── derived ─── */
  const idle = stage === 'idle';
  const scanning = stage === 'scanning';
  const liveness = stage === 'liveness';
  const passed = stage === 'passed';
  const running = scanning || liveness;
  const cue = CUES[Math.min(step, CUES.length - 1)];

  const livePct = passed ? 100 : liveness ? Math.round(step / CUES.length * 100) : 0;
  const overall = passed ? 100 : scanning ? Math.round(pct * 0.5) : liveness ? 50 + Math.round(livePct * 0.5) : 0;

  const bracketColor = passed ? ACCENT : running ? '#F5C000' : '#DEDEE4';
  const faceFill = passed ? '#FFE9A8' : '#E4E4EB';
  const featureFill = passed ? '#B08800' : '#8A8A94';
  const stageTint = passed ? '#FFF8E6' : '#FBFBFD';

  const stepBars = Array.from({ length: TOTAL_STEPS }, (_, n) => ({
    bg: n === STEP ? ACCENT : n < STEP ? 'rgba(255,203,5,0.55)' : '#DEDEE4',
  }));

  const ctaText = passed
    ? 'Continue'
    : scanning
      ? 'Scanning your face…'
      : liveness
        ? 'Follow the prompts…'
        : camError
          ? 'Try camera again'
          : 'Scan';

  const secondaryText = idle ? 'Back to ID scan' : passed ? 'Run check again' : 'Cancel check';

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="dark-content" backgroundColor="#EFEFF2" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={22} color="#111114" />
            </TouchableOpacity>
            <View style={styles.logoPill}>
              <View style={styles.logoMtn}>
                <Typography variant="caption" style={styles.logoMtnText}>MTN</Typography>
              </View>
              <Typography variant="body" style={styles.logoTrust}>trust</Typography>
            </View>
          </View>
          <TouchableOpacity style={styles.langButton} activeOpacity={0.7}>
            <Typography variant="caption" style={styles.langText}>EN</Typography>
            <Ionicons name="chevron-down" size={12} color="#6E6E78" />
          </TouchableOpacity>
        </View>

        {/* Step Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Typography variant="body" style={styles.cardTitle}>Face check</Typography>
            <Typography variant="caption" style={styles.cardStep}>Step 4 of 5</Typography>
          </View>
          <View style={styles.stepBars}>
            {stepBars.map((s, i) => (
              <View key={i} style={[styles.stepBar, { backgroundColor: s.bg }]} />
            ))}
          </View>
          <Typography variant="caption" style={styles.cardSub}>
            {passed
              ? 'Face matched and liveness confirmed. One step left before your swap is authorised.'
              : 'Two parts, one go: we scan your face against your ID photo, then three quick prompts prove a real person is holding the phone.'}
          </Typography>
        </View>

        {/* Camera / Avatar Card */}
        <View style={[styles.camCard, { backgroundColor: stageTint }]}>
          <Animated.View style={[styles.camGlow, { opacity: glowPulse }]} />

          <View style={styles.viewport}>
            {/* Corner brackets */}
            <View style={[styles.bracket, styles.bracketTL, { borderColor: bracketColor }]} />
            <View style={[styles.bracket, styles.bracketTR, { borderColor: bracketColor }]} />
            <View style={[styles.bracket, styles.bracketBL, { borderColor: bracketColor }]} />
            <View style={[styles.bracket, styles.bracketBR, { borderColor: bracketColor }]} />

            {/* Face guide oval */}
            <View style={[styles.faceOval, { borderColor: running ? 'rgba(255,255,255,0.85)' : '#D8D8E0' }]} />

            {/* Live camera */}
            {running && permission?.granted && (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="front"
                style={styles.cameraFeed}
              />
            )}

            {/* Avatar (when camera off) */}
            {!running && (
              <Animated.View
                style={[
                  styles.avatar,
                  { backgroundColor: faceFill },
                  { transform: [{ translateX: avatarBounce.interpolate({ inputRange: [0, 1], outputRange: [0, -15] }) }, { rotate: avatarBounce.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-8deg'] }) }] },
                ]}
              >
                <Animated.View style={[styles.eye, styles.eyeLeft, { backgroundColor: featureFill, transform: [{ scaleY: eyeBlink }] }]} />
                <Animated.View style={[styles.eye, styles.eyeRight, { backgroundColor: featureFill, transform: [{ scaleY: eyeBlink }] }]} />
                <Animated.View style={[styles.mouth, { backgroundColor: featureFill, transform: [{ scaleY: mouthSmile }] }]} />
              </Animated.View>
            )}

            {/* Sweep line */}
            {scanning && (
              <Animated.View style={[styles.sweepLine, { transform: [{ translateY: sweepAnim.interpolate({ inputRange: [-38, 38], outputRange: ['-38%', '38%'] }) }] }]} />
            )}

            {/* Bottom overlay */}
            <View style={styles.viewportOverlay}>
              <Typography variant="caption" style={[styles.phaseLabel, { color: running || passed ? '#8A6A00' : '#9A9AA4' }]}>
                {passed ? 'Verified' : scanning ? 'Scanning face' : liveness ? `Liveness · ${cue.label}` : 'Camera off'}
              </Typography>
              <Typography variant="body" style={styles.pctText}>{overall}%</Typography>
            </View>

            {/* Passed checkmark */}
            {passed && (
              <View style={styles.passedBadge}>
                <Ionicons name="checkmark" size={20} color="#111114" />
              </View>
            )}
          </View>

          {/* Status text */}
          <View style={styles.statusRow}>
            {running && (
              <View style={styles.miniSpinner}>
                <View style={styles.miniSpinnerInner} />
              </View>
            )}
            <Typography variant="h2" style={styles.statusTitle}>
              {passed ? "You're verified" : scanning ? 'Hold still…' : liveness ? cue.head : 'Ready when you are'}
            </Typography>
          </View>
          <Typography variant="caption" style={styles.statusBody}>
            {passed
              ? 'Clear match to your ID photo, and a real person was detected.'
              : scanning
                ? 'Look straight at the camera while we match your ID photo.'
                : liveness
                  ? cue.sub
                  : camError
                    ? camError
                    : 'Face scan first, then liveness — about nine seconds in total.'}
          </Typography>

          {/* Camera error banner */}
          {!!camError && idle && (
            <View style={styles.errorBanner}>
              <View style={styles.errorIcon}>
                <Typography variant="caption" style={styles.errorIconText}>!</Typography>
              </View>
              <View style={{ flex: 1 }}>
                <Typography variant="body" style={styles.errorTitle}>Camera not available</Typography>
                <Typography variant="caption" style={styles.errorSub}>{camError}</Typography>
              </View>
            </View>
          )}

          {/* Phase cards */}
          <View style={styles.phasesRow}>
            {/* Face scan phase */}
            <View style={[styles.phaseCard, { backgroundColor: scanning ? '#FFFCF0' : '#FFFFFF', borderColor: scanning ? '#F2DC8E' : '#EFEFF3' }]}>
              <View style={styles.phaseCardHeader}>
                <View style={[styles.phaseDot, { backgroundColor: scanning || idle ? '#FFFFFF' : ACCENT, borderColor: scanning ? '#F2DC8E' : idle ? '#E2E2E9' : ACCENT }]}>
                  <Typography variant="caption" style={{ fontSize: 10.5, fontWeight: '800', color: '#111114' }}>
                    {scanning || idle ? '1' : '✓'}
                  </Typography>
                </View>
                <Typography variant="body" style={[styles.phaseCardTitle, { color: idle ? '#6E6E78' : '#111114' }]}>Face scan</Typography>
              </View>
              <View style={styles.phaseBarTrack}>
                <View style={[styles.phaseBarFill, { width: `${scanning ? pct : idle ? 0 : 100}%`, backgroundColor: ACCENT }]} />
              </View>
              <Typography variant="caption" style={[styles.phaseMeta, { color: scanning || idle ? '#8A8A94' : '#8A6A00' }]}>
                {idle ? 'Matched to your ID photo' : scanning ? `${pct}% · matching` : 'Matched'}
              </Typography>
            </View>

            {/* Liveness phase */}
            <View style={[styles.phaseCard, { backgroundColor: liveness ? '#FFFCF0' : '#FFFFFF', borderColor: liveness ? '#F2DC8E' : '#EFEFF3' }]}>
              <View style={styles.phaseCardHeader}>
                <View style={[styles.phaseDot, { backgroundColor: passed ? ACCENT : '#FFFFFF', borderColor: liveness ? '#F2DC8E' : passed ? ACCENT : '#E2E2E9' }]}>
                  <Typography variant="caption" style={{ fontSize: 10.5, fontWeight: '800', color: '#111114' }}>
                    {passed ? '✓' : '2'}
                  </Typography>
                </View>
                <Typography variant="body" style={[styles.phaseCardTitle, { color: liveness || passed ? '#111114' : '#6E6E78' }]}>Liveness</Typography>
              </View>
              <View style={styles.phaseBarTrack}>
                <View style={[styles.phaseBarFill, { width: `${livePct}%`, backgroundColor: ACCENT }]} />
              </View>
              <Typography variant="caption" style={[styles.phaseMeta, { color: passed ? '#8A6A00' : '#8A8A94' }]}>
                {passed ? 'Real person confirmed' : liveness ? `${step} of 3 prompts done` : '3 quick prompts'}
              </Typography>
            </View>
          </View>

          {/* CTA */}
          <View style={styles.ctaWrap}>
            <TouchableOpacity
              onPress={handlePrimary}
              activeOpacity={running ? 1 : 0.9}
              style={[styles.ctaButton, { backgroundColor: running ? '#EFEFF4' : ACCENT }]}
              disabled={running}
            >
              <View style={styles.ctaInner}>
                {idle && !camError && (
                  <View style={styles.scanIcon}>
                    <View style={styles.scanIconTL} />
                    <View style={styles.scanIconTR} />
                    <View style={styles.scanIconBL} />
                    <View style={styles.scanIconBR} />
                    <View style={styles.scanIconMid} />
                  </View>
                )}
                <Typography variant="body" style={[styles.ctaText, { color: running ? '#A2A2AC' : '#111114' }]}>
                  {ctaText}
                </Typography>
                {passed && <Typography variant="body" style={styles.ctaArrow}>→</Typography>}
              </View>
              {running && <View style={styles.ctaProgress} />}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSecondary} style={styles.secondaryBtn} activeOpacity={0.7}>
              <Typography variant="caption" style={styles.secondaryText}>{secondaryText}</Typography>
            </TouchableOpacity>

            <Typography variant="caption" style={styles.footHint}>
              {passed ? 'Next: scan your new SIM' : running ? 'Keep your face inside the frame' : 'Your camera stays on this device — nothing is saved until the check passes'}
            </Typography>
          </View>
        </View>

        {/* Tips Accordion */}
        <View style={styles.tipsCard}>
          <TouchableOpacity onPress={() => setTipsOpen((v) => !v)} style={styles.tipsHeader} activeOpacity={0.8}>
            <View style={[styles.iconBox, { backgroundColor: tipsOpen ? '#FFF3C9' : '#F4F4F7' }]}>
              <Typography variant="body" style={styles.iconGlyph}>☀</Typography>
            </View>
            <View style={{ flex: 1 }}>
              <Typography variant="body" style={styles.tipsTitle}>Pass on the first try</Typography>
              <Typography variant="caption" style={styles.tipsSub}>Three things that make a check pass</Typography>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9A9AA4" style={{ transform: [{ rotate: tipsOpen ? '90deg' : '0deg' }] }} />
          </TouchableOpacity>
          {tipsOpen && (
            <View style={styles.tipsBody}>
              {[
                'Hold the phone at eye level in even light — avoid strong backlight.',
                'Remove sunglasses, hats and face coverings.',
                'Move slowly and follow each prompt as it appears.',
              ].map((t, i) => (
                <View key={i} style={styles.tipLine}>
                  <View style={styles.tipBullet}>
                    <Typography variant="caption" style={styles.tipBulletText}>✓</Typography>
                  </View>
                  <Typography variant="caption" style={styles.tipLineText}>{t}</Typography>
                </View>
              ))}
            </View>
          )}
        </View>

        <Typography variant="caption" style={styles.footer}>
          Encrypted · POPIA compliant · Your face scan is never shared
        </Typography>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#EFEFF2' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 10, paddingBottom: 24 },

  /* top bar */
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingTop: 4 },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#EFEFF3', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#111114', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 },
  logoPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12, paddingLeft: 6 },
  logoMtn: { width: 52, height: 27, borderRadius: 13, borderWidth: 2.5, borderColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  logoMtnText: { fontSize: 12.5, fontWeight: '800', color: ACCENT },
  logoTrust: { fontSize: 16, fontWeight: '800', letterSpacing: -0.32, color: '#fff', marginLeft: 9 },
  langButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6 },
  langText: { fontSize: 12.5, fontWeight: '700', color: '#6E6E78' },

  /* cards */
  card: { borderRadius: 20, padding: 16, paddingHorizontal: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEFF3', shadowColor: '#111114', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 22, elevation: 2, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.32, color: '#111114' },
  cardStep: { fontSize: 12, fontWeight: '700', color: '#6E6E78' },
  stepBars: { flexDirection: 'row', gap: 6, marginTop: 12 },
  stepBar: { flex: 1, height: 4, borderRadius: 2 },
  cardSub: { marginTop: 12, fontSize: 13, lineHeight: 19.5, color: '#5A5A64' },

  /* cam card */
  camCard: { borderRadius: 20, padding: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEFF3', shadowColor: '#111114', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.06, shadowRadius: 26, elevation: 4, marginBottom: 12, alignItems: 'center', overflow: 'hidden' },
  camGlow: { position: 'absolute', left: '50%', top: '12%', width: 220, height: 160, marginLeft: -110, backgroundColor: 'rgba(255,203,5,0.28)', borderRadius: 110, transform: [{ scale: 1.2 }], zIndex: 0 },

  /* viewport */
  viewport: { position: 'relative', width: '100%', maxWidth: 278, aspectRatio: 0.92, borderRadius: 26, backgroundColor: '#F7F7FA', borderWidth: 1, borderColor: '#E7E7EE', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  bracket: { position: 'absolute', width: 34, height: 34, backgroundColor: 'transparent' },
  bracketTL: { left: 14, top: 14, borderLeftWidth: 3, borderTopWidth: 3, borderRadius: 12 },
  bracketTR: { right: 14, top: 14, borderRightWidth: 3, borderTopWidth: 3, borderRadius: 12 },
  bracketBL: { left: 14, bottom: 14, borderLeftWidth: 3, borderBottomWidth: 3, borderRadius: 12 },
  bracketBR: { right: 14, bottom: 14, borderRightWidth: 3, borderBottomWidth: 3, borderRadius: 12 },
  faceOval: { position: 'absolute', width: '62%', aspectRatio: 0.82, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', zIndex: 2 },
  cameraFeed: { position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 },

  /* avatar */
  avatar: { position: 'relative', zIndex: 3, width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  eye: { position: 'absolute', width: 14, height: 9, borderRadius: 9 },
  eyeLeft: { top: 34, left: 22 },
  eyeRight: { top: 34, right: 22 },
  mouth: { position: 'absolute', bottom: 21, width: 36, height: 11, borderRadius: 18 },

  /* sweep */
  sweepLine: { position: 'absolute', left: 10, right: 10, height: 3, backgroundColor: '#F5C000', shadowColor: '#FFCB05', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 8, zIndex: 4 },

  /* overlay */
  viewportOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', backgroundColor: 'rgba(247,247,250,0)' },
  phaseLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.46, textTransform: 'uppercase' },
  pctText: { fontSize: 30, fontWeight: '800', letterSpacing: -1.2, lineHeight: 27, color: '#111114' },
  passedBadge: { position: 'absolute', right: 16, top: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: ACCENT, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: 'rgba(190,140,0,0.8)', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 18, elevation: 6, zIndex: 5 },

  /* status */
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18, zIndex: 1 },
  statusTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.63, color: '#111114' },
  statusBody: { marginTop: 8, fontSize: 13, lineHeight: 19.5, color: '#5A5A64', textAlign: 'center', maxWidth: 280, zIndex: 1 },

  /* error */
  errorBanner: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 14, padding: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: '#FFF7DA', borderWidth: 1, borderColor: '#F2DC8E', zIndex: 1 },
  errorIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  errorIconText: { fontSize: 12, fontWeight: '800', color: '#111114' },
  errorTitle: { fontSize: 12.5, fontWeight: '800', color: '#111114' },
  errorSub: { fontSize: 12, lineHeight: 17, color: '#6E6E78', marginTop: 3 },

  /* phases */
  phasesRow: { flexDirection: 'row', gap: 10, marginTop: 18, width: '100%', zIndex: 1 },
  phaseCard: { flex: 1, minWidth: 0, borderRadius: 14, padding: 11, paddingHorizontal: 12, borderWidth: 1 },
  phaseCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phaseDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  phaseCardTitle: { fontSize: 12.5, fontWeight: '800', letterSpacing: -0.125, flex: 1 },
  phaseBarTrack: { marginTop: 9, height: 4, borderRadius: 2, backgroundColor: '#E4E4EA', overflow: 'hidden' },
  phaseBarFill: { height: '100%', borderRadius: 2 },
  phaseMeta: { marginTop: 7, fontSize: 11, fontWeight: '700' },

  /* cta */
  ctaWrap: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#EDEDF1', width: '100%', zIndex: 1 },
  ctaButton: { width: '100%', height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ctaInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  ctaText: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.155 },
  ctaArrow: { fontSize: 16, color: '#111114' },
  ctaProgress: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: 'rgba(17,17,20,0.35)' },
  scanIcon: { position: 'relative', width: 19, height: 19 },
  scanIconTL: { position: 'absolute', left: 0, top: 0, width: 7, height: 7, borderLeftWidth: 2.2, borderTopWidth: 2.2, borderColor: 'currentColor', borderRadius: 2 },
  scanIconTR: { position: 'absolute', right: 0, top: 0, width: 7, height: 7, borderRightWidth: 2.2, borderTopWidth: 2.2, borderColor: 'currentColor', borderRadius: 2 },
  scanIconBL: { position: 'absolute', left: 0, bottom: 0, width: 7, height: 7, borderLeftWidth: 2.2, borderBottomWidth: 2.2, borderColor: 'currentColor', borderRadius: 2 },
  scanIconBR: { position: 'absolute', right: 0, bottom: 0, width: 7, height: 7, borderRightWidth: 2.2, borderBottomWidth: 2.2, borderColor: 'currentColor', borderRadius: 2 },
  scanIconMid: { position: 'absolute', left: 1, right: 1, top: '50%', height: 2.2, marginTop: -1.1, backgroundColor: 'currentColor', borderRadius: 2 },
  secondaryBtn: { width: '100%', height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondaryText: { fontSize: 13.5, fontWeight: '700', color: '#6E6E78' },
  footHint: { textAlign: 'center', fontSize: 11.5, fontWeight: '600', color: '#8A8A94', marginTop: 8 },

  /* tips */
  tipsCard: { borderRadius: 20, padding: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEFF3', shadowColor: '#111114', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 22, elevation: 2, marginBottom: 12 },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  tipsTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.14, color: '#111114' },
  tipsSub: { fontSize: 12.5, color: '#6E6E78', marginTop: 2 },
  tipsBody: { paddingLeft: 51, paddingTop: 12 },
  tipLine: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginBottom: 9 },
  tipBullet: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFF7DA', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  tipBulletText: { fontSize: 10, fontWeight: '800', color: '#8A6A00' },
  tipLineText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: '#5A5A64' },

  /* shared */
  iconBox: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, borderColor: '#EFEFF3', alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { fontSize: 16, color: '#8A6A00' },
  miniSpinner: { width: 17, height: 17, borderRadius: 8.5, borderWidth: 2.5, borderColor: 'rgba(17,17,20,0.14)', borderTopColor: '#8A6A00' },
  miniSpinnerInner: { width: '100%', height: '100%' },
  footer: { textAlign: 'center', fontSize: 11.5, fontWeight: '600', color: '#8A8A94', lineHeight: 17, marginTop: 2 },
});
