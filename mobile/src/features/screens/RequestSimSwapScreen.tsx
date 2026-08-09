// src/features/screens/RequestSimSwapScreen.tsx
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Button, Container } from '@/components/ui';

const { width, height } = Dimensions.get('window');

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
}

const GOLD = '#D4AF37';

const FEATURES = [
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Secure',
    subtitle: 'OTP and ID checks on every swap',
  },
  {
    icon: 'flash-outline' as const,
    title: 'Easy to do',
    subtitle: 'Three steps, about two minutes',
  },
  {
    icon: 'home-outline' as const,
    title: 'No store visit',
    subtitle: 'Finish the whole thing from home',
  },
];

export function RequestSimSwapScreen({ navigate, goBack }: Props) {
  const [consentChecked, setConsentChecked] = useState(false);

  const handleContinue = () => {
    if (!consentChecked) return;
    navigate?.('SAIDSelection');
  };

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />

      {/* Gold dot pattern — top right */}
      <View style={styles.dotsPattern}>
        {[...Array(6)].map((_, row) => (
          <View key={row} style={styles.dotRow}>
            {[...Array(6)].map((_, col) => (
              <View key={col} style={styles.dot} />
            ))}
          </View>
        ))}
      </View>

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={goBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#14110C" />
        </Pressable>
        <Typography variant="body" style={styles.topBarTitle}>
            SIM Swap
        </Typography>
        <View style={styles.shieldIcon}>
          <Ionicons name="shield-checkmark-outline" size={22} color="#14110C" />
        </View>
      </View>

      <Container style={styles.container}>
        {/* Title with yellow accent bar */}
        <View style={styles.titleContainer}>
          <View style={styles.accentLine} />
          <View style={{ flex: 1 }}>
            <Typography variant="h1" align="left" style={styles.headline}>
                Request a SIM Swap
            </Typography>
            <Typography variant="body" style={styles.subline}>
                Replace your SIM card{'\n'}quickly and securely.
            </Typography>
          </View>
        </View>

        {/* Feature card */}
        <View style={styles.featureCard}>
          {FEATURES.map((feature, index) => (
            <View key={feature.title}>
              <View style={styles.featureRow}>
                <View style={styles.iconCircle}>
                  <Ionicons name={feature.icon} size={20} color="#14110C" />
                </View>
                <View style={styles.featureText}>
                  <Typography variant="body" style={styles.featureTitle}>
                    {feature.title}
                  </Typography>
                  <Typography variant="caption" style={styles.featureSubtitle}>
                    {feature.subtitle}
                  </Typography>
                </View>
              </View>
              {index < FEATURES.length - 1 && (
                <View style={styles.divider} />
              )}
            </View>
          ))}
        </View>

        {/* Consent Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setConsentChecked((prev) => !prev)}
          style={[
            styles.consentCard,
            consentChecked && styles.consentCardActive,
          ]}
        >
          <Typography variant="body" style={styles.consentTitle}>
              Identity Verification Consent
          </Typography>
          <View style={styles.consentBody}>
            <View style={[
              styles.checkbox,
              consentChecked && styles.checkboxActive,
            ]}>
              {consentChecked && (
                <Ionicons name="checkmark" size={14} color="#14110C" />
              )}
            </View>
            <Typography variant="caption" style={styles.consentText}>
                I consent to MTN verifying my identity using secure technology
              and third-party services to process my SIM Swap request.
            </Typography>
          </View>
        </TouchableOpacity>
      </Container>

      {/* Bottom buttons */}
      <View style={styles.bottomActions}>
        <Container style={styles.bottomContainer}>
          <View style={styles.buttonGroup}>
            <Button
              variant="primary"
              size="lg"
              onPress={handleContinue}
              disabled={!consentChecked}
              style={[
                styles.primaryBtn,
                !consentChecked && styles.primaryBtnDisabled,
              ]}
            >
                Continue
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onPress={() => goBack?.()}
            >
                Not now
            </Button>
            <View style={styles.homeIndicator} />
          </View>
        </Container>

        {/* Progress dots — 4 dots, first active */}
        <View style={styles.dotsContainer}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i === 0 ? styles.progressDotActive : styles.progressDotInactive,
              ]}
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#FBF7EE',
  },
  dotsPattern: {
    position: 'absolute',
    top: height * 0.06,
    right: width * 0.06,
    zIndex: 0,
  },
  dotRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  dot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
    backgroundColor: GOLD,
    marginHorizontal: 5,
    opacity: 0.35,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 6,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E4DA',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: '#14110C',
  },
  shieldIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 24,
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 28,
  },
  accentLine: {
    width: 4,
    borderRadius: 4,
    backgroundColor: '#FFCB05',
    marginTop: 6,
    height: 28,
  },
  headline: {
    fontWeight: '800',
    fontSize: 26,
    lineHeight: 32,
    color: '#14110C',
  },
  subline: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B6559',
    lineHeight: 22,
    marginTop: 6,
  },
  featureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EFEBE1',
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 18,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF7DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: '#14110C',
    lineHeight: 22,
  },
  featureSubtitle: {
    fontWeight: '500',
    fontSize: 14,
    color: '#8A8376',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0EBE3',
    marginLeft: 60,
  },
  consentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#EFEBE1',
    padding: 16,
    marginBottom: 16,
  },
  consentCardActive: {
    borderColor: '#FFCB05',
    backgroundColor: '#FFFCF2',
  },
  consentTitle: {
    fontWeight: '700',
    fontSize: 15,
    color: '#14110C',
    marginBottom: 12,
  },
  consentBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D1CCC4',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: '#FFCB05',
    borderColor: '#FFCB05',
  },
  consentText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
    color: '#6B6559',
  },
  bottomActions: {
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: '#FBF7EE',
    borderTopWidth: 1,
    borderTopColor: '#EFEBE1',
  },
  bottomContainer: {
    paddingHorizontal: 24,
  },
  buttonGroup: {
    gap: 12,
    width: '100%',
  },
  primaryBtn: {
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFCB05',
  },
  primaryBtnDisabled: {
    backgroundColor: '#F5EFDC',
  },
  homeIndicator: {
    width: 134,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(20,17,12,0.25)',
    alignSelf: 'center',
    marginTop: 8,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 18,
  },
  progressDot: {
    height: 7,
    borderRadius: 4,
  },
  progressDotActive: {
    width: 22,
    backgroundColor: '#FFCB05',
  },
  progressDotInactive: {
    width: 7,
    backgroundColor: '#E2DFD7',
  },
});