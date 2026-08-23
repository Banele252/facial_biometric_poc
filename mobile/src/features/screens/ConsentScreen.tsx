// src/features/screens/ConsentScreen.tsx
import React, {
  useState,
  useCallback,
  useEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/theme';
import { useAudit } from '@/hooks/useAudit';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ACCENT = Colors.primary || '#FFCB05';
const DESIGN_WIDTH = 393;
const STEP = 0;

const USES = [
  { id: 'verify', glyph: 'shield-checkmark-outline' as const, title: 'Verify your identity', sub: 'Confirm you are who you say you are', detail: 'Your ID number is checked against the national register and your mobile number against your MTN account.', tags: ['Required', 'Home Affairs check'] },
  { id: 'fraud', glyph: 'lock-closed-outline' as const, title: 'Protect against fraud', sub: 'Keep your account and SIM safe', detail: 'Device, session and location signals are matched against known fraud patterns to block unauthorised swaps.', tags: ['Required', 'Risk scoring'] },
  { id: 'activate', glyph: 'card-outline' as const, title: 'Activate your new SIM', sub: 'Complete the swap securely', detail: 'We read the ICCID of your new SIM so it can be activated on your number and the old SIM deactivated.', tags: ['Required', 'ICCID only'] },
];

const POLICIES = [
  { id: 'privacy', glyph: 'document-text-outline' as const, title: 'Privacy details', sub: 'How long we keep this, and why', detail: 'We keep your ID and SIM details only as long as the swap requires, never sell your data, and process it under POPIA. You can withdraw consent at any time in the MTN app.' },
  { id: 'improve', glyph: 'trending-up-outline' as const, title: 'Service improvement', sub: 'Optional — you can decline this', detail: 'Anonymised usage data helps us find where the swap journey fails. Declining it has no effect on your SIM swap.' },
];

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: any;
  routeParams?: Record<string, unknown>;
}

