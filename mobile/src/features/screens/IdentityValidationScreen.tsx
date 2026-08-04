import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Button, Container } from '@/components/ui';
import { useValidateId } from '@/hooks/useValidateId';

interface Props {
  navigate: (screen: string, params?: any) => void;
  goBack: () => void;
}

const { width, height } = Dimensions.get('window');
const GOLD = '#D4AF37';

export default function IdentityValidationScreen({ navigate, goBack }: Props) {
  const { value, setValue, liveResult, status, serverMessage, submit, dismissError } =
      useValidateId();

  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [shakeAnim] = useState(() => new Animated.Value(0));

  const submitting = status === 'loading';
  const ok = liveResult.level === 'valid';
  const showError = liveResult.level === 'error' && (touched || !focused);

  /* ─── ID formatting: 000000 0000 000 ─── */
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
    const success = await submit();
    if (success) {
      navigate('SimSwapDetails');
    }
  };

  useEffect(() => {
    if (serverMessage) {
      triggerShake();
    }
  }, [serverMessage, triggerShake]);

  const borderColor = showError
    ? '#E0574A'
    : ok
      ? '#2FA96B'
      : focused
        ? '#FFCB05'
        : '#ECE8DF';

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />

      {/* Gold dot pattern — top right */}
      <View style={styles.dotsPattern}>
        {[...Array(5)].map((_, row) => (
          <View key={row} style={styles.dotRow}>
            {[...Array(5)].map((_, col) => (
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
            Identity Validation
        </Typography>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Container style={styles.container}>
            {/* Title */}
            <View style={styles.titleContainer}>
              <View style={styles.accentLine} />
              <Typography variant="h1" style={styles.headline}>
                  Enter your ID number to{'\n'}continue
              </Typography>
            </View>

            {/* Input Section */}
            <View style={styles.inputSection}>
              <View style={styles.labelRow}>
                <Typography variant="caption" style={styles.fieldLabel}>
                    SA ID Number
                </Typography>
                <Typography
                  variant="caption"
                  style={[
                    styles.counter,
                    ok && styles.counterOk,
                    showError && styles.counterError,
                  ]}
                >
                  {value.length}/13
                </Typography>
              </View>

              <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                <View
                  style={[
                    styles.inputWrap,
                    { borderColor },
                    ok && styles.inputWrapValid,
                    showError && styles.inputWrapError,
                  ]}
                >
                  <TextInput
                    value={format(value)}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/\D/g, '').slice(0, 13);
                      setValue(cleaned);
                      dismissError();
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => {
                      setFocused(false);
                      setTouched(true);
                    }}
                    placeholder="000000 0000 000"
                    keyboardType="numeric"
                    style={styles.input}
                    placeholderTextColor="#A39B88"
                    maxLength={15}
                  />
                  <View
                    style={[
                      styles.statusIcon,
                      ok && styles.statusIconValid,
                      showError && styles.statusIconError,
                    ]}
                  >
                    {ok && (
                      <Ionicons name="checkmark" size={16} color="#1F9254" />
                    )}
                    {showError && (
                      <Ionicons name="close" size={16} color="#C0362C" />
                    )}
                  </View>
                </View>
              </Animated.View>

              <Typography
                variant="caption"
                style={[
                  styles.helper,
                  ok && styles.helperValid,
                  showError && styles.helperError,
                ]}
              >
                {liveResult.text}
              </Typography>
            </View>

            {/* Server Error Banner */}
            {serverMessage && (
              <View style={styles.banner}>
                <View style={styles.bannerIcon}>
                  <Ionicons name="alert-circle" size={16} color="#C0362C" />
                </View>
                <Typography
                  variant="caption"
                  style={{
                    flex: 1,
                    lineHeight: 20,
                    fontWeight: '600',
                    color: '#7A2820',
                  }}
                >
                  {serverMessage}
                </Typography>
                <Pressable
                  onPress={dismissError}
                  style={styles.bannerClose}
                >
                  <Ionicons name="close" size={16} color="#7A2820" />
                </Pressable>
              </View>
            )}
          </Container>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <Container style={styles.bottomContainer}>
          <View style={styles.buttonGroup}>
            <Button
              variant="primary"
              size="lg"
              onPress={handleSubmit}
              disabled={!ok || submitting}
              style={
                ok && !submitting
                  ? [styles.primaryBtn, styles.primaryBtnActive]
                  : styles.primaryBtn
              }
            >
              {submitting ? 'Checking…' : 'Continue'}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onPress={() => {}}
              style={styles.secondaryBtn}
            >
                I do not have my ID with me
            </Button>
            <View style={styles.homeIndicator} />
          </View>
        </Container>

        {/* Progress dots — 4 dots, 3rd active */}
        <View style={styles.dotsContainer}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i === 2 ? styles.progressDotActive : styles.progressDotInactive,
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
    right: width * 0.06,
    zIndex: 0,
  },
  dotRow: { flexDirection: 'row', marginBottom: 6 },
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
  placeholder: { width: 40, height: 40 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  container: { paddingTop: 20 },
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
  inputSection: { marginBottom: 16 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#14110C',
    letterSpacing: -0.1,
  },
  counter: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#B0AA9D',
  },
  counterOk: { color: '#1F9254' },
  counterError: { color: '#C0362C' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#ECE8DF',
  },
  inputWrapValid: {
    borderColor: '#2FA96B',
    backgroundColor: '#FFFFFF',
  },
  inputWrapError: {
    borderColor: '#E0574A',
    backgroundColor: '#FEF3F1',
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#14110C',
    padding: 0,
    minWidth: 0,
  },
  statusIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  statusIconValid: { backgroundColor: '#E4F5EA' },
  statusIconError: { backgroundColor: '#FBE3E0' },
  helper: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
    color: '#9C968A',
    minHeight: 15,
  },
  helperValid: { color: '#1F9254' },
  helperError: { color: '#C0362C' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#F3C9C3',
    borderRadius: 16,
    backgroundColor: '#FEF3F1',
    padding: 13,
    marginTop: 16,
  },
  bannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#FBE3E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerClose: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
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
  primaryBtn: {
    height: 54,
    borderRadius: 27,
    backgroundColor: '#F5EFDC',
    color: '#A39B88',
  },
  primaryBtnActive: {
    backgroundColor: '#FFCB05',
    color: '#14110C',
  },
  secondaryBtn: {
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: '#F0DE9C',
    backgroundColor: '#FFFFFF',
    color: '#14110C',
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
  progressDot: { height: 7, borderRadius: 4 },
  progressDotActive: { width: 22, backgroundColor: '#FFCB05' },
  progressDotInactive: { width: 7, backgroundColor: '#E2DFD7' },
});