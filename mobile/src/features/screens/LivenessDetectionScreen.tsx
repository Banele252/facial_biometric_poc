import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: any) => void;
  routeParams?: Record<string, unknown>;
  simulateFailure?: boolean;
  showSteps?: boolean;
  showSecondaryAction?: boolean;
  ctaEmphasis?: 'glow' | 'flat';
  stepCount?: number;
  activeStep?: number;
}

export default function LivenessDetectionScreen({
  navigate,
  goBack,
  dispatch,
  simulateFailure = false,
  showSteps = true,
  showSecondaryAction = true,
  ctaEmphasis = 'glow',
  stepCount = 10,
  activeStep = 7,
}: Props) {
  const PROMPTS = ['Blink', 'Turn your head left', 'Smile'];
  const [phase, setPhase] = useState<'ready' | 'running' | 'done' | 'error'>('ready');
  const [step, setStep] = useState(0);
  const [banner, setBanner] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const advanceRef = useRef<(() => void) | null>(null);

  const breatheAnim = useMemo(() => new Animated.Value(0), []);
  const sweepAnim = useMemo(() => new Animated.Value(0), []);

  const breatheScale = useMemo(
    () =>
      breatheAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.035],
      }),
    [breatheAnim],
  );

  const sweepTranslateY = useMemo(
    () =>
      sweepAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-118, 118],
      }),
    [sweepAnim],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase === 'running') {
      const breathe = Animated.loop(
        Animated.sequence([
          Animated.timing(breatheAnim, {
            toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
          Animated.timing(breatheAnim, {
            toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
        ]),
      );
      const sweep = Animated.loop(
        Animated.sequence([
          Animated.timing(sweepAnim, {
            toValue: 1, duration: 1900, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
          Animated.timing(sweepAnim, {
            toValue: 0, duration: 1900, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
        ]),
      );
      breathe.start();
      sweep.start();
      return () => { breathe.stop(); sweep.stop(); };
    } else {
      breatheAnim.stopAnimation();
      breatheAnim.setValue(0);
      sweepAnim.stopAnimation();
      sweepAnim.setValue(0);
    }
    return undefined;
  }, [phase, breatheAnim, sweepAnim]);

  const advance = useCallback(() => {
    setStep((prev) => {
      const next = prev + 1;
      if (simulateFailure && next === 2) {
        setPhase('error');
        setBanner(
          'We did not detect the movement. Hold your phone at eye level and try again.',
        );
        return prev;
      }
      if (next >= PROMPTS.length) {
        setPhase('done');
        return prev;
      }
      timerRef.current = setTimeout(() => advanceRef.current?.(), 2200);
      return next;
    });
  }, [simulateFailure, PROMPTS.length]);

  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

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

  const start = () => {
    if (phase === 'running') return;
    if (phase === 'done') {
      handleNavigate('FraudIntelligenceChecks');
      return;
    }
    setPhase('running');
    setStep(0);
    setBanner('');
    timerRef.current = setTimeout(() => advanceRef.current?.(), 2200);
  };

  const dismissBanner = () => {
    setBanner('');
    setPhase('ready');
    setStep(0);
  };

  const isRunning = phase === 'running';
  const isDone = phase === 'done';
  const isError = phase === 'error';
  const total = PROMPTS.length;
  const progress = isDone ? 1 : (isRunning || isError) ? step / total : 0;
  const rotation = -90 + progress * 360;
  const accent = isError ? '#E0574A' : isDone ? '#2FA96B' : isRunning ? '#2FA96B' : Colors.primary;

  const stepsList = PROMPTS.map((label, i) => {
    const passed = isDone || i < step;
    const current = isRunning && i === step;
    return {
      label,
      style: {
        fontSize: 12.5,
        fontWeight: '600' as const,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: passed ? '#E4F5EA' : current ? '#FFF7DB' : Colors.surface,
        color: passed ? '#1F7A4C' : current ? Colors.text : '#6B6559',
        borderWidth: 1,
        borderColor: passed ? '#C4E7D2' : current ? Colors.primary : '#ECE8DF',
      },
    };
  });

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
                Liveness Detection
            </Typography>
            <View style={styles.headerSpacer} />
          </View>

          {/* Headline */}
          <View style={styles.headlineContainer}>
            <View style={[styles.titleAccent, { backgroundColor: Colors.primary }]} />
            <Typography variant="h1" style={styles.headline}>
                Follow the on-screen instructions
            </Typography>
          </View>

          {/* Circle */}
          <View style={styles.circleContainer}>
            <Animated.View style={[styles.circleInner, { transform: [{ scale: breatheScale }] }]}>
              <View style={styles.circleBackground} />
              <View style={styles.circleGrid} />
              <View style={styles.circleFace} />
              {isRunning && (
                <Animated.View
                  style={[
                    styles.sweepLine,
                    { transform: [{ translateY: sweepTranslateY }] },
                  ]}
                />
              )}
            </Animated.View>

            {/* Live Badge */}
            <View style={styles.liveBadge}>
              <View
                style={[
                  styles.liveDot,
                  isError
                    ? styles.liveDotError
                    : isDone
                      ? styles.liveDotDone
                      : styles.liveDotRunning,
                ]}
              />
              <Typography variant="caption" style={styles.liveLabel}>
                {isDone ? 'Verified' : isError ? 'Paused' : isRunning ? 'Live' : 'Camera ready'}
              </Typography>
            </View>

            {/* Progress Ring */}
            <View style={styles.ringWrapper}>
              <View style={styles.ringTrack} />
              <Animated.View
                style={[
                  styles.ringProgress,
                  {
                    borderTopColor: accent,
                    borderRightColor: accent,
                    borderBottomColor: 'transparent',
                    borderLeftColor: 'transparent',
                    transform: [{ rotate: `${rotation}deg` }],
                  },
                ]}
              />
            </View>

            {/* Halo */}
            <Animated.View
              style={[
                styles.halo,
                {
                  shadowColor: isRunning
                    ? '#2FA96B'
                    : isDone
                      ? '#2FA96B'
                      : isError
                        ? '#E0574A'
                        : 'transparent',
                  opacity: isRunning || isDone || isError ? 1 : 0,
                },
              ]}
            />
          </View>

          {/* Prompt */}
          <View style={styles.promptContainer}>
            <Typography variant="h2" style={styles.promptLabel}>
              {isDone
                ? 'All done'
                : isError
                  ? 'Try again'
                  : isRunning
                    ? PROMPTS[step]
                    : 'Prove it is a live person'}
            </Typography>
            <View style={styles.feedbackRow}>
              <View style={[styles.feedbackDot, (isRunning || isDone) && styles.feedbackDotActive]}>
                {(isRunning || isDone) && (
                  <Ionicons name="checkmark" size={10} color="#FFF" />
                )}
              </View>
              <Typography
                variant="body"
                style={[
                  styles.feedbackText,
                  isError && styles.feedbackTextError,
                  (isRunning || isDone) && styles.feedbackTextSuccess,
                ]}
              >
                {isDone
                  ? 'Liveness confirmed'
                  : isError
                    ? 'No movement detected'
                    : isRunning
                      ? 'Looking good…'
                      : 'Three quick actions, about ten seconds'}
              </Typography>
            </View>
          </View>

          {/* Steps */}
          {showSteps && !banner && (
            <View style={styles.stepsContainer}>
              {stepsList.map((item, idx) => (
                <View key={idx} style={item.style}>
                  <Typography variant="caption" style={{ color: item.style.color }}>
                    {item.label}
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
              onPress={start}
              variant={isRunning ? 'outline' : 'primary'}
              disabled={isRunning}
              style={isRunning ? styles.buttonDisabled : styles.buttonPrimary}
            >
              {isRunning
                ? 'Detecting…'
                : isDone
                  ? 'Continue'
                  : isError
                    ? 'Try again'
                    : 'Start liveness check'}
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
  cardContainer: { paddingHorizontal: 24, paddingVertical: 16, alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  backButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#EFEBE1',
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15.5, fontWeight: '700', color: Colors.text },
  headerSpacer: { width: 42 },
  headlineContainer: { flexDirection: 'row', alignItems: 'stretch', gap: 13, width: '100%', marginBottom: 24 },
  titleAccent: { width: 4, borderRadius: 4 },
  headline: { fontSize: 25, lineHeight: 30, fontWeight: '800', color: Colors.text, letterSpacing: -0.6, maxWidth: 262 },
  circleContainer: { position: 'relative', width: 258, height: 258, marginBottom: 24 },
  circleInner: { position: 'absolute', inset: 8, borderRadius: 121, overflow: 'hidden', backgroundColor: '#1C1A16' },
  circleBackground: { ...StyleSheet.absoluteFill, backgroundColor: '#1C1A16' },
  circleGrid: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent' },
  circleFace: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
  sweepLine: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: 'rgba(47,169,107,0.9)',
    shadowColor: '#2FA96B', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 16, elevation: 10 },
  liveBadge: { position: 'absolute', bottom: 18, left: '50%', transform: [{ translateX: -50 }], flexDirection: 'row',
    alignItems: 'center', gap: 6, paddingVertical: 5,
    paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(18,16,13,0.72)' },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  liveDotRunning: { backgroundColor: '#FF4D3D' },
  liveDotDone: { backgroundColor: '#2FA96B' },
  liveDotError: { backgroundColor: '#E0574A' },
  liveLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: '#FFFFFF', textTransform: 'uppercase' },
  ringWrapper: { position: 'absolute', inset: 0 },
  ringTrack: { ...StyleSheet.absoluteFill, borderRadius: 129, borderWidth: 6, borderColor: '#EDE9E0' },
  ringProgress: { ...StyleSheet.absoluteFill, borderRadius: 129, borderWidth: 6 },
  halo: { position: 'absolute', inset: 8, borderRadius: 121, shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10, elevation: 8 },
  promptContainer: { alignItems: 'center', gap: 12, marginBottom: 20 },
  promptLabel: { fontSize: 18, fontWeight: '800', color: Colors.text, letterSpacing: -0.4 },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedbackDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#7A746A',
    justifyContent: 'center', alignItems: 'center' },
  feedbackDotActive: { borderColor: '#2FA96B', backgroundColor: '#2FA96B' },
  feedbackText: { fontSize: 13.5, fontWeight: '600', color: '#7A746A' },
  feedbackTextError: { color: '#C0362C' },
  feedbackTextSuccess: { color: '#1F7A4C' },
  stepsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 20 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#F3C9C3',
    borderRadius: 16, backgroundColor: '#FEF3F1', padding: 13, width: '100%', marginBottom: 16 },
  bannerIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#FBE3E0',
    justifyContent: 'center', alignItems: 'center' },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#7A2820', lineHeight: 19 },
  bannerClose: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  spacer: { flex: 1 },
  actionContainer: { gap: 10, width: '100%', marginTop: 16 },
  buttonPrimary: { backgroundColor: Colors.primary },
  buttonDisabled: { backgroundColor: '#F5EFDC', color: '#A39B88' },
  secondaryButton: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: '#F0DE9C' },
  dotsContainer: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', paddingVertical: 22 },
  dot: { height: 7, borderRadius: 4 },
  dotActive: { width: 22, backgroundColor: Colors.primary },
  dotInactive: { width: 7, backgroundColor: '#E2DFD7' },
});