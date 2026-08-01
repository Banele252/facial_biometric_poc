import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';

const { height } = Dimensions.get('window');

interface Props {
  onGetStarted: () => void;
  onLearnMore: () => void;
}

export default function SplashScreen({ onGetStarted, onLearnMore }: Props) {
  return (
      <View style={styles.container}>
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

        <View style={styles.content}>
          <Image source={require('../../assets/mtn-logo.png')} style={styles.logo} />
          <Text style={styles.headline}>Secure. Simple. Yours.</Text>
          <Text style={styles.subline}>Your identity. Our priority.</Text>
        </View>

        <View style={styles.buttonContainer}>
          <Pressable style={styles.primaryButton} onPress={onGetStarted}>
            <Text style={styles.primaryText}>Get Started</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onLearnMore}>
            <Text style={styles.secondaryText}>Learn More</Text>
          </Pressable>
        </View>

        <View style={styles.homeIndicator} />
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF7EE',
    paddingTop: 44,
    paddingHorizontal: 24,
    paddingBottom: 26,
    justifyContent: 'space-between',
    maxWidth: 393,
    alignSelf: 'center',
    width: '100%',
  },
  imageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '70%',
    overflow: 'hidden',
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    bottom: 0,
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    alignItems: 'center',
    marginTop: 52,
    gap: 14,
  },
  logo: {
    width: 132,
    height: 36,
    resizeMode: 'contain',
    marginBottom: 14,
  },
  headline: {
    fontSize: 27,
    fontWeight: '800',
    color: '#14110C',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  subline: {
    fontSize: 14.5,
    fontWeight: '500',
    color: '#5C574E',
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    gap: 10,
    marginBottom: 20,
  },
  primaryButton: {
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFCB05',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFCB05',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 20,
    elevation: 8,
  },
  primaryText: {
    color: '#14110C',
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  secondaryButton: {
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: '#F0DE9C',
    backgroundColor: 'rgba(255,255,255,0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryText: {
    color: '#14110C',
    fontSize: 16.5,
    fontWeight: '600',
  },
  homeIndicator: {
    width: 134,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(20,17,12,0.28)',
    alignSelf: 'center',
    marginTop: 10,
  },
});