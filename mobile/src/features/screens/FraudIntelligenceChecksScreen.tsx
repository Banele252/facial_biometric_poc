import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import { Typography, Card, Container, Button } from '@/components/ui';
import { Colors } from '@/theme';
import { useJourneyStore } from '@/store/useJourneyStore';
import { verifyIdentity, getDeviceId } from '@/shared/api';

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: any) => void;
  routeParams?: Record<string, unknown>;
  simulateFailure?: boolean;
  showSecondaryAction?: boolean;
  stepCount?: number;
  activeStep?: number;
}

const CHECKS = [
  { key: 'device', label: 'Device reputation', duration: 900 },
  { key: 'location', label: 'Location risk', duration: 700 },
  { key: 'behavior', label: 'Behavior pattern', duration: 800 },
  { key: 'velocity', label: 'Velocity check', duration: 600 },
];

export default function FraudIntelligenceChecksScreen({
  navigate,
  goBack,
  dispatch,
  simulateFailure = false,
  showSecondaryAction = true,
  stepCount = 10,
  activeStep = 8,
}: Props) {
  const [phase, setPhase] = useState<'ready' | 'running' | 'done' | 'error'>('ready');
  const [completed, setCompleted] = useState<string[]>([]);
  const [banner, setBanner] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pulseAnim] = useState(() => new Animated.Value(1));

  const idNumber = useJourneyStore((s) => s.idNumber);
  const fullName = useJourneyStore((s) => s.fullName);
  const msisdn = useJourneyStore((s) => s.msisdn);
  const newSim = useJourneyStore((s) => s.newSim);
  const transaction = useJourneyStore((s) => s.transaction);
  const consent = useJourneyStore((s) => s.consent);
  const documentType = useJourneyStore((s) => s.documentType);
  const documentImage = useJourneyStore((s) => s.documentImage);
  const selfieId = useJourneyStore((s) => s.selfieId);
  const setDecision = useJourneyStore((s) => s.setDecision);
  const record = useJourneyStore((s) => s.record);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'running') {
      pulseAnim.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [phase, pulseAnim]);

  /* ── Navigation helpers ── */
  const handleBack = () => {
    if (goBack) goBack();
    else if (dispatch) dispatch({ type: 'GO_BACK' });
  };

  const handleNavigate = (screen: string, params?: any) => {
    if (navigate) navigate(screen, params);
    else if (dispatch) dispatch({ type: 'NAVIGATE', payload: { screen, params } });
  };

  /* This is where the journey is actually decided. Everything the customer has
   * given us so far — consent, document type, the scanned document, the selfie
   * that passed liveness, their typed details — goes to the orchestrator in one
   * call, which runs the fraud pre-checks, the document comparisons, RICA and
   * Home Affairs and returns a single verdict.
   *
   * The tick-list below still animates while the request is in flight, because
   * the call takes several seconds; it just no longer decides the outcome. */
  const runChecks = () => {
    if (phase === 'running') return;

    if (phase === 'done') {
      handleNavigate('SIMSwapApproved');
      return;
    }

    setPhase('running');
    setCompleted([]);
    setBanner('');

    // Walk the tick list purely as progress feedback.
    let index = 0;
    const tick = () => {
      if (index >= CHECKS.length) return;
      setCompleted((prev) => [...prev, CHECKS[index].key]);
      index += 1;
      timerRef.current = setTimeout(tick, CHECKS[index - 1].duration);
    };
    timerRef.current = setTimeout(tick, 400);

    void (async () => {
      try {
        const result = await verifyIdentity({
          id_number: idNumber.trim(),
          selfie_id: selfieId ?? '',
          consent,
          document_type: documentType,
          document_image: documentImage ?? undefined,
          full_name: fullName.trim() || undefined,
          msisdn: msisdn.trim() || undefined,
          new_sim_number: newSim.trim() || undefined,
          device_id: getDeviceId(),
          transaction,
        });

        if (timerRef.current) clearTimeout(timerRef.current);
        setDecision(result);
        setCompleted(CHECKS.map((c) => c.key));
        for (const check of result.checks) {
          record(
            check.label,
            check.status === 'pass' ? 'pass' : check.status === 'fail' ? 'fail' : 'info',
            check.detail,
          );
        }

        if (result.status === 'approved') {
          setPhase('done');
        } else {
          // A rejection and a referral are different answers, and the customer
          // is told which one they got in the backend's own words rather than
          // a single catch-all message.
          setPhase('error');
          setBanner(result.reason);
        }
      } catch (err) {
        if (timerRef.current) clearTimeout(timerRef.current);
        setPhase('error');
        setBanner(
          err instanceof Error ? err.message : 'The checks could not be completed.',
        );
      }
    })();
  };

  const dismissBanner = () => {
    setBanner('');
    setPhase('ready');
    setCompleted([]);
  };

  const isRunning = phase === 'running';
  const isDone = phase === 'done';
  const isError = phase === 'error';

  const totalDots = stepCount;
  const activeDot = Math.min(Math.max(activeStep, 1), totalDots) - 1;

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <Container>
        <Card style={styles.cardContainer}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Typography variant="subtitle" style={styles.headerTitle}>
                Fraud Intelligence
            </Typography>
            <View style={styles.headerSpacer} />
          </View>

          {/* Headline */}
          <View style={styles.headlineContainer}>
            <View style={[styles.titleAccent, { backgroundColor: Colors.primary }]} />
            <Typography variant="h1" style={styles.headline}>
              {isDone
                ? 'All checks passed'
                : isError
                  ? 'Review required'
                  : 'Running fraud intelligence'}
            </Typography>
          </View>

          {/* Shield */}
          <View style={styles.shieldContainer}>
            <Animated.View
              style={[
                styles.shield,
                {
                  backgroundColor: isError
                    ? '#FEF3F1'
                    : isDone
                      ? '#E4F5EA'
                      : '#FFF7DB',
                  borderColor: isError
                    ? '#F3C9C3'
                    : isDone
                      ? '#C4E7D2'
                      : '#F0DE9C',
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <Ionicons
                name={isError ? 'warning-outline' : isDone ? 'shield-checkmark-outline' : 'shield-outline'}
                size={44}
                color={isError ? '#C0362C' : isDone ? '#1F7A4C' : Colors.primary}
              />
            </Animated.View>
            <Typography variant="h2" style={styles.statusLabel}>
              {isDone
                ? 'Risk score: Low'
                : isError
                  ? 'Risk score: High'
                  : isRunning
                    ? 'Analysing…'
                    : 'Tap start to begin'}
            </Typography>
          </View>

          {/* Checklist */}
          <View style={styles.checksList}>
            {CHECKS.map((check) => {
              const passed = completed.includes(check.key);
              const current = isRunning && !passed && completed.length === CHECKS.indexOf(check);
              return (
                <View
                  key={check.key}
                  style={[
                    styles.checkRow,
                    passed && styles.checkRowPassed,
                    current && styles.checkRowCurrent,
                  ]}
                >
                  <View
                    style={[
                      styles.checkIcon,
                      passed && { backgroundColor: '#2FA96B' },
                      current && { backgroundColor: Colors.primary },
                    ]}
                  >
                    {passed && <Ionicons name="checkmark" size={12} color="#FFF" />}
                    {current && <Animated.View style={[styles.pulsingDot,
                      { opacity: pulseAnim }]} />}
                  </View>
                  <Typography
                    variant="body"
                    style={[
                      styles.checkLabel,
                      passed && { color: '#1F7A4C', fontWeight: '700' },
                      current && { color: Colors.text, fontWeight: '700' },
                    ]}
                  >
                    {check.label}
                  </Typography>
                </View>
              );
            })}
          </View>

          {/* Error Banner */}
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

          {/* Actions */}
          <View style={styles.actionContainer}>
            <Button
              onPress={runChecks}
              variant={isRunning ? 'outline' : 'primary'}
              disabled={isRunning}
              style={isRunning ? styles.buttonDisabled : styles.buttonPrimary}
            >
              {isRunning
                ? 'Checking…'
                : isDone
                  ? 'Continue'
                  : isError
                    ? 'Try again'
                    : 'Start checks'}
            </Button>
            {showSecondaryAction && (
              <Button onPress={() => {}} variant="outline" style={styles.secondaryButton}>
                    Need help?
              </Button>
            )}
          </View>

          {/* Step dots */}
          <View style={styles.dotsContainer}>
            {Array.from({ length: totalDots }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === activeDot ? styles.dotActive : styles.dotInactive]}
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
  headlineContainer: { flexDirection: 'row', alignItems: 'stretch', gap: 13, marginBottom: 24 },
  titleAccent: { width: 4, borderRadius: 4 },
  headline: { fontSize: 25, lineHeight: 30, fontWeight: '800', color: Colors.text, letterSpacing: -0.6, maxWidth: 280 },
  shieldContainer: { alignItems: 'center', gap: 14, marginBottom: 28 },
  shield: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  statusLabel: { fontSize: 16, fontWeight: '700', color: Colors.text },
  checksList: { gap: 10, marginBottom: 20 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 14, borderWidth: 1.5, borderColor: '#ECE8DF', backgroundColor: Colors.surface },
  checkRowPassed: { borderColor: '#C4E7D2', backgroundColor: '#F3FBF6' },
  checkRowCurrent: { borderColor: '#F0DE9C', backgroundColor: '#FFFCF2' },
  checkIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E2DFD7', alignItems: 'center',
    justifyContent: 'center' },
  pulsingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  checkLabel: { fontSize: 14, fontWeight: '500', color: '#6B6559', flex: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#F3C9C3',
    borderRadius: 16, backgroundColor: '#FEF3F1', padding: 13, marginBottom: 16 },
  bannerIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#FBE3E0', alignItems: 'center',
    justifyContent: 'center' },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#7A2820', lineHeight: 19 },
  bannerClose: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1 },
  actionContainer: { gap: 10, marginTop: 16 },
  buttonPrimary: { backgroundColor: Colors.primary },
  buttonDisabled: { backgroundColor: '#F5EFDC', color: '#A39B88' },
  secondaryButton: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: '#F0DE9C' },
  dotsContainer: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', paddingVertical: 22 },
  dot: { height: 7, borderRadius: 4 },
  dotActive: { width: 22, backgroundColor: Colors.primary },
  dotInactive: { width: 7, backgroundColor: '#E2DFD7' },
});