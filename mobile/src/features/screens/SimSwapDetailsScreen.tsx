// src/screens/SimSwapDetailsScreen.tsx
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Button, Container } from '@/components/ui';
import { Colors } from '@/theme';
import { NavigationAction } from '@/navigation/types';
import { useSimSwapOrder } from '@/hooks/useSimSwapOrder';

interface Props {
  dispatch: React.Dispatch<NavigationAction>;
  route?: {
    params?: {
      scannedIcid?: string;
    };
  };
}

interface FieldDef {
  id: string;
  label: string;
  placeholder: string;
  helper: string;
  errorMsg: string;
  maxLength: number;
  keyboardType: 'default' | 'phone-pad' | 'number-pad';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  digitsOnly?: boolean;
  group?: number[];
}

const FIELDS: FieldDef[] = [
  {
    id: 'names',
    label: 'Full Names',
    placeholder: 'Firstname Surname',
    helper: 'As registered on your MTN account.',
    errorMsg: 'Enter your full names as registered.',
    maxLength: 48,
    keyboardType: 'default',
    autoCapitalize: 'words',
  },
  {
    id: 'msisdn',
    label: 'Cellphone Number',
    placeholder: '083 123 4567',
    helper: 'The number you are swapping.',
    errorMsg: 'Enter a valid 10 digit number.',
    maxLength: 12,
    keyboardType: 'phone-pad',
    digitsOnly: true,
    group: [3, 3, 4],
  },
  {
    id: 'iccid',
    label: 'New SIM card serial number (ICCID)',
    placeholder: '8901 4103 2111 1851 0720',
    helper: 'Printed on the SIM card body.',
    errorMsg: 'The ICCID must be 19 or 20 digits.',
    maxLength: 24,
    keyboardType: 'number-pad',
    digitsOnly: true,
    group: [4, 4, 4, 4, 4],
  },
];

function formatDigits(raw: string, group: number[]): string {
  const d = raw.replace(/\D/g, '');
  const out: string[] = [];
  let i = 0;
  for (const size of group) {
    if (i >= d.length) break;
    out.push(d.slice(i, i + size));
    i += size;
  }
  if (i < d.length) out.push(d.slice(i));
  return out.join(' ');
}