export default function ConsentScreen({ navigate, goBack }: Props) {
  const audit = useAudit('ConsentScreen');
  const [openUse, setOpenUse] = useState<string | null>(null);
  const [openPolicy, setOpenPolicy] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const [shake, setShake] = useState(false);
  const [shakeAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    audit.log('SCREEN_VIEWED', {});
  }, []);

  const toggleUse = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenUse((prev) => (prev === id ? null : id));
  }, []);

  const togglePolicy = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenPolicy((prev) => (prev === id ? null : id));
  }, []);

  const toggleAgree = useCallback(() => {
    setAgreed((v) => !v);
    setShake(false);
  }, []);

  const runShake = useCallback(() => {
    setShake(true);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 5, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -5, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -5, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start(() => setShake(false));
  }, [shakeAnim]);

  const handleContinue = useCallback(() => {
    if (phase !== 'idle') return;
    if (!agreed) {
      runShake();
      return;
    }

    audit.log('CONSENT_GRANTED', {
      outcome: 'success',
      metadata: { timestamp: new Date().toISOString() }
    });

    setPhase('busy');
    setTimeout(() => {
      setPhase('done');
      setTimeout(() => {
        navigate?.('VerifyDetailsScreen');
      }, 650);
    }, 1000);
  }, [phase, agreed, navigate, runShake, audit]);

  const handleBack = useCallback(() => {
    goBack?.();
  }, [goBack]);

  const shakeStyle = { transform: [{ translateX: shakeAnim }] };
  const ctaEnabled = agreed && phase === 'idle';
  const ctaText = phase === 'busy' ? 'Saving…' : phase === 'done' ? 'Agreed' : 'Continue';

  return (
      <SafeAreaView style={styles.shell} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={8}>
              <Ionicons name="chevron-back" size={22} color="#111114" />
            </Pressable>
            <View style={styles.brandPill}>
              <View style={styles.mtnBadge}><Text style={styles.mtnText}>MTN</Text></View>
              <Text style={styles.trustText}>trust</Text>
            </View>
          </View>
          <Pressable style={styles.langBtn}>
            <Text style={styles.langText}>EN</Text>
            <Ionicons name="chevron-down" size={12} color="#6E6E78" />
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>Your consent</Text>
              <Text style={styles.progressStep}>Step 1 of 5</Text>
            </View>
            <View style={styles.stepsRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                  <View key={i} style={[styles.stepBar, { backgroundColor: i === STEP ? ACCENT : i < STEP ? 'rgba(255,203,5,0.55)' : '#DEDEE4' }]} />
              ))}
            </View>
            <Text style={styles.progressDesc}>Before we verify you, here is exactly what your information is used for. Tap any item to see the detail.</Text>
          </View>
          <View style={styles.protectedCard}>
            <View style={styles.protectedIcon}><Ionicons name="shield" size={22} color="#111114" /></View>
            <Text style={styles.protectedText}>Protected by MTN Trust</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>We will use your information to</Text>
            {USES.map((item, idx) => {
              const isOpen = openUse === item.id;
              return (
                  <View key={item.id} style={[styles.accordionItem, idx === 0 && { borderTopWidth: 0 }]}>
                    <Pressable style={styles.accordionHeader} onPress={() => toggleUse(item.id)}>
                      <View style={[styles.accordionIcon, isOpen && styles.accordionIconOpen]}>
                        <Ionicons name={item.glyph} size={18} color="#8A6A00" />
                        <View style={styles.checkBadge}><Ionicons name="checkmark" size={9} color="#111114" /></View>
                      </View>
                      <View style={styles.accordionText}>
                        <Text style={styles.accordionTitle}>{item.title}</Text>
                        <Text style={styles.accordionSub}>{item.sub}</Text>
                      </View>
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#9A9AA4" />
                    </Pressable>
                    {isOpen && (
                        <View style={styles.accordionDetail}>
                          <Text style={styles.detailText}>{item.detail}</Text>
                          <View style={styles.tagRow}>{item.tags.map((t) => <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>)}</View>
                        </View>
                    )}
                  </View>
              );
            })}
          </View>
          <View style={styles.card}>
            {POLICIES.map((item, idx) => {
              const isOpen = openPolicy === item.id;
              return (
                  <View key={item.id} style={[styles.accordionItem, idx === 0 && { borderTopWidth: 0 }]}>
                    <Pressable style={styles.accordionHeader} onPress={() => togglePolicy(item.id)}>
                      <View style={[styles.accordionIcon, isOpen && styles.accordionIconOpen]}>
                        <Ionicons name={item.glyph} size={18} color="#8A6A00" />
                      </View>
                      <View style={styles.accordionText}>
                        <Text style={styles.accordionTitle}>{item.title}</Text>
                        <Text style={styles.accordionSub}>{item.sub}</Text>
                      </View>
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#9A9AA4" />
                    </Pressable>
                    {isOpen && <View style={styles.accordionDetail}><Text style={styles.detailText}>{item.detail}</Text></View>}
                  </View>
              );
            })}
          </View>
          <Text style={styles.footerNote}>Your consent is recorded with a timestamp and can be withdrawn in the MTN app.</Text>
        </ScrollView>
        <View style={styles.bottomBar}>
          <Animated.View style={[styles.consentRow, shakeStyle]}>
            <Pressable onPress={toggleAgree} style={[styles.consentBox, agreed && styles.consentBoxChecked, shake && styles.consentBoxShake]}>
              <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                {agreed && <Ionicons name="checkmark" size={14} color="#111114" />}
              </View>
              <Text style={styles.consentLabel}>I consent to MTN processing my information for this SIM swap.</Text>
            </Pressable>
          </Animated.View>
          <Pressable onPress={handleContinue} style={[styles.ctaBtn, (ctaEnabled || phase !== 'idle') && styles.ctaBtnActive]} disabled={phase !== 'idle'}>
            <Text style={[styles.ctaText, (ctaEnabled || phase !== 'idle') && styles.ctaTextActive]}>{ctaText}</Text>
            {phase === 'idle' && <Text style={styles.ctaArrow}>→</Text>}
            {phase === 'busy' && <View style={styles.spinner} />}
            {phase === 'done' && <View style={styles.doneCheck}><Ionicons name="checkmark" size={12} color={ACCENT} /></View>}
          </Pressable>
          {(shake || phase !== 'idle') && (
              <Text style={[styles.hint, shake && styles.hintWarn]}>
                {shake ? 'Tick the consent box to continue' : phase === 'busy' ? 'Recording your preferences' : 'Consent captured — next: your details'}
              </Text>
          )}
        </View>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: Colors.background,
    width: DESIGN_WIDTH,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
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
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    borderRadius: 999,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 12,
  },
  mtnBadge: {
    width: 46,
    height: 26,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  mtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: ACCENT,
  },
  trustText: {
    marginLeft: 9,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.32,
  },
  langBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
  },
  langText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111114',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 180,
  },
  card: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#EFEFF3',
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111114',
    letterSpacing: -0.32,
  },
  progressStep: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6E6E78',
  },
  stepsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  stepBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  progressDesc: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 20,
    color: '#5A5A64',
  },
  protectedCard: {
    backgroundColor: ACCENT,
    borderRadius: 20,
    padding: 16,
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  protectedIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#111114',
    alignItems: 'center',
    justifyContent: 'center',
  },
  protectedText: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#111114',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: '#6E6E78',
    marginBottom: 4,
  },
  accordionItem: {
    borderTopWidth: 1,
    borderTopColor: '#EDEDF1',
    paddingTop: 14,
    marginTop: 14,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: 44,
  },
  accordionIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#F4F4F7',
    borderWidth: 1,
    borderColor: '#E6E6EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accordionIconOpen: {
    backgroundColor: '#FFF3C9',
    borderColor: '#F2DC8E',
  },
  checkBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accordionText: {
    flex: 1,
  },
  accordionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111114',
    letterSpacing: -0.14,
  },
  accordionSub: {
    fontSize: 12.5,
    color: '#6E6E78',
    marginTop: 2,
  },
  accordionDetail: {
    paddingTop: 10,
    paddingLeft: 51,
    paddingBottom: 4,
  },
  detailText: {
    fontSize: 12.5,
    lineHeight: 19,
    color: '#5A5A64',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tag: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#F4F4F7',
    borderWidth: 1,
    borderColor: '#E6E6EC',
  },
  tagText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#4A4A55',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: '600',
    color: '#8A8A94',
    marginTop: 8,
    marginBottom: 12,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 16,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: '#EFEFF3',
  },
  consentRow: {
    marginBottom: 9,
  },
  consentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 52,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6E6EC',
    backgroundColor: '#F7F7FA',
  },
  consentBoxChecked: {
    borderColor: '#F2DC8E',
    backgroundColor: '#FFFBEC',
  },
  consentBoxShake: {
    borderColor: '#E0A800',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#C9C9D2',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: '#F2BE00',
    backgroundColor: ACCENT,
  },
  consentLabel: {
    flex: 1,
    fontSize: 12.8,
    fontWeight: '600',
    lineHeight: 18,
    color: '#111114',
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#E4E4EA',
    paddingVertical: 15,
  },
  ctaBtnActive: {
    backgroundColor: ACCENT,
  },
  ctaText: {
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.15,
    color: '#A2A2AC',
  },
  ctaTextActive: {
    color: '#111114',
  },
  ctaArrow: {
    fontSize: 16,
    color: '#111114',
  },
  spinner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: 'rgba(17,17,20,0.25)',
    borderTopColor: '#111114',
  },
  doneCheck: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#111114',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: '600',
    color: '#8A8A94',
  },
  hintWarn: {
    color: '#A57500',
  },
});