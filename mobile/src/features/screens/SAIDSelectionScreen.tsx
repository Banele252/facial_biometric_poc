// src/features/screens/SAIDSelectionScreen.tsx
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  Pressable,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Container, Button } from '@/components/ui';

const { width, height } = Dimensions.get('window');

interface Props {
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
}

const GOLD = '#D4AF37';

export function SAIDSelectionScreen({ navigate, goBack }: Props) {
  const [choice, setChoice] = useState<'sa' | 'foreign'>('sa');

  const handleContinue = () => {
    navigate('IdentityValidation');
  };

  const handleBack = () => {
    goBack?.();
  };

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />

      {/* Gold dot pattern — top left */}
      <View style={styles.dotsPattern}>
        {[...Array(4)].map((_, row) => (
          <View key={row} style={styles.dotRow}>
            {[...Array(4)].map((_, col) => (
              <View key={col} style={styles.dot} />
            ))}
          </View>
        ))}
      </View>

      {/* Top bar with back button */}
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#14110C" />
        </Pressable>
        <View style={styles.placeholder} />
      </View>

      <Container style={styles.container}>
        {/* Title with yellow accent bar */}
        <View style={styles.titleContainer}>
          <View style={styles.accentLine} />
          <Typography variant="h1" style={styles.headline}>
              Do you have a{'\n'}South African ID?
          </Typography>
        </View>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {/* SA ID Option */}
          <TouchableOpacity
            style={[
              styles.optionCard,
              choice === 'sa' && styles.optionCardSelected,
            ]}
            onPress={() => setChoice('sa')}
            activeOpacity={0.7}
          >
            <View style={styles.flagIcon}>
              <Image
                source={{ uri: 'https://flagcdn.com/80x60/za.png' }}
                style={styles.flagImage}
              />
            </View>
            <Typography variant="body" style={styles.optionLabel}>
                Yes, I have a South African ID
            </Typography>
            <View
              style={[
                styles.checkCircle,
                choice === 'sa' && styles.checkCircleSelected,
              ]}
            >
              {choice === 'sa' && (
                <Ionicons name="checkmark" size={16} color="#14110C" />
              )}
            </View>
          </TouchableOpacity>

          {/* Foreign ID Option */}
          <TouchableOpacity
            style={[
              styles.optionCard,
              choice === 'foreign' && styles.optionCardSelected,
            ]}
            onPress={() => setChoice('foreign')}
            activeOpacity={0.7}
          >
            <View style={styles.globeIcon}>
              <Ionicons name="globe-outline" size={22} color="#8A8376" />
            </View>
            <Typography variant="body" style={styles.optionLabel}>
                No, I don{'\u2019'}t have a South African ID
            </Typography>
            <View
              style={[
                styles.checkCircle,
                choice === 'foreign' && styles.checkCircleSelected,
              ]}
            >
              {choice === 'foreign' && (
                <Ionicons name="checkmark" size={16} color="#14110C" />
              )}
            </View>
          </TouchableOpacity>
        </View>
      </Container>

      {/* Bottom buttons — exact SplashScreen spacing */}
      <View style={styles.bottomActions}>
        <Container style={styles.bottomContainer}>
          <View style={styles.buttonGroup}>
            <Button variant="primary" size="lg" onPress={handleContinue}>
                Continue
            </Button>
            <Button variant="secondary" size="lg" onPress={() => {}}>
                Learn More
            </Button>
            <View style={styles.homeIndicator} />
          </View>
        </Container>

        {/* Progress dots — 4 dots, 2nd active */}
        <View style={styles.dotsContainer}>
          {[0, 1, 2, 3].map((index) => (
            <View
              key={index}
              style={[
                styles.progressDot,
                index === 1
                  ? styles.progressDotActive
                  : styles.progressDotInactive,
              ]}
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#FBF7EE' },
  dotsPattern: {
    position: 'absolute',
    top: height * 0.06,
    left: width * 0.06,
    zIndex: 0,
  },
  dotRow: { flexDirection: 'row', marginBottom: 7 },
  dot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
    backgroundColor: GOLD,
    marginHorizontal: 6,
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
  placeholder: { width: 40, height: 40 },
  container: {
    flex: 1,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 32,
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
    letterSpacing: -0.5,
  },
  optionsContainer: { gap: 12 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#EFEBE1',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  optionCardSelected: {
    borderColor: '#FFCB05',
    backgroundColor: '#FFF8E1',
    shadowColor: '#FFCB05',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  flagIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  flagImage: { width: 40, height: 40, resizeMode: 'cover' },
  globeIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    flex: 1,
    fontSize: 15.5,
    lineHeight: 21,
    fontWeight: '700',
    color: '#14110C',
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D1CCC4',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircleSelected: {
    borderColor: '#FFCB05',
    backgroundColor: '#FFCB05',
  },
  bottomActions: {
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: '#FBF7EE',
    borderTopWidth: 1,
    borderTopColor: '#EFEBE1',
  },
  bottomContainer: { paddingHorizontal: 24 },
  buttonGroup: { gap: 12, width: '100%' },
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
  progressDot: { height: 7, borderRadius: 4 },
  progressDotActive: { width: 22, backgroundColor: '#FFCB05' },
  progressDotInactive: { width: 7, backgroundColor: '#E2DFD7' },
});

export default SAIDSelectionScreen;