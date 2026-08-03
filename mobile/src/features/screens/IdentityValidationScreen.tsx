import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Button, Container } from '@/components/ui';
import { Colors } from '@/theme';
import { useValidateId } from '@/hooks/useValidateId';
import { useJourneyStore } from '@/store/useJourneyStore';

interface Props {
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
}

export default function IdentityValidationScreen({ navigate, goBack }: Props) {
  const { value, setValue, liveResult, status, serverMessage, submit, dismissError } =
      useValidateId();

  const setIdNumber = useJourneyStore((s) => s.setIdNumber);

  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [shakeAnim] = useState(() => new Animated.Value(0));

  const submitting = status === 'loading';
  const ok = liveResult.level === 'valid';
  const showError = liveResult.level === 'error' && (touched || !focused);

  /* ─── visual formatting 000000 0000 000 ─── */
  const format = useCallback((d: string) => {
    const a = d.slice(0, 6);
    const b = d.slice(6, 10);
    const c = d.slice(10, 13);
    return [a, b, c].filter(Boolean).join(' ');
  }, []);

  /* ─── shake animation ─── */
  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleSubmit = async () => {
    if (!ok) {
      setTouched(true);
      triggerShake();
      return;
    }
    // Attempt to submit; on success, navigate to next screen
    const success = await submit();
    if (success) {
      // Keep the number for the rest of the journey — the selfie, the document
      // comparison, RICA and Home Affairs are all keyed on it, and without
      // this it never leaves this screen.
      setIdNumber(value.replace(/\D/g, ''));
      navigate('SimSwapDetails');
    }
  };

  // Also trigger shake when server returns an error (optional)
  useEffect(() => {
    if (serverMessage) {
      triggerShake();
    }
  }, [serverMessage, triggerShake]);

  const borderColor = showError ? '#E0574A' : ok ? '#2FA96B' : focused ? Colors.primary : Colors.border;

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />

      <View style={styles.patternTop} />
      <View style={styles.patternBottom} />

      <View style={styles.topBar}>
        <Pressable onPress={goBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Typography variant="body" style={{ fontWeight: '700' }}>
            Identity Validation
        </Typography>
        <View style={styles.placeholder} />
      </View>

      <Container style={styles.container}>
        <>
          <View style={styles.titleContainer}>
            <View style={styles.accentLine} />
            <Typography variant="h1" align="left" style={{ fontWeight: '800' }}>
                Enter your ID number to continue
            </Typography>
          </View>

          <View style={styles.inputWrapper}>
            <View style={styles.labelRow}>
              <Typography variant="caption" style={{ fontWeight: '700' }}>
                  SA ID Number
              </Typography>
              <Typography
                variant="caption"
                color={ok ? 'success' : showError ? 'error' : 'textLight'}
                style={{ fontWeight: '600' }}
              >
                {value.length}/13
              </Typography>
            </View>

            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <View style={[styles.field, { borderColor: borderColor }]}>
                <TextInput
                  value={format(value)}
                  onChangeText={(text) => {
                    const cleaned = text.replace(/\D/g, '').slice(0, 13);
                    setValue(cleaned);
                    dismissError();
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => { setFocused(false); setTouched(true); }}
                  placeholder="000000 0000 000"
                  keyboardType="numeric"
                  style={styles.input}
                  placeholderTextColor={Colors.textLight}
                />
                <View style={[styles.statusIcon, { backgroundColor: ok ? '#E4F5EA' :
                  showError ? '#FBE3E0' : 'transparent' }]}>
                  {ok && <Ionicons name="checkmark" size={16} color="#1F9254" />}
                  {showError && <Ionicons name="close" size={16} color="#C0362C" />}
                </View>
              </View>
            </Animated.View>

            <View style={styles.helperRow}>
              {showError && <Ionicons name="information-circle-outline" size={14} color="#C0362C" />}
              <Typography
                variant="caption"
                color={showError ? 'error' : ok ? 'success' : 'textLight'}
              >
                {liveResult.text}
              </Typography>
            </View>
          </View>

          {!serverMessage && (
            <View style={styles.infoCard}>
              <View style={styles.shieldIcon}>
                <Ionicons name="shield-checkmark" size={16} color={Colors.text} />
              </View>
              <Typography variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    We use this only to validate your identity. It is never shared.
              </Typography>
            </View>
          )}

          {serverMessage && (
            <View style={styles.banner}>
              <View style={styles.bannerIcon}>
                <Ionicons name="warning" size={16} color="#C0362C" />
              </View>
              <Typography variant="caption" color="error" style={{ flex: 1, fontWeight: '600' }}>
                {serverMessage}
              </Typography>
              <Pressable onPress={dismissError}>
                <Ionicons name="close" size={16} color="#7A2820" />
              </Pressable>
            </View>
          )}

          <View style={{ flex: 1 }} />

          <View style={styles.actions}>
            <Button variant="primary" onPress={handleSubmit} disabled={!ok || submitting}>
              {submitting ? <ActivityIndicator color={Colors.text} /> : 'Continue'}
            </Button>
            <Button variant="secondary" onPress={() => alert('I do not have my ID with me')}>
                I do not have my ID with me
            </Button>
          </View>

          <View style={styles.dotsContainer}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === 2 ? 22 : 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: i === 2 ? Colors.primary : '#E2DFD7',
                }}
              />
            ))}
          </View>
        </>
      </Container>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: Colors.surface },
  patternTop: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 210,
    height: 210,
    backgroundColor: 'rgba(255,203,5,0.05)',
    opacity: 0.5,
  },
  patternBottom: {
    position: 'absolute',
    bottom: -80,
    left: -60,
    width: 320,
    height: 320,
    backgroundColor: 'rgba(255,203,5,0.15)',
    borderRadius: 160,
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
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#EFEBE1',
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: { width: 42, height: 42 },
  container: { flex: 1, paddingTop: 34, paddingBottom: 26 },
  titleContainer: {
    flexDirection: 'row',
    gap: 13,
    alignItems: 'stretch',
    marginBottom: 26,
  },
  accentLine: {
    width: 4,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  inputWrapper: { gap: 9 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 58,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  input: {
    flex: 1,
    fontFamily: 'Figtree, system-ui, sans-serif',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: Colors.text,
    padding: 0,
  },
  statusIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 18,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  shieldIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFF7DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F3C9C3',
    backgroundColor: '#FEF3F1',
  },
  bannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#FBE3E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actions: { gap: 10 },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingTop: 22,
  },
});