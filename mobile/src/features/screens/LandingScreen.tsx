import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Animated,
  ActivityIndicator,
  Pressable,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/theme';

const DESIGN_WIDTH = 393;
const CAROUSEL_HEIGHT = 320;
const SLIDES = 6;

const slides = [
  { id: '1', image: 'https://images.pexels.com/photos/5053850/pexels-photo-5053850.jpeg?auto=compress&cs=tinysrgb&w=1400',
    badge: 'Biometric', title: 'Trusted Digital Identity',
    description: 'Verifies identity using biometrics plus MTN trust signals.' },
  { id: '2', image: 'https://images.pexels.com/photos/5926392/pexels-photo-5926392.jpeg?auto=compress&cs=tinysrgb&w=1400',
    badge: 'Risk rules', title: 'Fraud Prevention',
    description: 'Detects and prevents fraudulent activity using configurable risk rules.' },
  { id: '3', image: 'https://images.pexels.com/photos/7191988/pexels-photo-7191988.jpeg?auto=compress&cs=tinysrgb&w=1400',
    badge: 'Auditable', title: 'Customer Consent',
    description: 'Ensures data is used only for authorised and auditable purposes.' },
  { id: '4', image: 'https://images.pexels.com/photos/5244048/pexels-photo-5244048.jpeg?auto=compress&cs=tinysrgb&w=1400',
    badge: 'Compliance', title: 'Regulatory Compliance',
    description: 'Enforces regulatory requirements through centrally managed controls.' },
  { id: '5', image: 'https://images.pexels.com/photos/7054505/pexels-photo-7054505.jpeg?auto=compress&cs=tinysrgb&w=1400',
    badge: 'Adaptive', title: 'Risk Orchestration',
    description: 'Applies the appropriate security action based on transaction risk.' },
  { id: '6', image: 'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=1400',
    badge: 'Reusable', title: 'Digital Trust Services',
    description: 'Provides reusable trust capabilities to any MTN service or product.' },
];

const actions = [
  { id: 'swap', glyph: 'sync-outline', label: 'Swap SIM', screen: 'ConsentScreen' },
  { id: 'verify', glyph: 'person-outline', label: 'Verify ID', screen: 'VerifyScreen' },
  { id: 'esim', glyph: 'cellular-outline', label: 'eSIM', screen: 'ESIMScreen' },
  { id: 'wallet', glyph: 'wallet-outline', label: 'Wallet', screen: 'WalletScreen' },
];

const streamData = [
  { id: 'auth', glyph: 'key-outline', title: 'Authentication', body: 'Passwordless, biometric and MFA sign-in',
    detail: 'Sign in to MTN and partner services with your face or fingerprint instead of a password or OTP. ' +
        'Step-up MFA kicks in only for high-risk actions.', tags: ['Per authentication', 'Biometric'] },
  { id: 'onboard', glyph: 'create-outline', title: 'Digital Onboarding',
    body: 'SIM, fibre, insurance — verified in minutes', detail: 'One verified identity opens every MTN product. ' +
        'RICA-compliant onboarding for SIM, fibre, insurance and lending without a store visit.',
    tags: ['Subscription / API fees', 'RICA ready'] },
  { id: 'enterprise', glyph: 'code-working-outline', title: 'Enterprise Identity APIs',
    body: 'KYC, liveness and device trust, pay-per-call',
    detail: 'Banks, insurers and retailers call our APIs to verify a customer, ' +
        'check liveness or score device trust — billed per call, no integration lock-in.',
    tags: ['Pay per API', 'Banking & retail'] },
  { id: 'esimact', glyph: 'phone-portrait-outline', title: 'eSIM Activation', body: 'Secure profile download and ' +
        'activation', detail: 'Download an eSIM profile straight to your device after a ' +
        'biometric check — no plastic SIM, no courier, active in about two minutes.',
  tags: ['Per activation', 'No plastic SIM'] },
];

const ACCENT = Colors.primary || '#FFCB05';

interface LandingScreenProps {
  navigate: (screen: string, params?: any) => void;
  goBack?: () => void;
}

