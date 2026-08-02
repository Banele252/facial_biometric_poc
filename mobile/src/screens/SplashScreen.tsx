import React from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Typography, Button, Container } from '@/components/ui';
import { Colors } from '@/theme';

// height is no longer needed; we removed it
const { height } = Dimensions.get('window');

interface Props {
  onGetStarted: () => void;
  onLearnMore: () => void;
}

export default function SplashScreen({ onGetStarted, onLearnMore }: Props) {
  return (
    <View style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.imageContainer}>
        <Image
          source={require('../../assets/splash-photo.png')}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(251,247,238,1)', 'rgba(255,255,255,0)']}
          locations={[0, 0.6]}
          style={styles.gradient}
        />
      </View>
      <Container style={{ justifyContent: 'space-between', paddingTop: 52, paddingBottom: 26 }}>
        <View style={{ alignItems: 'center', gap: 14 }}>
          <Image source={require('../../assets/mtn-logo.png')} style={styles.logo} />
          <Typography variant="h1" align="center">
              Secure. Simple. Yours.
          </Typography>
          <Typography variant="subtitle" align="center">
              Your identity. Our priority.
          </Typography>
        </View>
        <View style={{ gap: 10 }}>
          <Button variant="primary" size="lg" onPress={onGetStarted}>
              Get Started
          </Button>
          <Button variant="secondary" size="lg" onPress={onLearnMore}>
              Learn More
          </Button>
        </View>
        <View style={styles.homeIndicator} />
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: Colors.background },
  imageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.7,
    overflow: 'hidden',
  },
  backgroundImage: { width: '100%', height: '100%', position: 'absolute', bottom: 0 },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  logo: { width: 132, height: 36, resizeMode: 'contain', marginBottom: 14 },
  homeIndicator: {
    width: 134,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(20,17,12,0.28)',
    alignSelf: 'center',
    marginTop: 10,
  },
});