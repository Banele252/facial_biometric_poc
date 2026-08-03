import React, { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui';

type Choice = 'sa' | 'foreign';

interface Props {
    navigation: any;
}

export default function SAIDSelectionScreen({ navigation }: Props) {
  const [choice, setChoice] = useState<Choice>('sa');
  const [consent, setConsent] = useState(false);

  // The choice on this screen decides the whole journey: a passport holder
  // skips the SA ID checksum and the Home Affairs face match, because Home
  // Affairs holds no photo for them. Carrying it forward as document_type is
  // what makes this screen do something rather than just look like it does.
  const handleContinue = () => {
    navigation.navigate('Main', {
      documentType: choice === 'sa' ? 'SA_ID' : 'PASSPORT',
      consent,
    });
  };

  const getCardStyle = (selected: boolean) => ({
    flexDirection: 'row' as 'row',
    alignItems: 'center' as 'center',
    gap: 16,
    width: '100%' as const,  // <--- FIX: Tell TypeScript this is exactly '100%'
    padding: 16,
    minHeight: 80,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: selected ? '#FFCB05' : '#ECE8DF',
    backgroundColor: selected ? '#FFF8E1' : '#FFFFFF',
    shadowColor: selected ? '#FFCB05' : '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: selected ? 0.22 : 0.04,
    shadowRadius: 18,
    elevation: selected ? 5 : 0,
  });

  const getDotStyle = (on: boolean) => ({
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: on ? '#FFCB05' : '#FFFFFF',
    borderWidth: 1.5,
    borderColor: on ? '#FFCB05' : '#DBD6CB',
    justifyContent: 'center' as 'center',
    alignItems: 'center' as 'center',
  });

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />

      {/* Background Patterns */}
      <View style={styles.patternTop} />
      <View style={styles.patternBottom} />

      {/* Top Status Bar Area */}
      <View style={styles.topbar}>
        <Text style={styles.time}>9:41</Text>
        <Ionicons name="cellular" size={16} color="#14110C" />
        <Ionicons name="battery-full" size={20} color="#14110C" />
      </View>

      <View style={styles.contentContainer}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/mtn-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Hero Section */}
        <View style={styles.heroContainer}>
          <Image
            source={require('../../assets/hero.png')}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,253,249,1)']}
            locations={[0, 0.65]}
            style={styles.heroGradient}
          />
          <View style={styles.heroTextContainer}>
            <View style={styles.heroAccent} />
            <Text style={styles.heroTitle}>Do you have a{'\n'}South African ID?</Text>
            <Text style={styles.heroSubtitle}>
                            This helps us select the correct verification journey.
            </Text>
          </View>
        </View>

        {/* Selection Cards */}
        <View style={styles.cardContainer}>
          <Pressable
            style={getCardStyle(choice === 'sa')}
            onPress={() => setChoice('sa')}
          >
            <View style={styles.iconPlaceholder}>
              <Text style={{ fontSize: 24 }}>🇿🇦</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Yes, I have a South African ID</Text>
            </View>
            <View style={getDotStyle(choice === 'sa')}>
              <Ionicons
                name="checkmark"
                size={13}
                color={choice === 'sa' ? '#14110C' : 'transparent'}
              />
            </View>
          </Pressable>

          <Pressable
            style={getCardStyle(choice === 'foreign')}
            onPress={() => setChoice('foreign')}
          >
            <View style={styles.iconPlaceholder}>
              <Ionicons name="globe-outline" size={24} color="#14110C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>No, I don&apos;t have a South African ID</Text>
              <Text style={styles.cardSubtitle}>Foreign ID holder</Text>
            </View>
            <View style={getDotStyle(choice === 'foreign')}>
              <Ionicons
                name="checkmark"
                size={13}
                color={choice === 'foreign' ? '#14110C' : 'transparent'}
              />
            </View>
          </Pressable>
        </View>

        {/* Consent — RICA and POPIA both require it before anything is
            checked, and the backend refuses the journey without it. */}
        <Pressable style={styles.consentRow} onPress={() => setConsent((on) => !on)}>
          <View style={getDotStyle(consent)}>
            <Ionicons
              name="checkmark"
              size={13}
              color={consent ? '#14110C' : 'transparent'}
            />
          </View>
          <Text style={styles.consentText}>
            I agree to MTN verifying my identity for this request — my ID document,
            my face and my SIM registration.
          </Text>
        </Pressable>

        {/* Security Note */}
        <View style={styles.securityRow}>
          <Ionicons name="lock-closed-outline" size={14} color="#C9A000" />
          <Text style={styles.securityText}>Your information is secure with us.</Text>
        </View>

        {/* Space Filler */}
        <View style={{ flex: 1 }} />

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <Button variant="primary" onPress={handleContinue} disabled={!consent}>
                        Continue
          </Button>
          <Button variant="secondary" onPress={() => alert('Learn More pressed')}>
                        Learn More
          </Button>
        </View>

        {/* Pagination Dots */}
        <View style={styles.dotsContainer}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View
              key={i}
              style={{
                width: i === 0 ? 22 : 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: i === 0 ? '#FFCB05' : '#E2DFD7',
              }}
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
    backgroundColor: '#FFFDF9',
    maxWidth: 428,
    alignSelf: 'center',
    width: '100%',
  },
  patternTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 190,
    height: 190,
    backgroundColor: 'rgba(255,203,5,0.05)',
    opacity: 0.5,
  },
  patternBottom: {
    position: 'absolute',
    bottom: -60,
    left: -40,
    width: 300,
    height: 300,
    backgroundColor: 'rgba(255,203,5,0.16)',
    borderRadius: 150,
  },
  topbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    height: 54,
    zIndex: 10,
  },
  time: { fontSize: 13, fontWeight: '700', color: '#14110C', letterSpacing: 0.2 },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 24,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
  },
  logoContainer: { alignItems: 'center', paddingVertical: 4 },
  logo: { width: 92, height: 40 },
  heroContainer: {
    height: 232,
    marginHorizontal: -24,
    position: 'relative',
    overflow: 'hidden',
  },
  heroImage: { position: 'absolute', right: -2, top: 4, height: 218, width: '80%' },
  heroGradient: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  heroTextContainer: {
    position: 'absolute',
    left: 24,
    top: 92,
    width: 214,
    zIndex: 2,
    gap: 10,
  },
  heroAccent: {
    width: 4,
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#FFCB05',
    position: 'absolute',
    left: 0,
  },
  heroTitle: {
    marginLeft: 17,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '800',
    color: '#14110C',
  },
  heroSubtitle: {
    marginLeft: 17,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
    color: '#5C574E',
  },
  cardContainer: { flexDirection: 'column', gap: 12, marginTop: 22 },
  iconPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  cardTitle: { fontSize: 15.5, lineHeight: 21, fontWeight: '700', color: '#14110C' },
  cardSubtitle: { fontSize: 13, fontWeight: '500', color: '#6B6559', marginTop: 2 },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 20,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ECE8DF',
    backgroundColor: '#FFFFFF',
  },
  consentText: { flex: 1, fontSize: 13, lineHeight: 19, color: '#4A463D' },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  securityText: { fontSize: 12.5, fontWeight: '500', color: '#6B6559' },
  actionsContainer: { flexDirection: 'column', gap: 10, marginBottom: 20 },
  dotsContainer: { flexDirection: 'row', gap: 8, justifyContent: 'center', paddingBottom: 26 },
});