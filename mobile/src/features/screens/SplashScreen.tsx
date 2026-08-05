import React from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Typography, Button, Container } from '@/components/ui';

const { width, height } = Dimensions.get('window');

interface Props {
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
}

export default function SplashScreen({ navigate, goBack }: Props) {
  return (
    <View style={styles.shell}>
      <StatusBar style="dark" />

      {/* Full-screen background photo */}
      <View style={styles.imageContainer}>
        <Image
          source={require('../../../assets/splash-photo.png')}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={[
            'rgba(251,247,238,1)',
            'rgba(251,247,238,0.92)',
            'rgba(251,247,238,0.6)',
            'rgba(251,247,238,0.15)',
            'rgba(255,255,255,0)',
          ]}
          locations={[0, 0.25, 0.45, 0.6, 0.75]}
          style={styles.gradient}
        />
      </View>

      {/* Gold dot pattern */}
      <View style={styles.dotsContainer}>
        {[...Array(5)].map((_, row) => (
          <View key={row} style={styles.dotRow}>
            {[...Array(5)].map((_, col) => (
              <View key={col} style={styles.dot} />
            ))}
          </View>
        ))}
      </View>

      <Container style={styles.container}>
        {/* Top: Logo + Headline */}
        <View style={styles.topSection}>
          <Image
            source={require('../../../assets/mtn-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Typography variant="h1" align="center" style={styles.headline}>
              Secure. Simple. Yours.
          </Typography>
        </View>

        {/* Bottom: Buttons + Home Indicator */}
        <View style={styles.bottomSection}>
          <Button
            variant="primary"
            size="lg"
            onPress={() => navigate('RequestSimSwap')}
          >
              Request SIM Swap
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onPress={() => alert('Learn More pressed')}
          >
              Learn More
          </Button>
          <View style={styles.homeIndicator} />
        </View>
      </Container>
    </View>
  );
}

const GOLD = '#D4AF37';

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#FBF7EE',
  },
  imageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dotsContainer: {
    position: 'absolute',
    top: height * 0.12,
    right: width * 0.10,
    zIndex: 2,
  },
  dotRow: {
    flexDirection: 'row',
    marginBottom: 7,
  },
  dot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
    backgroundColor: GOLD,
    marginHorizontal: 6,
    opacity: 0.45,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: height * 0.10,
    paddingBottom: 4,
    paddingHorizontal: 24,
    zIndex: 1,
  },
  topSection: {
    alignItems: 'center',
    gap: 18,
  },
  logo: {
    width: 120,
    height: 60,
    resizeMode: 'contain',
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  bottomSection: {
    gap: 12,
    width: '100%',
  },
  homeIndicator: {
    width: 134,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(20,17,12,0.25)',
    alignSelf: 'center',
    marginTop: 8,
  },
});