// src/features/screens/VerifyDetailsScreen.tsx
import {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';

import { apiClient } from '@/lib/apiClient';
import { useAudit } from '@/hooks/useAudit';

const ACCENT = '#FFCB05';

const Colors = {
  background: '#FFFFFF',
  text: '#111114',
  muted: '#6E6E78',
  error: '#E5484D',
  errorBg: '#FFF5F5',
};

const DESIGN_WIDTH = 393;

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: { type: string; payload?: any }) => void;
}

type Phase = 'idle' | 'busy' | 'done';

const digits = (value: string) =>
    value.replace(/\D/g, '');

const fmtId = (raw: string) => {
  const value = digits(raw).slice(0, 13);
  const parts: string[] = [];

  if (value.length > 0) parts.push(value.slice(0, 6));
  if (value.length > 6) parts.push(value.slice(6, 10));
  if (value.length > 10) parts.push(value.slice(10, 13));

  return parts.join(' ');
};

const normalizeMsisdn = (raw: string) => {
  const value = digits(raw);

  if (value.startsWith('27') && value.length === 11) {
    return `+${value}`;
  }

  if (value.startsWith('0') && value.length === 10) {
    return `+27${value.slice(1)}`;
  }

  return raw.trim();
};

const isValidMsisdn = (raw: string) =>
    /^\+27\d{9}$/.test(normalizeMsisdn(raw));

