import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  TextInput,
  ScrollView,
  Modal,
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

const STEP = 2;
const TOTAL_STEPS = 6;
const ACCENT = '#FFCB05';

/* ─── helpers ─── */
const digits = (v: string) => (v || '').replace(/\D/g, '');
const fmtIccid = (d: string) => ('89' + d).replace(/(.{4})/g, '$1 ').trim();

/* ─── decorative barcode bars ─── */
function DecorativeBars() {
  const widths = [3,1.5,2,4,1.5,3,2,1.5,5,2,1.5,3,4,1.5,2,3,1.5,4,2,1.5,3,5,1.5,2,4,1.5,3,2,1.5,4,3,1.5,2,5,1.5,3,2,4,1.5,2,3,1.5];
  return (
    <View style={styles.barsRow}>
      {widths.map((w, i) => {
        const r = ((i * 9301 + 49297) % 233280) / 233280;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: 32 + r * 30,
              backgroundColor: `rgba(17,17,20,${0.16 + r * 0.24})`,
              borderRadius: 1,
              marginHorizontal: 1.5,
            }}
          />
        );
      })}
    </View>
  );
}

/* ─── corner bracket ─── */
function CornerBracket({ color, position }: { color: string; position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const isTop = position.startsWith('t');
  const isLeft = position.endsWith('l');
  return (
    <View
      style={[
        styles.cornerBracket,
        {
          borderColor: color,
          borderTopWidth: isTop ? 4 : 0,
          borderBottomWidth: !isTop ? 4 : 0,
          borderLeftWidth: isLeft ? 4 : 0,
          borderRightWidth: !isLeft ? 4 : 0,
          top: isTop ? -2 : undefined,
          bottom: !isTop ? -2 : undefined,
          left: isLeft ? -2 : undefined,
          right: !isLeft ? -2 : undefined,
          borderTopLeftRadius: isTop && isLeft ? 12 : 0,
          borderTopRightRadius: isTop && !isLeft ? 12 : 0,
          borderBottomLeftRadius: !isTop && isLeft ? 12 : 0,
          borderBottomRightRadius: !isTop && !isLeft ? 12 : 0,
        },
      ]}
    />
  );
}

export default function ScanSimScreen({ navigate, goBack, dispatch }: Props) {
  const [stage, setStage] = useState<-1 | 0 | 1>(-1); // -1 idle, 0 busy, 1 recognised
  const [submitPhase, setSubmitPhase] = useState<'idle' | 'busy'>('idle');
  const [cam, setCam] = useState<'off' | 'ask' | 'opening' | 'live' | 'locked'>('off');
  const [torch, setTorch] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState('');
  const [manualUsed, setManualUsed] = useState(false);
  const [iccid, setIccid] = useState('8957 0012 3456 7890 123');
  const [permission, requestPermission] = useCameraPermissions();

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const sweepAnim = useRef(new Animated.Value(-72)).current;
  const shutterOpacity = useRef(new Animated.Value(1)).current;
  const glowPulse = useRef(new Animated.Value(0.4)).current;

  /* ─── cleanup ─── */
  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  /* ─── sweep animation ─── */
  useEffect(() => {
    if (stage !== 0) {
      sweepAnim.setValue(-72);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(sweepAnim, { toValue: 72, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sweepAnim, { toValue: -72, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
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

  /* ─── camera flow ─── */
  const openCamera = () => {
    if (!permission?.granted) {
      setCam('ask');
      return;
    }
    startCameraSequence();
  };

  const startCameraSequence = () => {
    setCam('opening');
    shutterOpacity.setValue(1);
    Animated.timing(shutterOpacity, { toValue: 0, duration: 500, easing: Easing.easeOut, useNativeDriver: true }).start();

    timersRef.current.push(setTimeout(() => setCam('live'), 900));
    timersRef.current.push(setTimeout(() => setCam('locked'), 3400));
    timersRef.current.push(setTimeout(() => { setCam('off'); setStage(0); }, 4100));
    timersRef.current.push(setTimeout(() => {
      setStage(1);
      setIccid(manualUsed ? fmtIccid(manual) : '8957 0012 3456 7890 123');
    }, 5800));
  };

  const allowCam = async () => {
    const { granted } = await requestPermission();
    setCam('off');
    if (granted) {
      setTimeout(() => startCameraSequence(), 200);
    } else {
      setManualOpen(true);
    }
  };

  const denyCam = () => {
    timersRef.current.forEach(clearTimeout);
    setCam('off');
    setManualOpen(true);
  };

  const toggleTorch = () => setTorch((t) => !t);

  const rescan = () => {
    timersRef.current.forEach(clearTimeout);
    setStage(-1);
    setCam('off');
    setTorch(false);
    setManualUsed(false);
    setManualOpen(false);
  };

  /* ─── barcode handler ─── */
  const handleBarCode = useCallback(({ data }: { data: string }) => {
    if (stage !== 0) return;
    const d = digits(data);
    if (d.length >= 19) {
      setIccid(fmtIccid(d.slice(2)));
      setStage(1);
      setCam('off');
    }
  }, [stage]);

  /* ─── manual entry ─── */
  const manualValid = manual.length === 17;
  const handleManualChange = (text: string) => setManual(digits(text).slice(0, 17));
  const submitManual = () => {
    if (!manualValid) return;
    timersRef.current.forEach(clearTimeout);
    setStage(1);
    setManualOpen(false);
    setManualUsed(true);
    setIccid(fmtIccid(manual));
  };

  /* ─── primary CTA ─── */
  const handlePrimary = () => {
    if (stage < 1) {
      openCamera();
      return;
    }
    if (submitPhase !== 'idle') return;
    setSubmitPhase('busy');
    timersRef.current.push(setTimeout(() => {
      setSubmitPhase('idle');
      if (navigate) navigate('ReviewScreen');
      else if (dispatch) dispatch({ type: 'NAVIGATE', payload: { screen: 'ReviewScreen' } });
    }, 1250));
  };

  const handleBack = () => {
    if (goBack) goBack();
    else if (dispatch) dispatch({ type: 'GO_BACK' });
  };

  /* ─── derived ─── */
  const idle = stage === -1;
  const busy = stage === 0;
  const recognised = stage >= 1;
  const frameColor = recognised ? ACCENT : '#111114';
  const showManual = manualUsed || manualOpen;

  const stepBars = Array.from({ length: TOTAL_STEPS }, (_, n) => ({
    bg: n === STEP ? ACCENT : n < STEP ? 'rgba(255,203,5,0.55)' : '#DEDEE4',
  }));

  const ctaText = submitPhase === 'busy'
    ? 'Continuing…'
    : recognised
      ? 'Continue'
      : busy
        ? 'Scanning…'
        : 'Start Scan';

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="dark-content" backgroundColor="#EFEFF2" />

      {/* ─── Camera Permission Modal ─── */}
      <Modal visible={cam === 'ask'} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.camIconBg}>
              <View style={styles.camIcon}>
                <View style={styles.camLens} />
              </View>
            </View>
            <Typography variant="h2" style={styles.modalTitle}>Allow camera access?</Typography>
            <Typography variant="caption" style={styles.modalBody}>
              Used only to read the barcode on your new SIM. Nothing is recorded.
            </Typography>
            <TouchableOpacity onPress={allowCam} style={styles.modalPrimary} activeOpacity={0.9}>
              <Typography variant="body" style={styles.modalPrimaryText}>Allow camera</Typography>
            </TouchableOpacity>
            <TouchableOpacity onPress={denyCam} style={styles.modalSecondary} activeOpacity={0.7}>
              <Typography variant="caption" style={styles.modalSecondaryText}>Not now</Typography>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Full-screen Camera ─── */}
      {cam !== 'off' && cam !== 'ask' && permission?.granted && (
        <View style={styles.camFull}>
          <View style={styles.camGradient} />
          <View style={[styles.camTorchWash, { opacity: torch ? 0.22 : 0 }]} />

          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'ean13', 'itf14'] }}
            onBarcodeScanned={handleBarCode}
          />

          {/* Floating barcode card */}
          <View style={styles.floatingCard}>
            <DecorativeBars />
            <Typography variant="caption" style={styles.floatingIccid}>{iccid}</Typography>
          </View>

          {/* Frame brackets */}
          <View style={styles.camFrame}>
            <CornerBracket color={ACCENT} position="tl" />
            <CornerBracket color={ACCENT} position="tr" />
            <CornerBracket color={ACCENT} position="bl" />
            <CornerBracket color={ACCENT} position="br" />
            {cam === 'live' && (
              <Animated.View style={[styles.camSweep, { transform: [{ translateY: sweepAnim }] }]} />
            )}
          </View>

          {/* Top bar */}
          <View style={styles.camTopBar}>
            <TouchableOpacity onPress={denyCam} style={styles.camCancelBtn}>
              <Typography variant="caption" style={styles.camCancelText}>Cancel</Typography>
            </TouchableOpacity>
            <View style={styles.camLiveBadge}>
              <View style={styles.camLiveDot} />
              <Typography variant="caption" style={styles.camLiveText}>Camera</Typography>
            </View>
            <TouchableOpacity onPress={toggleTorch} style={[styles.camFlashBtn, { backgroundColor: torch ? ACCENT : 'rgba(255,255,255,0.14)' }]}>
              <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={18} color={torch ? '#111114' : '#fff'} />
            </TouchableOpacity>
          </View>

          {/* Bottom hint */}
          <View style={styles.camBottom}>
            <Typography variant="body" style={styles.camHintTitle}>
              {cam === 'opening' ? 'Starting camera…' : cam === 'locked' ? 'Barcode captured' : 'Looking for a barcode…'}
            </Typography>
            <Typography variant="caption" style={styles.camHintSub}>
              Line the barcode up inside the yellow frame and hold steady.
            </Typography>
          </View>

          {/* Shutter overlay */}
          {cam === 'opening' && (
            <Animated.View style={[styles.shutter, { opacity: shutterOpacity }]} />
          )}
        </View>
      )}

      {/* ─── Main Content ─── */}
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
            <Typography variant="body" style={styles.cardTitle}>Scan your new SIM</Typography>
            <Typography variant="caption" style={styles.cardStep}>Step 3 of 6</Typography>
          </View>
          <View style={styles.stepBars}>
            {stepBars.map((s, i) => (
              <View key={i} style={[styles.stepBar, { backgroundColor: s.bg }]} />
            ))}
          </View>
          <Typography variant="caption" style={styles.cardSub}>
            Scan the barcode on your new SIM card. We only read the ICCID printed on it.
          </Typography>
        </View>

        {/* Scan Stage Card */}
        <View style={[styles.stageCard, { borderColor: recognised ? '#EFEFF3' : '#EFEFF3' }]}>
          <Animated.View style={[styles.stageGlow, { opacity: glowPulse }]} />

          {/* Frame area */}
          <View style={styles.frameArea}>
            <CornerBracket color={frameColor} position="tl" />
            <CornerBracket color={frameColor} position="tr" />
            <CornerBracket color={frameColor} position="bl" />
            <CornerBracket color={frameColor} position="br" />
            {busy && (
              <Animated.View style={[styles.sweepLine, { transform: [{ translateY: sweepAnim }] }]} />
            )}
          </View>

          {/* Status */}
          <View style={styles.statusRow}>
            {busy && <View style={styles.miniSpinner}><View style={styles.miniSpinnerInner} /></View>}
            {recognised && (
              <View style={styles.miniCheck}>
                <Ionicons name="checkmark" size={12} color="#111114" />
              </View>
            )}
            <Typography variant="h2" style={styles.statusTitle}>
              {busy ? 'Reading barcode…' : recognised ? 'SIM recognised' : 'Ready when you are'}
            </Typography>
          </View>
          <Typography variant="caption" style={styles.statusBody}>
            {busy
              ? 'Hold the barcode steady inside the frame.'
              : recognised
                ? (manualUsed ? 'Number accepted — ready for activation.' : 'Your new SIM is valid and ready for activation.')
                : 'Have your new SIM card in hand, then start the scan.'}
          </Typography>

          {/* ICCID chip */}
          {recognised && (
            <View style={styles.iccidChip}>
              <Typography variant="caption" style={styles.iccidLabel}>ICCID</Typography>
              <Typography variant="body" style={styles.iccidValue}>{iccid}</Typography>
            </View>
          )}

          {/* Tips */}
          {idle && (
            <View style={styles.tipsRow}>
              {['Good light', 'Hold steady', 'Takes ~10s'].map((t, i) => (
                <View key={i} style={styles.tipPill}>
                  <Typography variant="caption" style={styles.tipText}>{t}</Typography>
                </View>
              ))}
            </View>
          )}

          {/* Rescan */}
          {recognised && (
            <TouchableOpacity onPress={rescan} style={styles.rescanBtn} activeOpacity={0.8}>
              <Typography variant="caption" style={styles.rescanText}>Scan a different SIM</Typography>
            </TouchableOpacity>
          )}
        </View>

        {/* CTA */}
        <TouchableOpacity
          onPress={handlePrimary}
          activeOpacity={busy || submitPhase !== 'idle' ? 1 : 0.9}
          style={[styles.ctaButton, { backgroundColor: busy || submitPhase !== 'idle' ? '#EFEFF4' : ACCENT }]}
          disabled={busy || submitPhase !== 'idle'}
        >
          <View style={styles.ctaInner}>
            {!recognised && !busy && (
              <Ionicons name="camera-outline" size={20} color={busy ? '#A2A2AC' : '#111114'} />
            )}
            <Typography variant="body" style={[styles.ctaText, { color: busy || submitPhase !== 'idle' ? '#A2A2AC' : '#111114' }]}>
              {ctaText}
            </Typography>
            {submitPhase === 'busy' && (
              <View style={styles.miniSpinner}><View style={styles.miniSpinnerInner} /></View>
            )}
            {recognised && submitPhase === 'idle' && (
              <Typography variant="body" style={styles.ctaArrow}>→</Typography>
            )}
          </View>
          {submitPhase === 'busy' && <View style={styles.ctaProgress} />}
        </TouchableOpacity>
        <Typography variant="caption" style={styles.footHint}>
          {busy ? 'Reading the ICCID on your new SIM' : recognised ? 'Next: review and confirm' : 'Camera opens on the next tap'}
        </Typography>

        {/* Manual Entry Accordion */}
        <View style={[styles.manualCard, { borderColor: '#EFEFF3' }]}>
          <TouchableOpacity
            onPress={() => setManualOpen((v) => !v)}
            style={styles.manualHeader}
            activeOpacity={0.8}
          >
            <View style={[styles.iconBox, { backgroundColor: manualOpen || manualValid ? '#FFF3C9' : '#F4F4F7' }]}>
              <Typography variant="body" style={styles.iconGlyph}>⌨</Typography>
            </View>
            <View style={{ flex: 1 }}>
              <Typography variant="body" style={styles.manualTitle}>Enter the number manually</Typography>
              <Typography variant="caption" style={styles.manualSub}>
                {manualUsed ? 'Entered manually — tap to edit' : "We couldn't read the barcode — type it instead"}
              </Typography>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color="#9A9AA4"
              style={{ transform: [{ rotate: manualOpen ? '90deg' : '0deg' }] }}
            />
          </TouchableOpacity>

          {manualOpen && (
            <View style={styles.manualBody}>
              <Typography variant="caption" style={styles.inputLabel}>ICCID number</Typography>
              <View style={[styles.manualInputRow, { backgroundColor: manualValid ? '#FFFBEC' : '#F7F7FA', borderColor: '#EFEFF3' }]}>
                <View style={[styles.prefixBox, { backgroundColor: manualOpen || manualValid ? '#FFF3C9' : '#F4F4F7' }]}>
                  <Typography variant="caption" style={styles.prefixText}>89</Typography>
                </View>
                <TextInput
                  value={manual.replace(/(.{4})/g, '$1 ').trim()}
                  onChangeText={handleManualChange}
                  placeholder="5700 1234 5678 9012 3"
                  keyboardType="numeric"
                  maxLength={21}
                  style={styles.manualInput}
                  placeholderTextColor="#B4B4BE"
                />
                {manualValid && (
                  <View style={styles.miniCheck}>
                    <Ionicons name="checkmark" size={12} color="#111114" />
                  </View>
                )}
              </View>
              <Typography variant="caption" style={[styles.manualHint, { color: manualValid ? '#8A6A00' : '#8A8A94' }]}>
                {manualValid ? 'Looks good' : '17 digits after the 89 prefix'}
              </Typography>
              <TouchableOpacity
                onPress={submitManual}
                activeOpacity={manualValid ? 0.9 : 1}
                style={[styles.manualCta, { backgroundColor: manualValid ? ACCENT : '#E8E8ED' }]}
                disabled={!manualValid}
              >
                <Typography variant="body" style={[styles.manualCtaText, { color: manualValid ? '#111114' : '#A2A2AC' }]}>
                  Use this number
                </Typography>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Typography variant="caption" style={styles.footer}>
          Encrypted · POPIA compliant · ICCID only
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

  /* stage card */
  stageCard: { borderRadius: 20, padding: 26, paddingHorizontal: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEFF3', shadowColor: '#111114', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 22, elevation: 2, marginBottom: 12, alignItems: 'center', overflow: 'hidden' },
  stageGlow: { position: 'absolute', left: '50%', top: '26%', width: 210, height: 150, marginLeft: -105, backgroundColor: 'rgba(255,203,5,0.28)', borderRadius: 105, transform: [{ scale: 1.2 }], zIndex: 0 },
  frameArea: { position: 'relative', width: 215, height: 143, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  cornerBracket: { position: 'absolute', width: 34, height: 34, backgroundColor: 'transparent' },
  sweepLine: { position: 'absolute', left: 8, right: 8, height: 2.5, backgroundColor: '#F5C000', shadowColor: '#FFCB05', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 18, elevation: 8, zIndex: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 20, zIndex: 1 },
  statusTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.6, color: '#111114' },
  statusBody: { marginTop: 8, fontSize: 13, lineHeight: 19.5, color: '#5A5A64', textAlign: 'center', maxWidth: 280, zIndex: 1 },
  iccidChip: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FFFBEC', borderWidth: 1, borderColor: '#EFEFF3', zIndex: 1 },
  iccidLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.84, textTransform: 'uppercase', color: '#8A6A00' },
  iccidValue: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.625, color: '#111114' },
  tipsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 16, zIndex: 1 },
  tipPill: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: 7, backgroundColor: '#F4F4F7', borderWidth: 1, borderColor: '#E6E6EC' },
  tipText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.42, textTransform: 'uppercase', color: '#4A4A55' },
  rescanBtn: { marginTop: 14, paddingVertical: 11, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: '#EFEFF3', backgroundColor: '#FFFFFF', shadowColor: '#111114', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 1 },
  rescanText: { fontSize: 13, fontWeight: '700', color: '#4A4A55' },

  /* cta */
  ctaButton: { width: '100%', height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: 12, shadowColor: 'rgba(255,203,5,0.9)', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 6 },
  ctaInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  ctaText: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.155 },
  ctaArrow: { fontSize: 16, color: '#111114' },
  ctaProgress: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: 'rgba(17,17,20,0.35)' },
  footHint: { textAlign: 'center', fontSize: 11.5, fontWeight: '600', color: '#8A8A94', marginTop: 6 },

  /* manual */
  manualCard: { borderRadius: 20, padding: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEFF3', shadowColor: '#111114', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 22, elevation: 2, marginTop: 12 },
  manualHeader: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  manualTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.14, color: '#111114' },
  manualSub: { fontSize: 12.5, color: '#6E6E78', marginTop: 2 },
  manualBody: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EDEDF1' },
  manualInputRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1 },
  manualInput: { flex: 1, fontSize: 15, fontWeight: '700', letterSpacing: 0.6, color: '#111114', padding: 0 },
  manualHint: { marginTop: 7, paddingLeft: 2, fontSize: 11.5, fontWeight: '600', lineHeight: 16 },
  manualCta: { width: '100%', height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  manualCtaText: { fontSize: 14, fontWeight: '800', letterSpacing: -0.14 },

  /* shared */
  iconBox: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, borderColor: '#EFEFF3', alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { fontSize: 16, color: '#8A6A00' },
  prefixBox: { height: 38, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: '#EFEFF3', alignItems: 'center', justifyContent: 'center' },
  prefixText: { fontSize: 12, fontWeight: '800', color: '#111114' },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#111114' },
  miniSpinner: { width: 17, height: 17, borderRadius: 8.5, borderWidth: 2.5, borderColor: 'rgba(17,17,20,0.14)', borderTopColor: '#F5C000' },
  miniSpinnerInner: { width: '100%', height: '100%' },
  miniCheck: { width: 22, height: 22, borderRadius: 11, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  footer: { textAlign: 'center', fontSize: 11.5, fontWeight: '600', color: '#8A8A94', lineHeight: 17, marginTop: 14 },

  /* modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(12,12,16,0.5)', justifyContent: 'flex-end', padding: 14, paddingBottom: Platform.OS === 'ios' ? 34 : 14 },
  modalSheet: { borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEFF3', padding: 24, paddingHorizontal: 20, paddingBottom: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 30 }, shadowOpacity: 0.5, shadowRadius: 60, elevation: 10 },
  camIconBg: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#111114', alignItems: 'center', justifyContent: 'center' },
  camIcon: { width: 22, height: 16, borderWidth: 2.5, borderColor: ACCENT, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  camLens: { width: 8, height: 8, borderRadius: 4, borderWidth: 2.5, borderColor: ACCENT },
  modalTitle: { marginTop: 14, fontSize: 17, fontWeight: '800', letterSpacing: -0.34, color: '#111114' },
  modalBody: { marginTop: 6, fontSize: 13, lineHeight: 19.5, color: '#5A5A64', textAlign: 'center', maxWidth: 260 },
  modalPrimary: { width: '100%', height: 52, borderRadius: 16, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', marginTop: 20, shadowColor: 'rgba(255,203,5,0.9)', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 6 },
  modalPrimaryText: { fontSize: 15, fontWeight: '800', letterSpacing: -0.15, color: '#111114' },
  modalSecondary: { width: '100%', height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  modalSecondaryText: { fontSize: 14, fontWeight: '700', color: '#6E6E78' },

  /* full-screen camera */
  camFull: { ...StyleSheet.absoluteFillObject, zIndex: 70, backgroundColor: '#0A0A0C', overflow: 'hidden' },
  camGradient: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0A0A0C' },
  camTorchWash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,240,190,0.22)' },
  floatingCard: { position: 'absolute', left: '50%', top: '48%', width: 300, marginLeft: -150, marginTop: -50, borderRadius: 10, backgroundColor: '#F7F7F5', padding: 16, paddingBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 30 }, shadowOpacity: 0.9, shadowRadius: 50, elevation: 10, alignItems: 'center' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 66, width: '100%' },
  floatingIccid: { marginTop: 8, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.92, color: '#111114', textAlign: 'center' },
  camFrame: { position: 'absolute', left: '50%', top: '48%', width: 330, height: 190, marginLeft: -165, marginTop: -95, borderRadius: 18 },
  camSweep: { position: 'absolute', left: 6, right: 6, height: 2.5, backgroundColor: ACCENT, shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 18, elevation: 8 },
  camTopBar: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, paddingTop: Platform.OS === 'ios' ? 50 : 14 },
  camCancelBtn: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  camCancelText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  camLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  camLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF4D4D' },
  camLiveText: { fontSize: 12.5, fontWeight: '700', color: '#fff' },
  camFlashBtn: { minHeight: 44, minWidth: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  camBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 22, paddingBottom: Platform.OS === 'ios' ? 40 : 24, alignItems: 'center' },
  camHintTitle: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.31, color: '#fff' },
  camHintSub: { marginTop: 5, fontSize: 12.5, lineHeight: 18, color: '#B7B7C2', textAlign: 'center', maxWidth: 280 },
  shutter: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 10 },
});
