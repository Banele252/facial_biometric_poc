import React, { useState } from 'react';
import { View, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Typography, Card, Container, Button } from '@/components/ui';
import { Colors } from '@/theme';
import { useJourneyStore } from '@/store/useJourneyStore';

const FLAG_ICON = { uri: 'https://placehold.co/40x40?text=ZA' };
const GLOBE_ICON = { uri: 'https://placehold.co/40x40?text=INT' };
const MTN_LOGO = { uri: 'https://placehold.co/80x80?text=MTN' };

interface Props {
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
}

export function SAIDSelectionScreen({ navigate, goBack }: Props) {
  const [choice, setChoice] = useState<'sa' | 'foreign'>('sa');
  const setDocumentType = useJourneyStore((s) => s.setDocumentType);

  const handleContinue = () => {
    // This choice decides the rest of the journey: a passport skips the SA ID
    // checksum and skips Home Affairs entirely, because Home Affairs holds no
    // photo for a passport holder. Carrying it forward is what makes the
    // question on this screen mean something.
    setDocumentType(choice === 'sa' ? 'SA_ID' : 'PASSPORT');
    navigate('IdentityValidation');
  };

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <Container>
        <Card style={styles.cardContainer}>
          {/* MTN Logo */}
          <View style={styles.logoContainer}>
            <Image source={MTN_LOGO} style={styles.logo} resizeMode="contain" />
          </View>

          {/* Hero / Header */}
          <View style={styles.headerContainer}>
            <View style={styles.titleContainer}>
              <View style={styles.titleAccent} />
              <Typography variant="h1" style={styles.title}>
                  Do you have a{'\n'}South African ID?
              </Typography>
            </View>
            <Typography variant="body" color="textSecondary" style={styles.subtitle}>
                This helps us select the correct verification journey.
            </Typography>
          </View>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {/* SA ID Option */}
            <TouchableOpacity
              style={[styles.optionCard, choice === 'sa' && styles.optionCardSelected]}
              onPress={() => setChoice('sa')}
              activeOpacity={0.7}
            >
              <Image source={FLAG_ICON} style={styles.optionIcon} />
              <Typography variant="h2" style={styles.optionLabel}>
                  Yes, I have a South African ID
              </Typography>
              <View style={[styles.optionDot, choice === 'sa' && styles.optionDotSelected]}>
                <View style={[styles.optionTick, { opacity: choice === 'sa' ? 1 : 0 }]} />
              </View>
            </TouchableOpacity>

            {/* Foreign ID Option */}
            <TouchableOpacity
              style={[styles.optionCard, choice === 'foreign' && styles.optionCardSelected]}
              onPress={() => setChoice('foreign')}
              activeOpacity={0.7}
            >
              <Image source={GLOBE_ICON} style={styles.optionIcon} />
              <View style={styles.optionLabelContainer}>
                <Typography variant="h2" style={styles.optionLabel}>
                    No, I don’t have a South African ID
                </Typography>
                <Typography variant="caption" color="textSecondary" style={styles.optionSubLabel}>
                    Foreign ID holder
                </Typography>
              </View>
              <View style={[styles.optionDot, choice === 'foreign' && styles.optionDotSelected]}>
                <View style={[styles.optionTick, { opacity: choice === 'foreign' ? 1 : 0 }]} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Security Note */}
          <View style={styles.securityNote}>
            <View style={styles.securityIcon} />
            <Typography variant="caption" color="textSecondary" style={styles.securityText}>
                Your information is secure with us.
            </Typography>
          </View>

          {/* Actions */}
          <View style={styles.actionContainer}>
            <Button onPress={handleContinue} variant="primary">Continue</Button>
            <Button onPress={() => {}} variant="outline">Learn More</Button>
          </View>

          {/* Step Dots (4 steps, 1st active) */}
          <View style={styles.dotsContainer}>
            {[0, 1, 2, 3].map((index) => (
              <View
                key={index}
                style={[styles.dot, index === 0 ? styles.dotActive : styles.dotInactive]}
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
    paddingVertical: 32,
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: 92,
    height: 30,
    resizeMode: 'contain',
  },
  headerContainer: {
    width: '100%',
    marginBottom: 24,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 13,
    marginBottom: 10,
  },
  titleAccent: {
    width: 4,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  title: {
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
    marginLeft: 17,
  },
  optionsContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 18,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    width: '100%',
    padding: 16,
    minHeight: 80,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 2,
  },
  optionCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#FFF8E1',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    resizeMode: 'cover', // ✅ moved from style to prop
  },
  optionLabelContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
    textAlign: 'left',
    fontSize: 15.5,
    lineHeight: 21,
    fontWeight: '700',
    color: Colors.text,
  },
  optionSubLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  optionDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#DBD6CB',
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionDotSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  optionTick: {
    width: 13,
    height: 13,
    borderBottomWidth: 3.4,
    borderRightWidth: 3.4,
    borderColor: Colors.secondary,
    transform: [{ rotate: '45deg' }],
    marginTop: -2,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    marginBottom: 24,
  },
  securityIcon: {
    width: 14,
    height: 14,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: Colors.primary,
    position: 'relative',
  },
  securityText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  actionContainer: {
    width: '100%',
    gap: 10,
    marginBottom: 22,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
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