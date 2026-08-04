// src/features/screens/FraudIntelligenceChecksScreen.tsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { Typography, Card, Container, Button } from '@/components/ui';
import { Colors } from '@/theme';

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: any) => void;
  routeParams?: Record<string, unknown>;
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
  routeParams,
  showSecondaryAction = true,
  stepCount = 10,
  activeStep = 8,
}: Props) {
  const [phase, setPhase] = useState<'ready' | 'running' | 'done' | 'error'>('ready');
  const [completed, setCompleted] = useState<string[]>([]);
  const [banner, setBanner] = useState('');
  const [riskScore, setRiskScore] = useState<string>('—');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pulseAnim = useMemo(() => new Animated.Value(1), []);

  const baseUrl =
      process.env.EXPO_PUBLIC_API_BASE_URL ||
      'https://backend-poc-bcd0hnd5c9e0cwfm.southafricanorth-01.azurewebsites.net';

  const idNumber = routeParams?.id_number as string;
  const selfieId = routeParams?.selfie_id as string;

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

  const handleBack = () => {
    if (goBack) goBack();
    else if (dispatch) dispatch({ type: 'GO_BACK' });
  };

  const handleNavigate = (screen: string, params?: any) => {
    if (navigate) navigate(screen, params);
    else if (dispatch) dispatch({ type: 'NAVIGATE', payload: { screen, params } });
  };

  const runChecks = useCallback(async () => {
    if (phase === 'running') return;

    if (phase === 'done') {
      handleNavigate('SIMSwapApproved', { id_number: idNumber });
      return;
    }

    if (!idNumber) {
      setPhase('error');
      setBanner('No ID number found. Please start from the beginning.');
      return;
    }

    setPhase('running');
    setCompleted([]);
    setBanner('');
    setRiskScore('—');

    /* Animate checklist locally while API runs */
    let index = 0;
    const runNext = () => {
      if (index >= CHECKS.length) return;
      setCompleted((prev) => [...prev, CHECKS[index].key]);
      index += 1;
      timerRef.current = setTimeout(runNext, CHECKS[index - 1].duration);
    };
    timerRef.current = setTimeout(runNext, 400);

    try {
      const url = `${baseUrl}/api/v1/verifications`;
      console.log('[FraudIntelligence] POST', url, { id_number: idNumber, selfie_id: selfieId });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          id_number: idNumber,
          transaction: 'sim_swap',
          allow_fallback: true,
          consent: true,
          selfie_id: selfieId || null,
        }),
      });

      console.log('[FraudIntelligence] status:', response.status);

      if (!response.ok) {
        const text = await response.text();
        console.error('[FraudIntelligence] error body:', text);
        throw new Error(`Verification failed (${response.status})`);
      }

      const data = await response.json();
      console.log('[FraudIntelligence] response:', data);

      if (timerRef.current) clearTimeout(timerRef.current);

      /* Map backend checks to UI if available */
      if (data.checks && Array.isArray(data.checks)) {
        const passedChecks = data.checks
          .filter((c: any) => c.status === 'passed' || c.status === 'success')
          .map((c: any) => c.name || c.key);
        setCompleted(passedChecks.length > 0 ? passedChecks : CHECKS.map((c) => c.key));
      } else {
        setCompleted(CHECKS.map((c) => c.key));
      }

      if (data.status === 'approved' || data.status === 'success') {
        setPhase('done');
        setRiskScore('Low');
        timerRef.current = setTimeout(() => {
          handleNavigate('SIMSwapApproved', { id_number: idNumber });
        }, 600);
      } else {
        setPhase('error');
        setRiskScore('High');
        setBanner(data.reason || 'Unusual activity detected. Please contact support.');
      }
    } catch (err: any) {
      console.error('[FraudIntelligence] API error:', err);
      if (timerRef.current) clearTimeout(timerRef.current);
      setPhase('error');
      setBanner(err.message || 'Network error. Please try again.');
      setRiskScore('—');
    }
  }, [phase, idNumber, selfieId, baseUrl]);

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
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Typography variant="subtitle" style={styles.headerTitle}>
                Fraud Intelligence
            </Typography>
            <View style={styles.headerSpacer} />
          </View>

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

          <View style={styles.shieldContainer}>
            <Animated.View
              style={[
                styles.shield,
                {
                  backgroundColor: isError ? '#FEF3F1' : isDone ? '#E4F5EA' : '#FFF7DB',
                  borderColor: isError ? '#F3C9C3' : isDone ? '#C4E7D2' : '#F0DE9C',
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
                ? `Risk score: ${riskScore}`
                : isError
                  ? 'Risk score: High'
                  : isRunning
                    ? 'Analysing…'
                    : 'Tap start to begin'}
            </Typography>
          </View>

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
              onPress={runChecks}
              variant={isRunning ? 'outline' : 'primary'}
              disabled={isRunning}
              style={isRunning ? styles.buttonDisabled : styles.buttonPrimary}
            >
              {isRunning ? (
                <ActivityIndicator color="#14110C" />
              ) : isDone ? (
                'Continue'
              ) : isError ? (
                'Try again'
              ) : (
                'Start checks'
              )}
            </Button>
            {showSecondaryAction && (
              <Button onPress={() => {}} variant="outline" style={styles.secondaryButton}>
                    Need help?
              </Button>
            )}
          </View>

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
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
    paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#ECE8DF', backgroundColor: Colors.surface },
  checkRowPassed: { borderColor: '#C4E7D2', backgroundColor: '#F3FBF6' },
  checkRowCurrent: { borderColor: '#F0DE9C', backgroundColor: '#FFFCF2' },
  checkIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E2DFD7',
    alignItems: 'center', justifyContent: 'center' },
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