import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  // @ts-ignore Clipboard is deprecated but still present in many Expo/RN builds
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Typography, Card, Container, Button } from '@/components/ui';
import { Colors } from '@/theme';

interface Props {
  dispatch: (action: any) => void;
  reference?: string;
  nextStepCount?: number;
  showConfetti?: boolean;
  showCopy?: boolean;
  showSecondaryAction?: boolean;
  stepCount?: number;
  activeStep?: number;
}

export default function SIMSwapCompleteScreen({
  dispatch,
  reference = 'S1234567890',
  nextStepCount = 3,
  showConfetti = true,
  showCopy = true,
  showSecondaryAction = true,
  stepCount = 6,
  activeStep = 6,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [containerWidth, setContainerWidth] = useState(300);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyRef = () => {
     
    Clipboard.setString(reference);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 1800);
  };

  const handleDone = () => {
    dispatch({ type: 'NAVIGATE', payload: { screen: 'Splash' } });
  };

  const nextSteps = [
    'Insert your new SIM card',
    'Restart your phone if needed',
    'Dial *123# to confirm activation',
  ].slice(0, nextStepCount);

  const colors = ['#FFCB05', '#2FA96B', '#14110C', '#FF7A59', '#4A90D9'];

  const totalDots = stepCount;
  const activeDot = Math.min(Math.max(activeStep, 1), totalDots) - 1;

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <Container>
        <Card style={styles.cardContainer}>
          {/* Confetti */}
          {showConfetti && (
            <View
              style={styles.confettiContainer}
              pointerEvents="none"
              onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
            >
              {Array.from({ length: 18 }).map((_, i) => {
                const r = (n: number) =>
                  ((i * 9301 + n * 49297) % 233280) / 233280;
                return (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      left: Math.round(((6 + r(1) * 88) / 100) * containerWidth),
                      top: Math.round(r(0) * 280),
                      width: r(2) > 0.5 ? 7 : 5,
                      height: r(3) > 0.5 ? 9 : 5,
                      borderRadius: r(4) > 0.6 ? 4 : 2,
                      backgroundColor: colors[i % colors.length],
                      opacity: r(5) > 0.3 ? 0.8 : 0.4,
                    }}
                  />
                );
              })}
            </View>
          )}

          {/* Success Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.icon}>
              <View style={styles.iconInner} />
            </View>
          </View>

          {/* Headline */}
          <View style={styles.headlineContainer}>
            <Typography variant="h1" style={styles.headline}>
                SIM Swap Complete
            </Typography>
            <Typography variant="body" color="textSecondary" style={styles.subline}>
                Your new SIM is now active. You can start using it shortly.
            </Typography>
          </View>

          {/* Reference Card */}
          <View style={styles.referenceContainer}>
            <View style={styles.referenceTextContainer}>
              <Typography
                variant="caption"
                color="textSecondary"
                style={[styles.referenceLabel, { fontWeight: '600' }]}
              >
                  Reference number
              </Typography>
              <Typography variant="h2" style={styles.referenceValue}>
                {reference}
              </Typography>
            </View>
            {showCopy && (
              <TouchableOpacity
                onPress={copyRef}
                style={[styles.copyButton, copied && styles.copyButtonSuccess]}
              >
                <Typography
                  variant="caption"
                  style={[styles.copyButtonText, { fontWeight: '700' }]}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Typography>
              </TouchableOpacity>
            )}
          </View>

          {/* Next Steps */}
          <View style={styles.nextStepsContainer}>
            <Typography variant="body" style={styles.nextStepsTitle}>
                What is next?
            </Typography>
            <View style={styles.nextStepsList}>
              {nextSteps.map((text, i) => (
                <View
                  key={i}
                  style={[
                    styles.nextStepRow,
                    i === nextSteps.length - 1 && styles.nextStepRowLast,
                  ]}
                >
                  <View style={styles.nextStepNumber}>
                    <Typography
                      variant="caption"
                      style={[styles.nextStepNumberText, { fontWeight: '800' }]}
                    >
                      {i + 1}
                    </Typography>
                  </View>
                  <Typography variant="body" style={styles.nextStepText}>
                    {text}
                  </Typography>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.spacer} />

          {/* Actions */}
          <View style={styles.actionContainer}>
            <Button onPress={handleDone} variant="primary">
                Done
            </Button>
            {showSecondaryAction && (
              <Button
                onPress={() => {}}
                variant="outline"
                style={styles.secondaryButton}
              >
                    Something is wrong
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
  shell: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  cardContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confettiContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 60,
    height: 300,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  iconContainer: {
    width: 92,
    height: 92,
    marginTop: 44,
    marginBottom: 24,
  },
  icon: {
    ...StyleSheet.absoluteFill,
    borderRadius: 46,
    backgroundColor: '#1E9E5F',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1E9E5F',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 28,
    elevation: 10,
  },
  iconInner: {
    width: 42,
    height: 42,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: Colors.surface,
    transform: [{ rotate: '45deg' }],
  },
  headlineContainer: {
    alignItems: 'center',
    gap: 9,
    marginBottom: 24,
  },
  headline: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  subline: {
    fontSize: 14.5,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 268,
  },
  referenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#C4E7D2',
    borderRadius: 20,
    backgroundColor: '#F3FBF6',
    padding: 16,
    marginBottom: 16,
  },
  referenceTextContainer: {
    flex: 1,
    gap: 3,
  },
  referenceLabel: {
    fontSize: 12.5,
    color: '#57806A',
  },
  referenceValue: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1B7A4B',
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'],
  },
  copyButton: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#C4E7D2',
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyButtonSuccess: {
    borderColor: '#2FA96B',
    backgroundColor: '#2FA96B',
  },
  copyButtonText: {
    fontSize: 13.5,
    color: '#1B7A4B',
  },
  nextStepsContainer: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#ECE8DF',
    borderRadius: 20,
    backgroundColor: Colors.surface,
    padding: 16,
    paddingBottom: 6,
    shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 2,
  },
  nextStepsTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  nextStepsList: {
    marginTop: 4,
  },
  nextStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F1EA',
  },
  nextStepRowLast: {
    borderBottomWidth: 0,
  },
  nextStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#FFF7DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextStepNumberText: {
    fontSize: 12,
    color: Colors.text,
  },
  nextStepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#4A453D',
  },
  spacer: {
    flex: 1,
  },
  actionContainer: {
    gap: 10,
    width: '100%',
    marginTop: 24,
  },
  secondaryButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: '#F0DE9C',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 22,
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