export default function VerifyDetailsScreen({
                                              navigate,
                                              goBack,
                                              dispatch,
                                            }: Props) {
  const audit = useAudit('VerifyDetailsScreen');

  const [id, setId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [touchedId, setTouchedId] = useState(false);
  const [touchedPhone, setTouchedPhone] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [apiError, setApiError] = useState<string | null>(null);

  const timersRef =
      useRef<ReturnType<typeof setTimeout>[]>([]);

  const shakeAnim =
      useMemo(() => new Animated.Value(0), []);

  const idVal =
      useMemo(() => digits(id), [id]);

  const normalizedPhone =
      useMemo(
          () => normalizeMsisdn(phoneNumber),
          [phoneNumber],
      );

  useEffect(() => {
    audit.log('SCREEN_VIEWED', {
      metadata: {
        step: 2,
      },
    });
  }, [audit]);

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);

    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnim]);

  const handleContinue = useCallback(async () => {
    if (phase !== 'idle') return;

    const idValid = idVal.length === 13;
    const phoneValid = isValidMsisdn(phoneNumber);

    setTouchedId(true);
    setTouchedPhone(true);

    if (!idValid || !phoneValid) {
      triggerShake();
      return;
    }

    setPhase('busy');
    setApiError(null);

    try {
      // Authentication already happened in AuthBootstrap before LandingScreen.
      const validation = await apiClient.validateId({
        idNumber: idVal,
      });

      if (!validation.valid) {
        throw new Error(
            validation.failed_checks?.length
                ? `ID invalid: ${validation.failed_checks.join(', ')}`
                : 'ID number is not structurally valid',
        );
      }

      audit.log('ID_VALIDATION_PASSED', {
        outcome: 'success',
        metadata: {
          idValid: true,
        },
      });

      // Persist RSA ID + MSISDN for later RICA use.
      // Local Step 2 intentionally does NOT call /api/v1/api/v1/validate-identity.
      // Identity-provider integration remains available for later/UAT flows.
      const fullName = 'PENDING';

      await apiClient.createRicaRecord({
        idNumber: idVal,
        fullName,
        msisdn: normalizedPhone,
        newSimNumber: null,
      });

      audit.log('RICA_RECORD_STORED', {
        outcome: 'success',
        metadata: {
          msisdnLast4: normalizedPhone.slice(-4),
        },
      });

      const sessionId =
          `sess_${Crypto.randomUUID()}`;

      setPhase('done');

      const timer = setTimeout(() => {
        const params = {
          idNumber: idVal,
          phoneNumber: normalizedPhone,
          fullName,
          sessionId,
        };

        if (navigate) {
          navigate('ScanSimScreen', params);
        } else if (dispatch) {
          dispatch({
            type: 'NAVIGATE',
            payload: {
              screen: 'ScanSimScreen',
              params,
            },
          });
        }
      }, 500);

      timersRef.current.push(timer);
    } catch (err: any) {
      console.error('VerifyDetails error:', err);

      setPhase('idle');
      setApiError(
          err?.message ??
          'Unable to verify your details. Please try again.',
      );

      audit.log('ID_VALIDATION_FAILED', {
        outcome: 'failure',
        reason: err?.message,
      });
    }
  }, [
    phase,
    idVal,
    phoneNumber,
    normalizedPhone,
    navigate,
    dispatch,
    triggerShake,
    audit,
  ]);

  const shakeStyle = {
    transform: [{ translateX: shakeAnim }],
  };

  return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />

        <KeyboardAvoidingView
            behavior={
              Platform.OS === 'ios'
                  ? 'padding'
                  : 'height'
            }
            style={styles.flex}
        >
          <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <TouchableOpacity
                    onPress={goBack}
                    style={styles.backBtn}
                    hitSlop={8}
                >
                  <Ionicons
                      name="chevron-back"
                      size={22}
                      color={Colors.text}
                  />
                </TouchableOpacity>

                <View style={styles.headerBrand}>
                  <View style={styles.mtnBadge}>
                    <Text style={styles.mtnText}>
                      MTN
                    </Text>
                  </View>

                  <Text style={styles.trustText}>
                    trust
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View
                    style={[
                      styles.progressBarFill,
                      { width: '40%' },
                    ]}
                />
              </View>

              <Text style={styles.stepText}>
                Step 2 of 5
              </Text>
            </View>

            <Text style={styles.title}>
              Let's verify you
            </Text>

            <Text style={styles.lead}>
              Enter your South African identity number and MTN number.
              We will verify your identity before continuing.
            </Text>

            {apiError && (
                <View style={styles.errorBanner}>
                  <Ionicons
                      name="alert-circle"
                      size={18}
                      color={Colors.error}
                  />

                  <Text style={styles.errorBannerText}>
                    {apiError}
                  </Text>
                </View>
            )}

            <Animated.View
                style={[styles.card, shakeStyle]}
            >
              <Text style={styles.label}>
                RSA Identity Number
              </Text>

              <View style={styles.inputWrapper}>
                <Ionicons
                    name="card-outline"
                    size={20}
                    color={Colors.muted}
                    style={styles.inputIcon}
                />

                <TextInput
                    style={[
                      styles.input,
                      styles.inputWithIcon,
                      touchedId &&
                      idVal.length !== 13 &&
                      styles.inputError,
                    ]}
                    value={fmtId(id)}
                    onChangeText={(value) => {
                      setId(value);
                      setTouchedId(true);
                      setApiError(null);
                    }}
                    placeholder="000000 0000 000"
                    placeholderTextColor="#A1A1AA"
                    keyboardType="number-pad"
                    maxLength={17}
                    editable={phase !== 'busy'}
                    autoFocus
                />
              </View>

              {touchedId &&
                  idVal.length !== 13 && (
                      <Text style={styles.hintError}>
                        Please enter a valid 13-digit ID number.
                      </Text>
                  )}

              <Text
                  style={[
                    styles.label,
                    styles.phoneLabel,
                  ]}
              >
                MTN mobile number
              </Text>

              <View style={styles.inputWrapper}>
                <Ionicons
                    name="phone-portrait-outline"
                    size={20}
                    color={Colors.muted}
                    style={styles.inputIcon}
                />

                <TextInput
                    style={[
                      styles.input,
                      styles.inputWithIcon,
                      touchedPhone &&
                      !isValidMsisdn(phoneNumber) &&
                      styles.inputError,
                    ]}
                    value={phoneNumber}
                    onChangeText={(value) => {
                      setPhoneNumber(value);
                      setTouchedPhone(true);
                      setApiError(null);
                    }}
                    placeholder="082 123 4567"
                    placeholderTextColor="#A1A1AA"
                    keyboardType="phone-pad"
                    maxLength={16}
                    editable={phase !== 'busy'}
                />
              </View>

              {touchedPhone &&
                  !isValidMsisdn(phoneNumber) && (
                      <Text style={styles.hintError}>
                        Enter a valid South African mobile number.
                      </Text>
                  )}
            </Animated.View>

            <TouchableOpacity
                style={[
                  styles.ctaButton,
                  phase !== 'idle' &&
                  styles.ctaBusy,
                ]}
                onPress={handleContinue}
                disabled={phase !== 'idle'}
                activeOpacity={0.85}
            >
              {phase === 'busy' ? (
                  <View style={styles.ctaTextWrap}>
                    <ActivityIndicator
                        color="#111114"
                    />
                    <Text style={styles.ctaLabel}>
                      Verifying…
                    </Text>
                  </View>
              ) : (
                  <View style={styles.ctaTextWrap}>
                    <Text style={styles.ctaLabel}>
                      Continue
                    </Text>

                    <Ionicons
                        name="arrow-forward"
                        size={18}
                        color="#111114"
                    />
                  </View>
              )}
            </TouchableOpacity>

            <View style={styles.trustRow}>
              <Ionicons
                  name="lock-closed-outline"
                  size={14}
                  color={Colors.muted}
              />

              <Text style={styles.trustRowText}>
                Encrypted · Identity verified · POPIA compliant
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
    width: DESIGN_WIDTH,
    alignSelf: 'center',
  },
  scrollContent: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    paddingTop: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 999,
    paddingVertical: 5,
    paddingRight: 12,
    paddingLeft: 6,
  },
  mtnBadge: {
    width: 46,
    height: 26,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  mtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: ACCENT,
  },
  trustText: {
    marginLeft: 9,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  progressContainer: {
    marginTop: 8,
    marginBottom: 24,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: ACCENT,
  },
  stepText: {
    color: Colors.muted,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    marginBottom: 12,
  },
  lead: {
    color: Colors.muted,
    marginBottom: 24,
    lineHeight: 22,
    fontSize: 15,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.errorBg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  errorBannerText: {
    color: Colors.error,
    fontWeight: '600',
    flex: 1,
    fontSize: 13,
  },
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#EFEFF3',
  },
  label: {
    color: Colors.text,
    marginBottom: 8,
    fontWeight: '700',
    fontSize: 14,
  },
  phoneLabel: {
    marginTop: 18,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
    width: '100%',
  },
  inputWithIcon: {
    paddingLeft: 48,
  },
  inputError: {
    borderColor: Colors.error,
    backgroundColor: '#FFFBFB',
  },
  hintError: {
    color: Colors.error,
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  ctaButton: {
    borderRadius: 20,
    paddingVertical: 18,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
    shadowColor: 'rgba(255,203,5,0.9)',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  ctaBusy: {
    opacity: 0.8,
  },
  ctaTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ctaLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111114',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  trustRowText: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
});