function validateField(def: FieldDef, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (def.id === 'names') return /^[A-Za-z\s'-]{3,}$/.test(v);
  if (def.digitsOnly) {
    const digits = v.replace(/\D/g, '');
    if (def.id === 'msisdn') return digits.length === 10;
    if (def.id === 'iccid') {
      const len = digits.length;
      return len >= 19 && len <= 20;
    }
  }
  return true;
}

export default function SimSwapDetailsScreen({ dispatch, route }: Props) {
  const [values, setValues] = useState<Record<string, string>>({
    names: '',
    msisdn: '',
    iccid: route?.params?.scannedIcid ?? '',
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({
    iccid: !!route?.params?.scannedIcid,
  });
  const [focus, setFocus] = useState<string>('');
  const [banner, setBanner] = useState('');

  const { submit, status, serverMessage, dismissError } = useSimSwapOrder();

  /* Sync scanned ICCID when navigating back with result */
  useEffect(() => {
    const scanned = route?.params?.scannedIcid;
    if (scanned) {
      setValues((prev) => ({ ...prev, iccid: scanned }));
      setTouched((prev) => ({ ...prev, iccid: true }));
    }
  }, [route?.params?.scannedIcid]);

  const handleInput = useCallback(
    (def: FieldDef, text: string) => {
      let next = text;
      if (def.digitsOnly && def.group) {
        const limit = def.id === 'msisdn' ? 10 : 20;
        const digits = text.replace(/\D/g, '').slice(0, limit);
        next = formatDigits(digits, def.group);
      } else if (!def.digitsOnly) {
        next = text.slice(0, def.maxLength);
      }
      setValues((prev) => ({ ...prev, [def.id]: next }));
      if (banner) setBanner('');
      if (serverMessage) dismissError();
    },
    [banner, serverMessage, dismissError],
  );

  const allValid = FIELDS.every((f) => validateField(f, values[f.id]));

  const handleContinue = async () => {
    if (!allValid) {
      const nextTouched: Record<string, boolean> = {};
      FIELDS.forEach((f) => {
        nextTouched[f.id] = true;
      });
      setTouched(nextTouched);
      setBanner('Please complete every field before continuing.');
      return;
    }

    setBanner('');
    const success = await submit({
      fullName: values.names,
      msisdn: values.msisdn.replace(/\s/g, ''),
      iccid: values.iccid.replace(/\s/g, ''),
    });

    if (success) {
      dispatch({
        type: 'NAVIGATE',
        payload: {
          screen: 'IDDocumentScan',
          params: {
            fullName: values.names,
            cellNumber: values.msisdn,
            iccid: values.iccid,
          },
        },
      });
    }
  };

  const dismissBanner = () => setBanner('');

  const openBarcodeScanner = () => {
    dispatch({
      type: 'NAVIGATE',
      payload: { screen: 'SimBarcodeScan' },
    });
  };

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />

      <View style={styles.patternTop} />
      <View style={styles.patternBottom} />

      <View style={styles.topBar}>
        <Pressable
          onPress={() => dispatch({ type: 'GO_BACK' })}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Typography variant="body" style={{ fontWeight: '700' }}>
            SIM Swap
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
          <Container style={styles.container} scroll={false}>
            <View style={styles.titleContainer}>
              <View style={styles.accentLine} />
              <View style={{ flex: 1 }}>
                <Typography
                  variant="h1"
                  align="left"
                  style={{ fontWeight: '800', fontSize: 22, lineHeight: 27 }}
                >
                    Capture your SIM swap request details
                </Typography>
                <Typography
                  variant="body"
                  color="textSecondary"
                  style={{ marginTop: 8, lineHeight: 20, fontSize: 13.5 }}
                >
                    Enter them exactly as they appear on your account.
                </Typography>
              </View>
            </View>

            {FIELDS.map((def) => {
              const val = values[def.id];
              const ok = validateField(def, val);
              const isTouched = touched[def.id];
              const isFocused = focus === def.id;
              const bad = isTouched && !ok && val.length > 0;
              const digits = val.replace(/\D/g, '');
              const limit =
                    def.id === 'msisdn'
                      ? 10
                      : def.id === 'iccid'
                        ? 20
                        : def.maxLength;
              const count = def.digitsOnly ? digits.length : val.length;

              return (
                <View key={def.id} style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <Typography variant="caption" style={styles.fieldLabel}>
                      {def.label}
                    </Typography>
                    <Typography
                      variant="caption"
                      style={[
                        styles.counter,
                        bad && styles.counterError,
                        ok && !isFocused && styles.counterOk,
                      ]}
                    >
                      {count}/{limit}
                    </Typography>
                  </View>

                  <View
                    style={[
                      styles.inputWrap,
                      isFocused && styles.inputWrapFocused,
                      bad && styles.inputWrapError,
                    ]}
                  >
                    <TextInput
                      style={styles.input}
                      placeholder={def.placeholder}
                      placeholderTextColor="#A39B88"
                      value={val}
                      onChangeText={(text) => handleInput(def, text)}
                      onFocus={() => setFocus(def.id)}
                      onBlur={() => {
                        setFocus('');
                        setTouched((prev) => ({ ...prev, [def.id]: true }));
                      }}
                      keyboardType={def.keyboardType}
                      maxLength={
                        def.digitsOnly && def.group
                          ? undefined
                          : def.maxLength
                      }
                      autoCapitalize={def.autoCapitalize ?? 'none'}
                      autoCorrect={false}
                    />
                    {ok && !isFocused && (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color="#1F9254"
                        style={styles.tick}
                      />
                    )}
                  </View>

                  <Typography
                    variant="caption"
                    style={[styles.helper, bad && styles.helperError]}
                  >
                    {bad ? def.errorMsg : def.helper}
                  </Typography>
                </View>
              );
            })}

            <View style={styles.hintCard}>
              <View style={styles.hintIcon}>
                <Ionicons name="card" size={16} color="#14110C" />
              </View>
              <Typography
                variant="caption"
                style={{
                  flex: 1,
                  lineHeight: 20,
                  fontWeight: '500',
                  color: '#4A453D',
                }}
              >
                  The ICCID is the 19 or 20 digit number printed on your new SIM
                  card.
              </Typography>
            </View>

            {(!!banner || !!serverMessage) && (
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
                  {serverMessage || banner}
                </Typography>
                <Pressable
                  onPress={() => {
                    dismissBanner();
                    dismissError();
                  }}
                  style={styles.bannerClose}
                >
                  <Ionicons name="close" size={16} color="#7A2820" />
                </Pressable>
              </View>
            )}

            <View style={styles.securityRow}>
              <Ionicons name="lock-closed" size={14} color="#C9A000" />
              <Typography
                variant="caption"
                style={{
                  fontWeight: '500',
                  color: '#6B6559',
                  fontSize: 12.5,
                }}
              >
                  Your information is secure with us.
              </Typography>
            </View>
          </Container>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.bottomActions}>
        <Container scroll={false}>
          <Button
            variant="primary"
            onPress={handleContinue}
            disabled={status === 'loading'}
            style={
              allValid && status !== 'loading'
                ? [styles.primaryBtn, styles.primaryBtnActive]
                : styles.primaryBtn
            }
          >
            {status === 'loading' ? 'Checking…' : 'Continue'}
          </Button>

          <Button
            variant="outline"
            onPress={openBarcodeScanner}
            style={styles.secondaryBtn}
          >
              Scan SIM barcode
          </Button>
        </Container>

        <View style={styles.dotsContainer}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === 3 ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#FFFDF9' },
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
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: { width: 42, height: 42 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  container: { paddingTop: 26 },
  titleContainer: {
    flexDirection: 'row',
    gap: 13,
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  accentLine: {
    width: 4,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 6,
    height: 32,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
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
  counterOk: {
    color: '#1F9254',
  },
  counterError: {
    color: '#C0362C',
  },
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
  inputWrapFocused: {
    borderColor: '#FFCB05',
  },
  inputWrapError: {
    borderColor: '#E0574A',
    backgroundColor: '#FEF3F1',
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#14110C',
    padding: 0,
    minWidth: 0,
  },
  tick: {
    flex: 0,
  },
  helper: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
    color: '#9C968A',
    minHeight: 15,
  },
  helperError: {
    color: '#C0362C',
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderWidth: 1.5,
    borderColor: '#ECE8DF',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginTop: 16,
  },
  hintIcon: {
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
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  bottomActions: {
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: '#FFFDF9',
    borderTopWidth: 1,
    borderTopColor: '#EFEBE1',
  },
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
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 18,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
  dotActive: {
    width: 22,
    backgroundColor: '#FFCB05',
  },
  dotInactive: {
    width: 7,
    backgroundColor: '#E2DFD7',
  },
});