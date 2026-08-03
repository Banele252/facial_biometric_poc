import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Typography, Button, Input, Card, Container } from '@/components/ui';
import { Colors, Spacing } from '@/theme';
import { stamp, type LedgerEntry } from '@/shared/ledger-entry';
import Ledger from '../components/Ledger';
import SelfieCapture from '../components/SelfieCapture';
import {
  validateId,
  verifyIdentity,
  type DecisionStatus,
  type VerificationDecision,
} from '@/shared/api';

type Step = 'id' | 'face' | 'confirm' | 'done';

const OUTCOME_COPY: Record<DecisionStatus, { mark: string; title: string }> = {
  approved: { mark: '✓', title: 'Identity verified' },
  rejected: { mark: '✗', title: 'We could not verify you' },
  review: { mark: '◷', title: 'One more check to go' },
};

const WILL_RECORD = [
  'ID number check',
  'Face image reference',
  'Liveness result and score',
  'Verification decision',
  'Notifications sent',
];

export default function MainFlow({ navigation }: any) {
  const [step, setStep] = useState<Step>('id');
  const [idNumber, setIdNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [msisdn, setMsisdn] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [decision, setDecision] = useState<any>(null);

  const record = (label: string, kind: LedgerEntry['kind'], detail?: string) => {
    setEntries((prev) => [...prev, stamp(label, kind, detail)]);
  };

  const startOver = () => {
    setStep('id');
    setIdNumber('');
    setFullName('');
    setMsisdn('');
    setEntries([]);
    setError(null);
  };

  const onValidate = async () => {
    setLoading(true);
    try {
      const result = await validateId(idNumber.trim());
      if (result.valid) {
        record('ID number accepted', 'pass');
        setStep('face');
      } else {
        record('ID number rejected', 'fail');
      }
    } catch {
      setError('Check failed');
    } finally {
      setLoading(false);
    }
  };

  const onConfirm = async () => {
    setLoading(true);
    try {
      const result = await verifyIdentity({
        id_number: idNumber.trim(),
        selfie_id: 'mock',
        device_id: 'mock',
      });
      setDecision(result);
      setStep('done');
    } catch {
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.topbar}>
        <Typography variant="caption" style={{ fontWeight: '700', color: '#FFCC00' }}>
                    MTN
        </Typography>
        <Typography variant="caption" color="textLight" style={{ marginLeft: 8 }}>
                    SIM swap &middot; identity check
        </Typography>
        <Typography
          variant="caption"
          style={{ marginLeft: 'auto', color: '#8B9099', textTransform: 'uppercase' }}
        >
                    Secure
        </Typography>
      </View>

      <Container style={{ flex: 1, paddingTop: 24, paddingBottom: 24 }}>
        {error && (
          <View style={styles.errorBox}>
            <Typography variant="caption" color="error" align="center">
              {error}
            </Typography>
          </View>
        )}

        {step === 'id' && (
          <View style={{ gap: Spacing.md }}>
            <Typography variant="h1" align="center">
                            Let&apos;s check your identity
            </Typography>
            <Typography variant="subtitle" align="center">
                            We&apos;ll verify your ID and face to keep your SIM safe.
            </Typography>
            <Input
              label="South African ID number"
              value={idNumber}
              onChangeText={setIdNumber}
              placeholder="eg. 8801011234089"
              keyboardType="numeric"
              maxLength={13}
            />
            <Input
              label="Full name (optional)"
              value={fullName}
              onChangeText={setFullName}
              placeholder="as it appears on ID"
            />
            <Input
              label="Mobile number (optional)"
              value={msisdn}
              onChangeText={setMsisdn}
              placeholder="eg. 0821234567"
              keyboardType="phone-pad"
            />
            <Button
              variant="primary"
              onPress={onValidate}
              disabled={!idNumber.trim() || loading}
            >
              {loading ? <ActivityIndicator color={Colors.text} /> : 'Verify ID'}
            </Button>
            <Button variant="ghost" onPress={startOver}>
                            Start over
            </Button>
          </View>
        )}

        {step === 'face' && (
          <View style={{ gap: Spacing.md, flex: 1 }}>
            <Typography variant="h2" align="center">
                            Face scan
            </Typography>
            <Typography variant="subtitle" align="center">
                            Position your face in the frame and press capture.
            </Typography>
            <SelfieCapture
              onCapture={() => {
                setStep('confirm');
                record('Live person confirmed', 'pass');
              }}
              loading={loading}
            />
          </View>
        )}

        {step === 'confirm' && (
          <View style={{ gap: Spacing.md }}>
            <Typography variant="h1" align="center">
                            Confirm details
            </Typography>
            <Typography variant="subtitle" align="center">
                            We&apos;ll verify your identity now. This may take a moment.
            </Typography>
            <Card>
              <View style={styles.summaryRow}>
                <Typography variant="caption" color="textSecondary">
                                    ID number
                </Typography>
                <Typography variant="body" style={{ fontWeight: '600' }}>
                  {idNumber}
                </Typography>
              </View>
              {fullName && (
                <View style={styles.summaryRow}>
                  <Typography variant="caption" color="textSecondary">
                                        Name
                  </Typography>
                  <Typography variant="body" style={{ fontWeight: '600' }}>
                    {fullName}
                  </Typography>
                </View>
              )}
              {msisdn && (
                <View style={styles.summaryRow}>
                  <Typography variant="caption" color="textSecondary">
                                        Phone
                  </Typography>
                  <Typography variant="body" style={{ fontWeight: '600' }}>
                    {msisdn}
                  </Typography>
                </View>
              )}
            </Card>
            <Button variant="primary" onPress={onConfirm} disabled={loading}>
              {loading ? <ActivityIndicator color={Colors.text} /> : 'Confirm & verify'}
            </Button>
            <Button variant="ghost" onPress={startOver}>
                            Start over
            </Button>
          </View>
        )}

        {step === 'done' && (
          <View style={{ gap: Spacing.md, justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <View style={styles.resultIcon}>
              <Typography variant="h1" style={{ fontSize: 44 }}>
                {OUTCOME_COPY[(decision?.status ?? 'review') as DecisionStatus].mark}
              </Typography>
            </View>
            <Typography variant="h1" align="center">
              {OUTCOME_COPY[(decision?.status ?? 'review') as DecisionStatus].title}
            </Typography>
            <Typography variant="subtitle" align="center">
              {decision?.status === 'approved'
                ? 'Your identity has been verified successfully.'
                : decision?.status === 'rejected'
                  ? 'We could not verify your identity.'
                  : 'One of our agents will review your details shortly.'}
            </Typography>
            <Button variant="primary" onPress={startOver}>
                            Start a new check
            </Button>
          </View>
        )}
      </Container>
      <Ledger entries={entries} pending={WILL_RECORD} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#F5F5F2' },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#101114',
  },
  errorBox: {
    backgroundColor: Colors.errorBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    width: '100%',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  resultIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0F0EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
});