import React, { useState } from 'react';
import { View, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Card, Container, Button } from '@/components/ui';
import { Colors } from '@/theme';
import { useJourneyStore } from '@/store/useJourneyStore';

interface Props {
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
}

export function RequestSimSwapScreen({ navigate, goBack }: Props) {
  const [consented, setConsented] = useState(false);
  const setConsent = useJourneyStore((s) => s.setConsent);

  const handleContinue = () => {
    if (!consented) return;
    // The backend refuses to run any check without this, so the consent given
    // here has to travel with the verification rather than stopping at this
    // screen's local state.
    setConsent(true);
    navigate('SAIDSelection');
  };

  const handleNotNow = () => {
    navigate('Splash');
  };

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <Container>
        <Card style={styles.cardContainer}>
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={goBack}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </Pressable>
            <Typography variant="subtitle" style={styles.headerTitle}>
                SIM Swap
            </Typography>
            <View style={styles.shieldIcon}>
              <Ionicons name="shield-checkmark" size={18} color={Colors.text} />
            </View>
          </View>

          <View style={styles.headlineContainer}>
            <View style={[styles.titleAccent, { backgroundColor: Colors.primary }]} />
            <View style={styles.headlineTextContainer}>
              <Typography variant="h1" style={styles.headline}>
                  Request a SIM Swap
              </Typography>
              <Typography variant="body" color="textSecondary" style={styles.headlineSub}>
                  Replace your SIM card quickly and securely.
              </Typography>
            </View>
          </View>

          <View style={styles.benefitsContainer}>
            <View style={styles.benefitItem}>
              <View style={styles.benefitIcon}>
                <Ionicons name="shield-checkmark" size={16} color={Colors.text} />
              </View>
              <View style={styles.benefitTextContainer}>
                <Typography variant="body" style={styles.benefitTitle}>
                    Secure
                </Typography>
                <Typography variant="caption" color="textSecondary" style={styles.benefitDetail}>
                    OTP and ID checks on every swap
                </Typography>
              </View>
            </View>

            <View style={styles.benefitItem}>
              <View style={styles.benefitIcon}>
                <Ionicons name="flash" size={16} color={Colors.text} />
              </View>
              <View style={styles.benefitTextContainer}>
                <Typography variant="body" style={styles.benefitTitle}>
                    Easy to do
                </Typography>
                <Typography variant="caption" color="textSecondary" style={styles.benefitDetail}>
                    Three steps, about two minutes
                </Typography>
              </View>
            </View>

            <View style={[styles.benefitItem, styles.benefitItemLast]}>
              <View style={styles.benefitIcon}>
                <Ionicons name="home" size={16} color={Colors.text} />
              </View>
              <View style={styles.benefitTextContainer}>
                <Typography variant="body" style={styles.benefitTitle}>
                    No store visit
                </Typography>
                <Typography variant="caption" color="textSecondary" style={styles.benefitDetail}>
                    Finish the whole thing from home
                </Typography>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.consentCard, consented && styles.consentCardActive]}
            onPress={() => setConsented((v) => !v)}
            activeOpacity={0.8}
          >
            <View style={styles.consentIcon}>
              <Ionicons
                name={consented ? 'checkbox' : 'square-outline'}
                size={22}
                color={consented ? Colors.primary : '#B0AA9D'}
              />
            </View>
            <View style={styles.consentTextContainer}>
              <Typography variant="body" style={styles.consentTitle}>
                  Identity Verification Consent
              </Typography>
              <Typography variant="caption" color="textSecondary" style={styles.consentDetail}>
                  I consent to MTN verifying my identity using secure
                  technology and third-party services to process my
                  SIM Swap request.
              </Typography>
            </View>
          </TouchableOpacity>

          <View style={styles.otpNote}>
            <Ionicons name="lock-closed" size={14} color="#C9A000" />
            <Typography variant="caption" color="textSecondary" style={styles.otpText}>
                You&apos;ll confirm with a one-time PIN.
            </Typography>
          </View>

          <View style={styles.spacer} />

          <View style={styles.actionContainer}>
            <Button
              onPress={handleContinue}
              variant="primary"
              disabled={!consented}
              style={[
                styles.buttonPrimary,
                consented && styles.buttonPrimaryGlow,
              ]}
            >
                Continue
            </Button>
            <Button onPress={handleNotNow} variant="outline" style={styles.secondaryButton}>
                Not now
            </Button>
          </View>

          <View style={styles.dotsContainer}>
            {Array.from({ length: 10 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === 0 ? styles.dotActive : styles.dotInactive,
                ]}
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
  shieldIcon: { width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#FFF7DB', alignItems: 'center', justifyContent: 'center' },
  headlineContainer: { flexDirection: 'row', alignItems: 'stretch', gap: 13, marginBottom: 28 },
  titleAccent: { width: 4, borderRadius: 4 },
  headlineTextContainer: { flex: 1, gap: 10 },
  headline: { fontSize: 27, lineHeight: 32, fontWeight: '800', color: Colors.text, letterSpacing: -0.7 },
  headlineSub: { fontSize: 14.5, lineHeight: 22, fontWeight: '500', maxWidth: 260 },
  benefitsContainer: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 20,
    backgroundColor: Colors.surface, paddingVertical: 6, paddingHorizontal: 18 },
  benefitItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F4F1EA' },
  benefitItemLast: { borderBottomWidth: 0 },
  benefitIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#FFF7DB',
    alignItems: 'center', justifyContent: 'center' },
  benefitTextContainer: { flex: 1 },
  benefitTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  benefitDetail: { fontSize: 12.5, fontWeight: '500', marginTop: 1 },
  consentCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginTop: 18, padding: 16,
    borderRadius: 18, borderWidth: 1.5, borderColor: '#ECE8DF', backgroundColor: Colors.surface },
  consentCardActive: { borderColor: Colors.primary, backgroundColor: '#FFF8E1' },
  consentIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  consentTextContainer: { flex: 1, gap: 4 },
  consentTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  consentDetail: { fontSize: 12.5, fontWeight: '500', lineHeight: 18 },
  otpNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  otpText: { fontSize: 12.5, fontWeight: '500' },
  spacer: { flex: 1 },
  actionContainer: { gap: 10, marginTop: 24 },
  buttonPrimary: { backgroundColor: '#F5EFDC', color: '#A39B88' },
  buttonPrimaryGlow: { backgroundColor: Colors.primary, color: Colors.text },
  secondaryButton: { backgroundColor: Colors.surface, borderWidth: 1.5,
    borderColor: Colors.borderLight },
  dotsContainer: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', paddingVertical: 22 },
  dot: { height: 7, borderRadius: 4 },
  dotActive: { width: 22, backgroundColor: Colors.primary },
  dotInactive: { width: 7, backgroundColor: '#E2DFD7' },
});