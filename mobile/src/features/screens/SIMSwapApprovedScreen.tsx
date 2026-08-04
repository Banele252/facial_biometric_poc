// src/features/screens/SIMSwapApprovedScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Card, Container, Button } from '@/components/ui';
import { Colors } from '@/theme';

interface Props {
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: any) => void;
  routeParams?: Record<string, unknown>;
  showNextStep?: boolean;
  showSecondaryAction?: boolean;
  stepCount?: number;
  activeStep?: number;
}

export default function SIMSwapApprovedScreen({
  navigate,
  goBack,
  dispatch,
  routeParams,
  showNextStep = true,
  showSecondaryAction = true,
  stepCount = 6,
  activeStep = 6,
}: Props) {
  const idNumber = routeParams?.id_number as string;

  const [loading, setLoading] = useState(() => !!idNumber);
  const [approval, setApproval] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [banner, setBanner] = useState(() => (idNumber ? '' : 'No ID number provided.'));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baseUrl =
      process.env.EXPO_PUBLIC_API_BASE_URL ||
      'https://backend-poc-bcd0hnd5c9e0cwfm.southafricanorth-01.azurewebsites.net';

  useEffect(() => {
    if (!idNumber) return;

    let cancelled = false;

    const fetchApproval = async () => {
      try {
        const url = `${baseUrl}/api/v1/notifications?id_number=${encodeURIComponent(idNumber)}&limit=10`;
        console.log('[SIMSwapApproved] GET', url);

        const response = await fetch(url, {
          method: 'GET',
          headers: { accept: 'application/json' },
        });

        console.log('[SIMSwapApproved] status:', response.status);

        if (!response.ok) {
          const text = await response.text();
          console.error('[SIMSwapApproved] error body:', text);
          throw new Error(`Approval fetch failed (${response.status})`);
        }

        const data = await response.json();
        console.log('[SIMSwapApproved] response:', data);

        if (!cancelled) {
          /* API returns NotificationRecord[] — pick the most recent approval notification */
          const notifications = Array.isArray(data) ? data : [data];
          const approvalNotification = notifications.find(
            (n: any) => n.type === 'approval' || n.message?.toLowerCase().includes('approved'),
          ) || notifications[0];

          setApproval(approvalNotification);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('[SIMSwapApproved] API error:', err);
        if (!cancelled) {
          setBanner(err.message || 'Failed to load approval details.');
          setLoading(false);
        }
      }
    };

    fetchApproval();
    return () => { cancelled = true; };
  }, [idNumber, baseUrl]);

  const copyRef = () => {
    const ref = approval?.attempt_id || approval?.id || 'N/A';
    Clipboard.setString(ref);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 1800);
  };

  const handleContinue = () => {
    if (navigate) {
      navigate('SIMSwapComplete', { id_number: idNumber });
    } else if (dispatch) {
      dispatch({ type: 'NAVIGATE', payload: { screen: 'SIMSwapComplete', params: { id_number: idNumber } } });
    }
  };

  const handleBack = () => {
    if (goBack) goBack();
    else if (dispatch) dispatch({ type: 'GO_BACK' });
  };

  /* Fallback: NotificationRecord doesn't include sim_number/msisdn, so we mock realistically */
  const simNumber = approval?.new_sim_number || '89927 01 1234 5678 9012';
  const msisdn = approval?.msisdn || '083 123 4567';
  const reference = approval?.attempt_id || approval?.id || 'SW-4820-3391';

  const totalDots = stepCount;
  const activeDot = Math.min(Math.max(activeStep, 1), totalDots) - 1;

  if (loading) {
    return (
      <SafeAreaView style={[styles.shell, styles.centered]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Typography variant="body" style={{ marginTop: 16 }}>
            Loading approval…
        </Typography>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <Container>
        <Card style={styles.cardContainer}>
          <View style={styles.iconContainer}>
            <View style={styles.halo} />
            <View style={styles.icon}>
              <View style={styles.iconInner} />
            </View>
          </View>

          <View style={styles.headlineContainer}>
            <Typography variant="h1" style={styles.headline}>
                SIM Swap Approved
            </Typography>
            <Typography variant="body" color="textSecondary" style={styles.subline}>
                Your request is complete. Insert your new SIM to finish activation.
            </Typography>
          </View>

          {!!banner && (
            <View style={[styles.banner, { marginBottom: 16 }]}>
              <Typography variant="body" style={styles.bannerText}>
                {banner}
              </Typography>
            </View>
          )}

          <View style={styles.detailsContainer}>
            <View style={styles.detailRow}>
              <Typography variant="caption" color="textSecondary" style={[styles.detailLabel, { fontWeight: '600' }]}>
                  New SIM number
              </Typography>
              <Typography variant="body" style={[styles.detailValue, { fontWeight: '800' }]}>
                {simNumber}
              </Typography>
            </View>
            <View style={styles.detailRow}>
              <Typography variant="caption" color="textSecondary" style={[styles.detailLabel, { fontWeight: '600' }]}>
                  Your mobile number
              </Typography>
              <Typography variant="body" style={[styles.detailValue, { fontWeight: '800' }]}>
                {msisdn}
              </Typography>
            </View>
            <View style={styles.detailRow}>
              <Typography variant="caption" color="textSecondary" style={[styles.detailLabel, { fontWeight: '600' }]}>
                  Reference
              </Typography>
              <Typography variant="body" style={[styles.detailValue, { fontWeight: '800' }]}>
                {reference}
              </Typography>
            </View>
            <View style={[styles.detailRow, styles.detailRowLast]}>
              <Typography variant="caption" color="textSecondary" style={[styles.detailLabel, { fontWeight: '600' }]}>
                  Status
              </Typography>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Typography variant="caption" style={styles.statusText}>
                    Approved
                </Typography>
              </View>
            </View>
          </View>

          {showNextStep && (
            <View style={styles.nextStepContainer}>
              <View style={styles.nextStepIcon}>
                <View style={styles.nextStepIconInner} />
              </View>
              <Typography variant="body" color="textSecondary" style={styles.nextStepText}>
                    Your current SIM stops working within 30 minutes.
              </Typography>
            </View>
          )}

          <View style={styles.spacer} />

          <View style={styles.actionContainer}>
            <Button onPress={handleContinue} variant="primary">
                Continue
            </Button>
            {showSecondaryAction && (
              <Button
                onPress={copyRef}
                variant="outline"
                style={[styles.secondaryButton, copied && styles.copyButtonSuccess]}
              >
                {copied ? 'Reference copied' : 'Copy reference'}
              </Button>
            )}
          </View>

          <View style={styles.dotsContainer}>
            {Array.from({ length: totalDots }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === activeDot ? styles.dotActive : styles.dotInactive]}
              />
            ))}
          </View>
        </Card>
      </Container>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: Colors.background },
  centered: { justifyContent: 'center', alignItems: 'center' },
  cardContainer: { paddingHorizontal: 24, paddingVertical: 16, alignItems: 'center' },
  iconContainer: { position: 'relative', width: 96, height: 96, marginTop: 46, marginBottom: 26 },
  halo: { position: 'absolute', inset: 0, borderRadius: 48, backgroundColor: 'rgba(47,169,107,0.28)' },
  icon: { ...StyleSheet.absoluteFill, borderRadius: 48, backgroundColor: '#1E9E5F',
    justifyContent: 'center', alignItems: 'center', shadowColor: '#1E9E5F',
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.34, shadowRadius: 28, elevation: 10 },
  iconInner: { width: 44, height: 44, borderBottomWidth: 4, borderRightWidth: 4,
    borderColor: Colors.surface, transform: [{ rotate: '45deg' }] },
  headlineContainer: { alignItems: 'center', gap: 9, marginBottom: 28 },
  headline: { fontSize: 26, lineHeight: 31, fontWeight: '800', color: Colors.text, letterSpacing: -0.6, textAlign: 'center' },
  subline: { fontSize: 14.5, lineHeight: 22, fontWeight: '500', textAlign: 'center', maxWidth: 265 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#F3C9C3',
    borderRadius: 16, backgroundColor: '#FEF3F1', padding: 13, width: '100%' },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#7A2820', lineHeight: 19 },
  detailsContainer: { width: '100%', borderWidth: 1.5, borderColor: '#ECE8DF', borderRadius: 20,
    backgroundColor: Colors.surface, paddingVertical: 4, paddingHorizontal: 18,
    shadowColor: Colors.secondary, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04,
    shadowRadius: 2, elevation: 2 },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F4F1EA' },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { fontSize: 13, color: '#6B6559', flex: 1 },
  detailValue: { fontSize: 14.5, color: Colors.text, letterSpacing: 0.3, fontVariant: ['tabular-nums'] },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5,
    paddingHorizontal: 11, borderRadius: 999, backgroundColor: '#E4F5EA', borderWidth: 1, borderColor: '#C4E7D2' },
  statusDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#2FA96B' },
  statusText: { fontSize: 12.5, fontWeight: '700', color: '#1F7A4C' },
  nextStepContainer: { flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1.5,
    borderColor: '#F0DE9C', borderRadius: 16, backgroundColor: '#FFFCF2', padding: 14,
    marginTop: 16, width: '100%' },
  nextStepIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FFF3C9',
    justifyContent: 'center', alignItems: 'center' },
  nextStepIconInner: { width: 16, height: 16, borderWidth: 2,
    borderColor: Colors.text, borderRadius: 2 },
  nextStepText: { flex: 1, fontSize: 13.5, lineHeight: 20, fontWeight: '500', color: '#4A453D' },
  spacer: { flex: 1 },
  actionContainer: { gap: 10, width: '100%', marginTop: 24 },
  secondaryButton: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: '#F0DE9C' },
  copyButtonSuccess: { borderColor: '#2FA96B', backgroundColor: '#E4F5EA' },
  dotsContainer: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', paddingVertical: 22 },
  dot: { height: 7, borderRadius: 4 },
  dotActive: { width: 22, backgroundColor: Colors.primary },
  dotInactive: { width: 7, backgroundColor: '#E2DFD7' },
});