export default function LandingScreen({ navigate, goBack }: LandingScreenProps) {
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const [openStreamId, setOpenStreamId] = useState<string | null>(null);
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    autoPlayRef.current = setInterval(() => {
      if (!isDragging) {
        const next = (currentIndex + 1) % SLIDES;
        flatListRef.current?.scrollToIndex({ index: next, animated: true });
        setCurrentIndex(next);
      }
    }, 5000);
    return () => { if (autoPlayRef.current) clearInterval(autoPlayRef.current); };
  }, [currentIndex, isDragging]);

  const onScrollEnd = useCallback((event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / DESIGN_WIDTH);
    if (index !== currentIndex) setCurrentIndex(index);
  }, [currentIndex]);

  const goToSlide = useCallback((index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setCurrentIndex(index);
  }, []);

  const toggleStream = useCallback((id: string) => {
    setOpenStreamId((prev) => (prev === id ? null : id));
  }, []);

  const handleActionPress = useCallback((screen: string) => navigate(screen), [navigate]);
  const handleLogin = useCallback(() => navigate('VerifyScreen'), [navigate]);

  const handleCtaPress = useCallback((e: any) => {
    if (phase !== 'idle') return;
    const touch = e.nativeEvent;
    const x = touch.locationX || 0;
    const y = touch.locationY || 0;
    const id = Date.now();
    setRipples((prev) => [...prev, { id, x, y }]);
    setTimeout(() => setRipples((prev) =>
      prev.filter((r) => r.id !== id)), 700);
    setPhase('busy');
    setTimeout(() => {
      setPhase('done');
      setTimeout(() => navigate('ConsentScreen'), 500);
    }, 1000);
  }, [phase, navigate]);

  const renderSlide = ({ item }: { item: typeof slides[0] }) => (
    <View style={styles.slideContainer}>
      <Image source={{ uri: item.image }} style={styles.slideImage} resizeMode="cover" />
      <LinearGradient colors={['rgba(10,10,11,0)', 'rgba(10,10,11,0.78)', 'rgba(10,10,11,0.96)']}
        locations={[0, 0.52, 1]} style={styles.slideGradient} />
      <View style={styles.slideContent}>
        <View style={styles.badge}><Text style={styles.badgeText}>{item.badge}</Text></View>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideDesc}>{item.description}</Text>
      </View>
    </View>
  );

  const renderDot = (_: any, idx: number) => {
    const active = idx === currentIndex;
    const passed = idx < currentIndex;
    return (
      <TouchableOpacity key={idx} style={styles.dotTouch} onPress={() => goToSlide(idx)}>
        <View style={[styles.dot, { backgroundColor: 
              active ? ACCENT : passed ? 'rgba(255,203,5,0.35)' : 'rgba(255,255,255,0.22)' }]} />
      </TouchableOpacity>
    );
  };

  const renderAction = (action: typeof actions[0]) => (
    <TouchableOpacity key={action.id} style={styles.actionButton} 
      onPress={() => handleActionPress(action.screen)} activeOpacity={0.7}>
      <Ionicons name={action.glyph as any} size={22} color="#8A6A00" />
      <Text style={styles.actionLabel}>{action.label}</Text>
    </TouchableOpacity>
  );

  const renderStream = (stream: typeof streamData[0]) => {
    const isOpen = openStreamId === stream.id;
    return (
      <View key={stream.id} style={[styles.accordionItem, { borderTopWidth: stream.id === 'auth' ? 0 : 1 }]}>
        <Pressable style={styles.accordionHeader} onPress={() => toggleStream(stream.id)}>
          <View style={[styles.accordionIcon, { backgroundColor: 
                isOpen ? '#FFF3C9' : '#F4F4F7', borderColor: isOpen ? '#F2DC8E' : '#EFEFF3' }]}>
            <Ionicons name={stream.glyph as any} size={18} color="#8A6A00" />
          </View>
          <View style={styles.accordionHeaderText}>
            <Text style={styles.accordionTitle}>{stream.title}</Text>
            <Text style={styles.accordionBody}>{stream.body}</Text>
          </View>
          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#6E6E78" />
        </Pressable>
        <Animated.View style={[styles.accordionDetailWrapper, 
          { maxHeight: isOpen ? 200 : 0, opacity: isOpen ? 1 : 0 }]}>
          <View style={styles.accordionDetailInner}>
            <Text style={styles.accordionDetailText}>{stream.detail}</Text>
            <View style={styles.tagContainer}>
              {stream.tags.map((tag) => 
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text></View>)}
            </View>
          </View>
        </Animated.View>
      </View>
    );
  };

  const ctaText = phase === 'busy' ? 'Starting…' :
    phase === 'done' ? 'Let\'s go' : 'Swap SIM';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <ScrollView style={styles.scrollView} contentContainerStyle
        ={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <View style={styles.mtnBadge}><Text style={styles.mtnText}>MTN</Text></View>
            <Text style={styles.trustText}>trust</Text>
          </View>
        </View>

        <View style={styles.carouselWrapper}>
          <FlatList
            ref={flatListRef}
            data={slides}
            renderItem={renderSlide}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            onScrollBeginDrag={() => setIsDragging(true)}
            onScrollEndDrag={() => setIsDragging(false)}
            scrollEventThrottle={16}
            style={styles.carouselFlatList}
            getItemLayout={(_, index) => 
              ({ length: DESIGN_WIDTH, offset: DESIGN_WIDTH * index, index })}
          />
          <View style={styles.dotsContainer}>
            {Array.from({ length: SLIDES }).map((_, idx) => renderDot(_, idx))}
          </View>
        </View>

        <View style={styles.actionGrid}>{actions.map(renderAction)}</View>

        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[styles.ctaButton, phase === 'busy' && styles.ctaBusy, phase === 'done' && styles.ctaDone]}
            onPress={handleCtaPress}
            activeOpacity={0.85}
            disabled={phase !== 'idle'}
          >
            {ripples.map((r) => 
              <Animated.View key={r.id} style={[styles.ripple, 
                { left: r.x - 260, top: r.y - 260 }]} />)}
            <View style={styles.ctaIconWrap}><Ionicons name="sync-outline" size={22} color="#FFCB05" /></View>
            <View style={styles.ctaTextWrap}>
              <Text style={styles.ctaLabel}>{ctaText}</Text>
              {phase === 'busy' && <ActivityIndicator size="small" color="#111114" style={styles.ctaSpinner} />}
              {phase === 'done' && <View style={styles.ctaCheck}><Ionicons
                name="checkmark" size={14} color="#FFCB05" /></View>}
            </View>
          </TouchableOpacity>

          <View style={styles.trustCard}>
            <Text style={styles.trustLabel}>Trust score</Text>
            <Text style={styles.trustDesc}>Log in to see your identity strength</Text>
            <TouchableOpacity style={styles.loginButton} onPress={handleLogin} activeOpacity={0.7}>
              <Text style={styles.loginText}>Login</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.accordionContainer}>
          <Text style={styles.accordionSectionTitle}>Also on the platform</Text>
          <View style={styles.accordionList}>{streamData.map(renderStream)}</View>
        </View>

        <Text style={styles.footer}>One Identity. One Customer. One MTN.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background, width: DESIGN_WIDTH, alignSelf: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 10, paddingHorizontal: 12, paddingBottom: 104 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4, paddingBottom: 14, paddingTop: 8 },
  headerBrand: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000',
    borderRadius: 999, paddingVertical: 5, paddingRight: 12, paddingLeft: 6 },
  mtnBadge: { width: 52, height: 27, borderRadius: 50, borderWidth: 2.5,
    borderColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  mtnText: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.1, color: ACCENT },
  trustText: { marginLeft: 9, color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.32 },
  carouselWrapper: { position: 'relative', borderRadius: 22, overflow: 'hidden',
    backgroundColor: '#141416', height: CAROUSEL_HEIGHT, shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.4, shadowRadius: 40, elevation: 20 },
  carouselFlatList: { flex: 1 },
  slideContainer: { width: DESIGN_WIDTH - 24, height: CAROUSEL_HEIGHT, position: 'relative', overflow: 'hidden' },
  slideImage: { width: '100%', height: '100%', position: 'absolute' },
  slideGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '38%' },
  slideContent: { position: 'absolute', left: 16, right: 16, bottom: 38 },
  badge: { alignSelf: 'flex-start', backgroundColor: ACCENT,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, marginBottom: 11 },
  badgeText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.84, textTransform: 'uppercase', color: '#111' },
  slideTitle: { color: '#fff', fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.78, marginBottom: 7 },
  slideDesc: { color: '#C9C9D2', fontSize: 13, lineHeight: 19 },
  dotsContainer: { position: 'absolute', bottom: 14, left: 16, right: 16,
    flexDirection: 'row', gap: 7, justifyContent: 'flex-start' },
  dotTouch: { flex: 1, height: 16, paddingVertical: 6, justifyContent: 'center' },
  dot: { height: 4, borderRadius: 2, width: '100%' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, borderWidth: 1,
    borderColor: '#EFEFF3', paddingVertical: 16, paddingHorizontal: 6, gap: 4,
    shadowColor: 'rgba(17,17,20,0.18)', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3, shadowRadius: 22, elevation: 6 },
  actionButton: { flex: 1, minHeight: 44, flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 9, paddingVertical: 8, borderRadius: 8 },
  actionLabel: { fontSize: 12.5, fontWeight: '600', letterSpacing: -0.125, color: '#111114', textAlign: 'center' },
  ctaRow: { flexDirection: 'row', marginTop: 14, gap: 12 },
  ctaButton: { flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 20, padding: 16, minHeight: 150,
    flexDirection: 'column', justifyContent: 'space-between', gap: 16, backgroundColor: ACCENT,
    shadowColor: 'rgba(255,203,5,0.9)', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5, shadowRadius: 24, elevation: 8 },
  ctaBusy: { opacity: 0.8 },
  ctaDone: { backgroundColor: '#111114' },
  ripple: { position: 'absolute', width: 520, height: 520, borderRadius: 260, backgroundColor: 'rgba(255,255,255,0.6)' },
  ctaIconWrap: { alignSelf: 'flex-start', width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#111114', alignItems: 'center', justifyContent: 'center' },
  ctaTextWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaLabel: { fontSize: 16, fontWeight: '800', letterSpacing: -0.32, color: '#111114' },
  ctaSpinner: { marginLeft: 4 },
  ctaCheck: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#111114',
    alignItems: 'center', justifyContent: 'center' },
  trustCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20,
    borderWidth: 1, borderColor: '#EFEFF3', padding: 16, paddingBottom: 18, flexDirection: 'column',
    shadowColor: 'rgba(17,17,20,0.18)', shadowOffset: { width: 0,
      height: 10 }, shadowOpacity: 0.3, shadowRadius: 22, elevation: 6 },
  trustLabel: { fontSize: 12.5, fontWeight: '700', color: '#6E6E78' },
  trustDesc: { marginTop: 4, color: '#111114', fontSize: 16, lineHeight: 20.8,
    fontWeight: '800', letterSpacing: -0.32, flex: 1, flexWrap: 'wrap' },
  loginButton: { marginTop: 12, alignSelf: 'flex-start', minHeight: 44, paddingVertical: 12,
    paddingHorizontal: 22, borderRadius: 999, backgroundColor: ACCENT, shadowColor: 'rgba(255,203,5,0.9)',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 6 },
  loginText: { fontSize: 14.5, fontWeight: '800', color: '#111114' },
  accordionContainer: { marginTop: 12, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20,
    borderWidth: 1, borderColor: '#EFEFF3', padding: 18, shadowColor: 'rgba(17,17,20,0.18)',
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 22, elevation: 6 },
  accordionSectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.99,
    textTransform: 'uppercase', color: '#6E6E78' },
  accordionList: { marginTop: 14, gap: 14 },
  accordionItem: { borderTopColor: '#EDEDF1' },
  accordionHeader: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 44, paddingVertical: 4 },
  accordionIcon: { width: 38, height: 38, borderRadius: 11, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  accordionHeaderText: { flex: 1, minWidth: 0 },
  accordionTitle: { color: '#111114', fontSize: 14, fontWeight: '700', letterSpacing: -0.14 },
  accordionBody: { color: '#6E6E78', fontSize: 12.5, marginTop: 2 },
  accordionDetailWrapper: { overflow: 'hidden' },
  accordionDetailInner: { paddingTop: 10, paddingBottom: 4, paddingLeft: 51 },
  accordionDetailText: { color: '#5A5A64', fontSize: 12.5, lineHeight: 18.75, flexWrap: 'wrap' },
  tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingBottom: 2 },
  tag: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6,
    backgroundColor: '#F4F4F7', borderWidth: 1, borderColor: '#EFEFF3' },
  tagText: { color: '#5A5A64', fontSize: 10.5, fontWeight: '700', letterSpacing: 0.42, textTransform: 'uppercase' },
  footer: { marginTop: 16, textAlign: 'center', color: '#8A8A94',
    fontSize: 11.5, fontWeight: '600', letterSpacing: 0.23 },
});