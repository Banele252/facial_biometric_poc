import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/components/ui';
import { Colors } from '@/theme';

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: any) => void;
}

const STEP = 1;
const TOTAL_STEPS = 5;
const ACCENT = '#FFCB05';

function digits(v: string): string {
  return (v || '').replace(/\D/g, '');
}

function fmtId(d: string): string {
  const a = d.slice(0, 6);
  const b = d.slice(6, 10);
  const c = d.slice(10, 13);
  return [a, b, c].filter(Boolean).join(' ');
}

function fmtTel(d: string): string {
  const s = d.replace(/^27/, '').replace(/^0/, '');
  const a = s.slice(0, 2);
  const b = s.slice(2, 5);
  const c = s.slice(5, 9);
  return [a, b, c].filter(Boolean).join(' ');
}

export default function VerifyDetailsScreen({ navigate, goBack, dispatch }: Props) {
  const [id, setId] = useState('');
  const [tel, setTel] = useState('');
  const [focus, setFocus] = useState<'id' | 'tel' | null>(null);
  const [touched, setTouched] = useState<{ id?: boolean; tel?: boolean }>({});
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const [shake, setShake] = useState<'id' | 'tel' | null>(null);

  const idShakeAnim = useRef(new Animated.Value(0)).current;
  const telShakeAnim = useRef(new Animated.Value(0)).current;
  const matchOpacity = useRef(new Animated.Value(0)).current;
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    const ready = id.length === 13 && tel.length === 9;
    Animated.timing(matchOpacity, {
      toValue: ready ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [id, tel, matchOpacity]);

  const triggerShake = useCallback(
    (target: 'id' | 'tel') => {
      const anim = target === 'id' ? idShakeAnim : telShakeAnim;
      anim.setValue(0);
      Animated.sequence([
        Animated.timing(anim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(anim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    },
    [idShakeAnim, telShakeAnim],
  );

  const handleIdChange = (text: string) => {
    const d = digits(text).slice(0, 13);
    setId(d);
    setShake(null);
  };

  const handleTelChange = (text: string) => {
    const d = digits(text).replace(/^27/, '').replace(/^0/, '').slice(0, 9);
    setTel(d);
    setShake(null);
  };

  const handleBlur = () => {
    setFocus((prev) => {
      if (prev) {
        setTouched((t) => ({ ...t, [prev]: true }));
      }
      return null;
    });
  };

  const handleBack = () => {
    if (goBack) goBack();
    else if (dispatch) dispatch({ type: 'GO_BACK' });
  };

  const handleContinue = () => {
    if (phase !== 'idle') return;
    const idOk = id.length === 13;
    const telOk = tel.length === 9;
    if (!idOk || !telOk) {
      const which = !idOk ? 'id' : 'tel';
      setShake(which);
      setTouched({ id: true, tel: true });
      triggerShake(which);
      const t = setTimeout(() => setShake(null), 520);
      timersRef.current.push(t);
      return;
    }
    setPhase('busy');
    const t1 = setTimeout(() => setPhase('done'), 1050);
    const t2 = setTimeout(() => {
      if (navigate) navigate('SimBarcodeScanScreen');
      else if (dispatch) dispatch({ type: 'NAVIGATE', payload: { screen: 'SimBarcodeScanScreen' } });
    }, 1700);
    timersRef.current.push(t1, t2);
  };

  const fieldMeta = (
    key: 'id' | 'tel',
    val: string,
    len: number,
    okHint: string,
    errHint: string,
    emptyHint: string,
  ) => {
    const valid = val.length === len;
    const bad = shake === key || (touched[key] && val.length > 0 && !valid);
    const active = focus === key;
    return {
      valid,
      bg: bad ? '#FFF5F5' : valid ? '#FFFBEC' : '#F7F7FA',
      border: bad ? '#E5484D' : '#EFEFF3',
      iconBg: valid || active ? '#FFF3C9' : '#F4F4F7',
      iconBorder: '#EFEFF3',
      hint: bad ? errHint : valid ? okHint : emptyHint,
      hintColor: bad ? '#C62A2F' : valid ? '#8A6A00' : '#8A8A94',
    };
  };

  const idF = fieldMeta('id', id, 13, 'Looks good', 'Enter all 13 digits', '13 digits');
  const telF = fieldMeta('tel', tel, 9, 'Looks good', 'Enter a valid 9-digit number', 'The MTN number you are swapping');
  const ready = idF.valid && telF.valid;
  const enabled = ready && phase === 'idle';

  const stepBars = Array.from({ length: TOTAL_STEPS }, (_, n) => ({
    bg: n === STEP ? ACCENT : n < STEP ? 'rgba(255,203,5,0.55)' : '#DEDEE4',
  }));

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
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
              <Typography variant="body" style={styles.cardTitle}>Let&apos;s verify you</Typography>
              <Typography variant="caption" style={styles.cardStep}>Step 2 of 5</Typography>
            </View>
            <View style={styles.stepBars}>
              {stepBars.map((s, i) => (
                <View key={i} style={[styles.stepBar, { backgroundColor: s.bg }]} />
              ))}
            </View>
            <Typography variant="caption" style={styles.cardSub}>
              Enter your identity number and the mobile number you&apos;re swapping. We match both against your MTN account.
            </Typography>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {/* ID Field */}
            <View>
              <Typography variant="caption" style={styles.inputLabel}>RSA Identity Number</Typography>
              <Animated.View style={{ transform: [{ translateX: idShakeAnim }] }}>
                <View style={[styles.inputRow, { backgroundColor: idF.bg, borderColor: idF.border }]}>
                  <View style={[styles.iconBox, { backgroundColor: idF.iconBg, borderColor: idF.iconBorder }]}>
                    <Typography variant="body" style={styles.iconGlyph}>▤</Typography>
                  </View>
                  <TextInput
                    value={fmtId(id)}
                    onChangeText={handleIdChange}
                    onFocus={() => setFocus('id')}
                    onBlur={handleBlur}
                    placeholder="000000 0000 000"
                    keyboardType="numeric"
                    maxLength={15}
                    style={styles.input}
                    placeholderTextColor="#B4B4BE"
                  />
                  {idF.valid && (
                    <View style={styles.checkCircle}>
                      <Ionicons name="checkmark" size={12} color="#111114" />
                    </View>
                  )}
                </View>
              </Animated.View>
              <Typography variant="caption" style={[styles.hint, { color: idF.hintColor }]}>
                {idF.hint}
              </Typography>
            </View>

            <View style={styles.divider} />

            {/* Tel Field */}
            <View>
              <Typography variant="caption" style={styles.inputLabel}>Mobile number</Typography>
              <Animated.View style={{ transform: [{ translateX: telShakeAnim }] }}>
                <View style={[styles.inputRow, { backgroundColor: telF.bg, borderColor: telF.border }]}>
                  <View style={[styles.prefixBox, { backgroundColor: telF.iconBg, borderColor: telF.iconBorder }]}>
                    <Typography variant="caption" style={styles.prefixText}>+27</Typography>
                  </View>
                  <TextInput
                    value={fmtTel(tel)}
                    onChangeText={handleTelChange}
                    onFocus={() => setFocus('tel')}
                    onBlur={handleBlur}
                    placeholder="83 000 0000"
                    keyboardType="phone-pad"
                    maxLength={13}
                    style={styles.input}
                    placeholderTextColor="#B4B4BE"
                  />
                  {telF.valid && (
                    <View style={styles.checkCircle}>
                      <Ionicons name="checkmark" size={12} color="#111114" />
                    </View>
                  )}
                </View>
              </Animated.View>
              <Typography variant="caption" style={[styles.hint, { color: telF.hintColor }]}>
                {telF.hint}
              </Typography>
            </View>
          </View>

          {/* Matched Account Card */}
          <Animated.View style={[styles.matchedCard, { opacity: matchOpacity }]}>
            <View style={styles.matchedHeader}>
              <View style={[styles.matchedAvatar, { backgroundColor: ready ? ACCENT : '#F4F4F7' }]}>
                <Typography variant="body" style={[styles.matchedAvatarText, { color: ready ? '#111114' : '#B4B4BE' }]}>
                  {ready ? 'TM' : '—'}
                </Typography>
              </View>
              <View style={{ flex: 1 }}>
                <Typography variant="body" style={styles.matchedName}>
                  {ready ? 'T••••• M•••••' : 'No account matched yet'}
                </Typography>
                <Typography variant="caption" style={styles.matchedSub}>
                  {ready ? 'Account matched · Home Affairs verified' : 'Enter both fields to match your MTN account'}
                </Typography>
              </View>
            </View>
            {ready && (
              <View style={styles.matchedBody}>
                <View style={styles.matchedRow}>
                  <Typography variant="caption" style={styles.matchedLabel}>Mobile number</Typography>
                  <Typography variant="body" style={styles.matchedValue}>+27 {fmtTel(tel)}</Typography>
                </View>
                <View style={styles.matchedRow}>
                  <Typography variant="caption" style={styles.matchedLabel}>Plan</Typography>
                  <Typography variant="body" style={styles.matchedValue}>MTN Sky 5GB</Typography>
                </View>
                <View style={styles.matchedRow}>
                  <Typography variant="caption" style={styles.matchedLabel}>Account since</Typography>
                  <Typography variant="body" style={styles.matchedValue}>Mar 2019</Typography>
                </View>
                <View style={styles.divider} />
                <View style={styles.nextSteps}>
                  {[
                    { glyph: '▤', label: 'Scan your new SIM', active: true },
                    { glyph: '☺', label: 'Face & liveness check', active: false },
                    { glyph: '✓', label: 'Swap activated', active: false },
                  ].map((n, i) => (
                    <View key={i} style={styles.nextStepItem}>
                      <View style={[styles.nextStepIcon, { backgroundColor: n.active ? '#FFF3C9' : '#F4F4F7', borderColor: '#EFEFF3' }]}>
                        <Typography variant="caption" style={{ color: n.active ? '#8A6A00' : '#9A9AA6', fontSize: 12 }}>{n.glyph}</Typography>
                      </View>
                      <Typography variant="caption" style={[styles.nextStepLabel, { color: n.active ? '#111114' : '#6E6E78' }]}>
                        {n.label}
                      </Typography>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </Animated.View>

          <Typography variant="caption" style={styles.footer}>
            Encrypted · POPIA compliant · Used for this swap only
          </Typography>

          {/* Spacer for fixed CTA */}
          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Fixed Bottom CTA */}
        <View style={styles.ctaWrap}>
          <View style={styles.ctaCard}>
            <TouchableOpacity
              onPress={handleContinue}
              activeOpacity={enabled ? 0.9 : 1}
              style={[
                styles.ctaButton,
                {
                  backgroundColor: enabled || phase !== 'idle' ? ACCENT : '#EFEFF4',
                },
              ]}
              disabled={!enabled && phase === 'idle'}
            >
              <View style={styles.ctaInner}>
                <Typography variant="body" style={[styles.ctaText, { color: enabled || phase !== 'idle' ? '#111114' : '#A2A2AC' }]}>
                  {phase === 'busy' ? 'Checking…' : phase === 'done' ? 'Verified' : 'Continue'}
                </Typography>
                {phase === 'busy' && (
                  <View style={styles.spinner}>
                    <View style={styles.spinnerInner} />
                  </View>
                )}
                {phase === 'done' && (
                  <View style={styles.doneCircle}>
                    <Ionicons name="checkmark" size={10} color={ACCENT} />
                  </View>
                )}
                {phase === 'idle' && (
                  <Typography variant="body" style={styles.ctaArrow}>→</Typography>
                )}
              </View>
              {phase === 'busy' && <View style={styles.ctaProgress} />}
            </TouchableOpacity>
          </View>
          <Typography variant="caption" style={styles.ctaHint}>
            {shake && !enabled ? 'Enter both fields to continue'
              : phase === 'busy' ? 'Matching your details'
              : phase === 'done' ? 'Next: scan your new SIM'
              : ready ? 'Next: scan your new SIM'
              : 'Enter both fields to continue'}
          </Typography>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#EFEFF2' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 10, paddingBottom: 0 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingTop: 4 },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#EFEFF3',
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#111114', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2,
  },
  logoPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12, paddingLeft: 6 },
  logoMtn: { width: 52, height: 27, borderRadius: 13, borderWidth: 2.5, borderColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  logoMtnText: { fontSize: 12.5, fontWeight: '800', color: ACCENT },
  logoTrust: { fontSize: 16, fontWeight: '800', letterSpacing: -0.32, color: '#fff', marginLeft: 9 },
  langButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6 },
  langText: { fontSize: 12.5, fontWeight: '700', color: '#6E6E78' },

  card: {
    borderRadius: 20, padding: 16, paddingHorizontal: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEFF3',
    shadowColor: '#111114', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 22, elevation: 2,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.32, color: '#111114' },
  cardStep: { fontSize: 12, fontWeight: '700', color: '#6E6E78' },
  stepBars: { flexDirection: 'row', gap: 6, marginTop: 12 },
  stepBar: { flex: 1, height: 4, borderRadius: 2 },
  cardSub: { marginTop: 12, fontSize: 13, lineHeight: 19.5, color: '#5A5A64' },

  inputLabel: { fontSize: 13, fontWeight: '700', color: '#111114' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 8,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1,
  },
  input: {
    flex: 1, fontSize: 16, fontWeight: '700', letterSpacing: 0.64, color: '#111114', padding: 0,
    fontFamily: Platform.OS === 'ios' ? 'Manrope' : 'Manrope',
  },
  iconBox: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { fontSize: 16, color: '#8A6A00' },
  prefixBox: { height: 38, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  prefixText: { fontSize: 13, fontWeight: '800', color: '#111114' },
  checkCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: 7, paddingLeft: 2, fontSize: 11.5, fontWeight: '600', lineHeight: 16 },
  divider: { height: 1, backgroundColor: '#EDEDF1', marginVertical: 16 },

  matchedCard: {
    borderRadius: 20, padding: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFEFF3',
    shadowColor: '#111114', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 22, elevation: 2,
    marginBottom: 12,
  },
  matchedHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  matchedAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  matchedAvatarText: { fontSize: 14, fontWeight: '800' },
  matchedName: { fontSize: 14, fontWeight: '700', letterSpacing: -0.14, color: '#111114' },
  matchedSub: { fontSize: 12.5, color: '#6E6E78', marginTop: 2 },
  matchedBody: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EDEDF1' },
  matchedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  matchedLabel: { fontSize: 12, fontWeight: '700', color: '#6E6E78' },
  matchedValue: { fontSize: 14, fontWeight: '800', letterSpacing: -0.14, color: '#111114' },
  nextSteps: { gap: 10, marginTop: 4 },
  nextStepItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nextStepIcon: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nextStepLabel: { fontSize: 12.5, fontWeight: '700' },

  footer: { textAlign: 'center', fontSize: 11.5, fontWeight: '600', color: '#8A8A94', lineHeight: 17, marginTop: 2 },

  ctaWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    backgroundColor: 'transparent',
  },
  ctaCard: {
    borderRadius: 22, padding: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EDEDF1',
    shadowColor: '#111114', shadowOffset: { width: 0, height: -12 }, shadowOpacity: 0.06, shadowRadius: 34, elevation: 8,
  },
  ctaButton: {
    width: '100%', height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  ctaInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  ctaText: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.155 },
  ctaArrow: { fontSize: 16, color: '#111114' },
  spinner: { width: 16, height: 16, borderRadius: 8, borderWidth: 2.5, borderColor: 'rgba(17,17,20,0.25)', borderTopColor: '#111114' },
  spinnerInner: { width: '100%', height: '100%' },
  doneCircle: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#111114', alignItems: 'center', justifyContent: 'center' },
  ctaProgress: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: 'rgba(17,17,20,0.35)' },
  ctaHint: { textAlign: 'center', fontSize: 11.5, fontWeight: '600', color: '#8A8A94', marginTop: 6 },
});
