import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  Modal,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/components/ui';

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: any) => void;
  idNumber?: string;
  msisdn?: string;
  iccid?: string;
}

const STEP = 4;
const TOTAL_STEPS = 6;
const ACCENT = '#FFCB05';

const CHECKS = [
  { label: 'Identity verified', meta: 'Home Affairs' },
  { label: 'New SIM verified', meta: 'ICCID' },
  { label: 'Fraud checks passed', meta: 'Risk score low' },
  { label: 'Ready to activate', meta: 'Network' },
];

const NEXT_STEPS = [
  { n: '1', text: 'We start activation on your new SIM immediately.' },
  { n: '2', text: 'Insert the new SIM and restart your phone.' },
  { n: '3', text: 'Your old SIM only deactivates once the new one is live.' },
];

export default function ReviewScreen({
  navigate,
  goBack,
  dispatch,
  idNumber = '900101 1234 085',
  msisdn = '082 123 4567',
  iccid = '8957 0012 3456 7890 123',
}: Props) {
  const [agreed, setAgreed] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<'idle' | 'busy'>('idle');
  const [done, setDone] = useState(false);
  const [shake, setShake] = useState(false);
  const [nextOpen, setNextOpen] = useState(false);
  const [passed, setPassed] = useState(0);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* ─── auto-run checks on mount ─── */
  useEffect(() => {
    CHECKS.forEach((_, i) => {
      const t = setTimeout(() => setPassed(i + 1), 650 + i * 720);
      timersRef.current.push(t);
    });
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  /* ─── shake animation ─── */
  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -5, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -3, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 3, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleToggleAgree = () => {
    setAgreed((v) => !v);
    setShake(false);
  };

  const handleConfirm = () => {
    if (submitPhase !== 'idle') return;
    if (!agreed) {
      setShake(true);
      triggerShake();
      const t = setTimeout(() => setShake(false), 520);
      timersRef.current.push(t);
      return;
    }
    setSubmitPhase('busy');
    const t = setTimeout(() => {
      setSubmitPhase('idle');
      setDone(true);
    }, 1700);
    timersRef.current.push(t);
  };

  const handleFinish = () => {
    setDone(false);
    if (navigate) navigate('CompleteScreen');
    else if (dispatch) dispatch({ type: 'NAVIGATE', payload: { screen: 'CompleteScreen' } });
  };

  const handleBack = () => {
    if (goBack) goBack();
    else if (dispatch) dispatch({ type: 'GO_BACK' });
  };

  const allPassed = passed >= CHECKS.length;
  const enabled = agreed && submitPhase === 'idle';

  const stepBars = Array.from({ length: TOTAL_STEPS }, (_, n) => ({
    bg: n === STEP ? ACCENT : n < STEP ? 'rgba(255,203,5,0.55)' : '#DEDEE4',
  }));

  const rows = [
    { glyph: '☺', label: 'RSA Identity Number', value: idNumber },
    { glyph: '☏', label: 'Mobile number', value: msisdn },
    { glyph: '▤', label: 'New SIM (ICCID)', value: iccid },
    { glyph: '⇄', label: 'Request type', value: 'SIM swap' },
  ];

  const ctaText = submitPhase === 'busy' ? 'Activating…' : 'Confirm';

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="dark-content" backgroundColor="#EFEFF2" />

      {/* ─── Success Modal ─── */}
      <Modal visible={done} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalCheck}>
              <Ionicons name="checkmark" size={24} color="#111114" />
            </View>
            <Typography variant="h2" style={styles.modalTitle}>Activation started</Typography>
            <Typography variant="caption" style={styles.modalBody}>
              Insert your new SIM and restart your phone. This usually completes within 10 minutes — we&apos;ll SMS you the moment it&apos;s live.
            </Typography>
            <TouchableOpacity onPress={handleFinish} style={styles.modalCta} activeOpacity={0.9}>
              <Typography variant="body" style={styles.modalCtaText}>Done</Typography>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
            <Typography variant="body" style={styles.cardTitle}>Review and confirm</Typography>
            <Typography variant="caption" style={styles.cardStep}>Step 5 of 6</Typography>
          </View>
          <View style={styles.stepBars}>
            {stepBars.map((s, i) => (
              <View key={i} style={[styles.stepBar, { backgroundColor: s.bg }]} />
            ))}
          </View>
          <Typography variant="caption" style={styles.cardSub}>
            Last step. Check these details, then authorise the swap — your old SIM stays active until the new one is live.
          </Typography>
        </View>

        {/* Request Details + Security Checks Card */}
        <View style={styles.detailsCard}>
          <Typography variant="caption" style={styles.sectionLabel}>Your request</Typography>

          {rows.map((r, i) => (
            <View key={i}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.detailRow}>
                <View style={styles.iconBox}>
                  <Typography variant="body" style={styles.iconGlyph}>{r.glyph}</Typography>
                </View>
                <View style={{ flex: 1 }}>
                  <Typography variant="caption" style={styles.detailLabel}>{r.label}</Typography>
                  <Typography variant="body" style={styles.detailValue}>{r.value}</Typography>
                </View>
              </View>
            </View>
          ))}

          <View style={styles.divider} />

          {/* Security checks header */}
          <View style={styles.checksHeader}>
            <Typography variant="caption" style={styles.sectionLabel}>Security checks</Typography>
            <View style={[styles.badge, { backgroundColor: allPassed ? ACCENT : '#FFFFFF', borderColor: allPassed ? '#F2BE00' : '#EFEFF3' }]}>
              {allPassed ? (
                <View style={styles.badgeCheck}>
                  <Ionicons name="checkmark" size={8} color={ACCENT} />
                </View>
              ) : (
                <View style={styles.miniSpinner}>
                  <View style={styles.miniSpinnerInner} />
                </View>
              )}
              <Typography variant="caption" style={[styles.badgeText, { color: allPassed ? '#111114' : '#6E6E78' }]}>
                {allPassed ? 'All passed' : `Checking ${Math.min(passed + 1, CHECKS.length)} of ${CHECKS.length}`}
              </Typography>
            </View>
          </View>

          {/* Checklist with rail */}
          <View style={styles.checklist}>
            <View style={styles.railTrack} />
            <View style={[styles.railFill, { height: passed === 0 ? 0 : Math.min(passed, CHECKS.length - 1) * 38 }]} />

            {CHECKS.map((c, i) => {
              const isPassed = i < passed;
              const isActive = i === passed;
              return (
                <View key={i} style={styles.checkItem}>
                  <View style={[styles.checkDot, { backgroundColor: isPassed ? ACCENT : '#FFFFFF', borderColor: isPassed ? ACCENT : isActive ? '#E2E2E9' : '#E2E2E9' }]}>
                    {isPassed && (
                      <Ionicons name="checkmark" size={10} color="#111114" />
                    )}
                    {isActive && (
                      <View style={styles.dotSpinner}>
                        <View style={styles.dotSpinnerInner} />
                      </View>
                    )}
                  </View>
                  <Typography variant="body" style={[styles.checkLabel, { color: isPassed || isActive ? '#111114' : '#A2A2AC', fontWeight: isPassed ? '800' : '700' }]}>
                    {c.label}
                  </Typography>
                  <Typography variant="caption" style={[styles.checkMeta, { color: isPassed ? '#8A6A00' : '#A2A2AC' }]}>
                    {isPassed ? c.meta : isActive ? 'Checking…' : 'Queued'}
                  </Typography>
                </View>
              );
            })}
          </View>
        </View>

        {/* Next Steps Accordion */}
        <View style={styles.card}>
          <TouchableOpacity onPress={() => setNextOpen((v) => !v)} style={styles.nextHeader} activeOpacity={0.8}>
            <View style={[styles.iconBox, { backgroundColor: nextOpen ? '#FFF3C9' : '#F4F4F7' }]}>
              <Typography variant="body" style={styles.iconGlyph}>◔</Typography>
            </View>
            <View style={{ flex: 1 }}>
              <Typography variant="body" style={styles.nextTitle}>What happens after you confirm</Typography>
              <Typography variant="caption" style={styles.nextSub}>Usually live within 10 minutes</Typography>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9A9AA4" style={{ transform: [{ rotate: nextOpen ? '90deg' : '0deg' }] }} />
          </TouchableOpacity>
          {nextOpen && (
            <View style={styles.nextBody}>
              {NEXT_STEPS.map((n, i) => (
                <View key={i} style={styles.nextLine}>
                  <View style={styles.nextBullet}>
                    <Typography variant="caption" style={styles.nextBulletText}>{n.n}</Typography>
                  </View>
                  <Typography variant="caption" style={styles.nextLineText}>{n.text}</Typography>
                </View>
              ))}
            </View>
          )}
        </View>

        <Typography variant="caption" style={styles.footer}>
          Encrypted · POPIA compliant · Verified by MTN Trust
        </Typography>

        {/* Spacer for fixed bottom */}
        <View style={{ height: 140 }} />
      </ScrollView>

      {/* ─── Fixed Bottom Sheet ─── */}
      <View style={styles.bottomWrap}>
        <View style={styles.bottomCard}>
          {/* Consent checkbox */}
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <TouchableOpacity
              onPress={handleToggleAgree}
              activeOpacity={0.8}
              style={[
                styles.consentRow,
                { borderColor: shake ? '#E0A800' : agreed ? '#F2DC8E' : '#EFEFF3' },
              ]}
            >
              <View
                style={[
                  styles.consentBox,
                  {
                    backgroundColor: agreed
                      ? '#111114'
                      : '#FFFFFF',
                    borderColor: agreed
                      ? '#111114'
                      : shake
                        ? '#9A9AA4'
                        : '#C9C9D2',
                  },
                ]}
              >
                {agreed && (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                )}
              </View>
              <Typography variant="body" style={styles.consentText}>
                These details are correct — activate my new SIM.
              </Typography>
            </TouchableOpacity>
          </Animated.View>

          {/* Confirm CTA */}
          <TouchableOpacity
            onPress={handleConfirm}
            activeOpacity={enabled ? 0.9 : 1}
            style={[
              styles.confirmBtn,
              { backgroundColor: enabled || submitPhase !== 'idle' ? ACCENT : '#EFEFF4' },
            ]}
            disabled={!enabled && submitPhase === 'idle'}
          >
            <View style={styles.confirmInner}>
              <Typography variant="body" style={[styles.confirmText, { color: enabled || submitPhase !== 'idle' ? '#111114' : '#A2A2AC' }]}>
                {ctaText}
              </Typography>
              {submitPhase === 'busy' && (
                <View style={styles.miniSpinner}>
                  <View style={styles.miniSpinnerInner} />
                </View>
              )}
              {submitPhase === 'idle' && (
                <Typography variant="body" style={styles.confirmArrow}>→</Typography>
              )}
            </View>
            {submitPhase === 'busy' && <View style={styles.confirmProgress} />}
          </TouchableOpacity>
        </View>
        <Typography variant="caption" style={[styles.bottomHint, { opacity: shake || submitPhase === 'busy' ? 1 : 0 }]}>
          {shake ? 'Tick the box to authorise the swap' : submitPhase === 'busy' ? 'Submitting your request' : ''}
        </Typography>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#EFEFF2' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 10, paddingBottom: 0 },

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

  /* details card */
  detailsCard: { borderRadius: 20, padding: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEFF3', shadowColor: '#111114', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 22, elevation: 2, marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.99, textTransform: 'uppercase', color: '#6E6E78' },
  divider: { height: 1, backgroundColor: '#EDEDF1', marginVertical: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  iconBox: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#F4F4F7', borderWidth: 1, borderColor: '#E6E6EC', alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { fontSize: 16, color: '#8A6A00' },
  detailLabel: { fontSize: 12, fontWeight: '700', color: '#6E6E78' },
  detailValue: { fontSize: 14, fontWeight: '800', letterSpacing: -0.14, color: '#111114', marginTop: 2 },

  /* checks */
  checksHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#EDEDF1' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, shadowColor: '#111114', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  badgeCheck: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#111114', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: -0.11 },
  checklist: { marginTop: 16, paddingLeft: 31, position: 'relative' },
  railTrack: { position: 'absolute', left: 11, top: 9, bottom: 9, width: 2, borderRadius: 1, backgroundColor: '#EDEDF1' },
  railFill: { position: 'absolute', left: 11, top: 9, width: 2, borderRadius: 1, backgroundColor: ACCENT },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 22, marginBottom: 16 },
  checkDot: { position: 'absolute', left: -31, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { flex: 1, fontSize: 13.5, letterSpacing: -0.135 },
  checkMeta: { fontSize: 11, fontWeight: '700' },
  dotSpinner: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: 'rgba(17,17,20,0.12)', borderTopColor: '#8A6A00' },
  dotSpinnerInner: { width: '100%', height: '100%' },

  /* next steps accordion */
  nextHeader: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  nextTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.14, color: '#111114' },
  nextSub: { fontSize: 12.5, color: '#6E6E78', marginTop: 2 },
  nextBody: { paddingLeft: 51, paddingTop: 12 },
  nextLine: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginBottom: 9 },
  nextBullet: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFF7DA', alignItems: 'center', justifyContent: 'center' },
  nextBulletText: { fontSize: 10, fontWeight: '800', color: '#8A6A00' },
  nextLineText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: '#5A5A64' },

  /* fixed bottom */
  bottomWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16, backgroundColor: 'transparent' },
  bottomCard: { borderRadius: 22, padding: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EDEDF1', shadowColor: '#111114', shadowOffset: { width: 0, height: -12 }, shadowOpacity: 0.06, shadowRadius: 34, elevation: 8, gap: 9 },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1, backgroundColor: '#FFFFFF' },
  consentBox: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  consentText: { flex: 1, fontSize: 12.8, fontWeight: '600', lineHeight: 18, color: '#111114' },
  confirmBtn: { width: '100%', height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  confirmInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  confirmText: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.155 },
  confirmArrow: { fontSize: 16, color: '#111114' },
  confirmProgress: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: 'rgba(17,17,20,0.35)' },
  bottomHint: { textAlign: 'center', fontSize: 11.5, fontWeight: '600', color: '#8A8A94', marginTop: 6 },

  /* shared */
  miniSpinner: { width: 13, height: 13, borderRadius: 6.5, borderWidth: 2, borderColor: 'rgba(17,17,20,0.14)', borderTopColor: '#8A6A00' },
  miniSpinnerInner: { width: '100%', height: '100%' },
  footer: { textAlign: 'center', fontSize: 11.5, fontWeight: '600', color: '#8A8A94', lineHeight: 17, marginTop: 2 },

  /* modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(12,12,16,0.5)', justifyContent: 'flex-end', padding: 14, paddingBottom: Platform.OS === 'ios' ? 34 : 14 },
  modalSheet: { borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEFF3', padding: 26, paddingHorizontal: 20, paddingBottom: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 30 }, shadowOpacity: 0.5, shadowRadius: 60, elevation: 10 },
  modalCheck: { width: 56, height: 56, borderRadius: 18, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { marginTop: 14, fontSize: 19, fontWeight: '800', letterSpacing: -0.475, color: '#111114' },
  modalBody: { marginTop: 7, fontSize: 13, lineHeight: 19.5, color: '#5A5A64', textAlign: 'center', maxWidth: 280 },
  modalCta: { width: '100%', height: 52, borderRadius: 16, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', marginTop: 20, shadowColor: 'rgba(255,203,5,0.9)', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 6 },
  modalCtaText: { fontSize: 15, fontWeight: '800', letterSpacing: -0.15, color: '#111114' },
});
