import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Typography, Button, Input, Card, Container } from '@/components/ui';
import { Colors, Spacing } from '@/theme';
import { stamp, type LedgerEntry } from '@/shared/ledger-entry';
import Ledger from '../components/Ledger';
import SelfieCapture from '../components/SelfieCapture';
import DocumentCapture from '../components/DocumentCapture';
import {
  captureSelfie,
  checkLiveness,
  getDeviceId,
  validateId,
  verifyIdentity,
  type DecisionStatus,
  type DocumentKind,
  type VerificationDecision,
} from '@/shared/api';

type Step = 'id' | 'document' | 'face' | 'confirm' | 'done';

const OUTCOME_COPY: Record<DecisionStatus, { mark: string; title: string }> = {
  approved: { mark: '✓', title: 'Identity verified' },
  rejected: { mark: '✗', title: 'We could not verify you' },
  review: { mark: '◷', title: 'One more check to go' },
};

const WILL_RECORD = [
  'ID number check',
  'ID document scan',
  'Face image reference',
  'Liveness result and score',
  'Verification decision',
  'Notifications sent',
];

/* The process lets a mistyped ID be re-entered rather than ending the journey
 * there — but the loop is not infinite. */
const MAX_ID_ATTEMPTS = 3;

/* "Multiple tries, reminders to the customer to use sufficient light" — shown
 * from the second failed scan, when it is actually useful. */
const LIGHTING_REMINDER_AFTER = 1;

export default function MainFlow({ navigation, route }: any) {
  // Chosen on the previous screen. Defaults keep the screen usable if it is
  // ever reached directly, but the journey normally arrives with both set.
  const documentType: DocumentKind = route?.params?.documentType ?? 'SA_ID';
  const consent: boolean = route?.params?.consent ?? false;
  const isPassport = documentType === 'PASSPORT';
  const documentNoun = isPassport ? 'passport' : 'SA ID';

  const [step, setStep] = useState<Step>('id');
  const [idNumber, setIdNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [msisdn, setMsisdn] = useState('');
  const [newSim, setNewSim] = useState('');
  const [idAttempts, setIdAttempts] = useState(0);
  const [documentImage, setDocumentImage] = useState<string | null>(null);
  const [selfieId, setSelfieId] = useState<string | null>(null);
  const [livenessScore, setLivenessScore] = useState<number | null>(null);
  const [faceAttempts, setFaceAttempts] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [decision, setDecision] = useState<VerificationDecision | null>(null);

  const record = (label: string, kind: LedgerEntry['kind'], detail?: string) => {
    setEntries((prev) => [...prev, stamp(label, kind, detail)]);
  };

  const startOver = () => {
    setStep('id');
    setIdNumber('');
    setFullName('');
    setMsisdn('');
    setNewSim('');
    setIdAttempts(0);
    setDocumentImage(null);
    setSelfieId(null);
    setLivenessScore(null);
    setFaceAttempts(0);
    setDecision(null);
    setEntries([]);
    setError(null);
  };

  const onValidate = async () => {
    setError(null);
    // A passport number has no SA checksum to run against it, so the process
    // sends passport holders straight to the document scan — the number is
    // checked against the scanned document instead.
    if (isPassport) {
      record('Passport number accepted', 'info', 'No SA ID checksum applies');
      setStep('document');
      return;
    }

    setLoading(true);
    try {
      const result = await validateId(idNumber.trim());
      if (result.valid) {
        record('ID number accepted', 'pass', `${result.id_number_length} digits`);
        setStep('document');
      } else {
        setIdAttempts((n) => n + 1);
        record('ID number rejected', 'fail', result.failed_checks.join(', '));
        setError(
          idAttempts + 1 < MAX_ID_ATTEMPTS
            ? `That number is not valid. Attempt ${idAttempts + 1} of ${MAX_ID_ATTEMPTS}.`
            : 'That number still is not valid. Check your document and try again.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check could not be completed.');
    } finally {
      setLoading(false);
    }
  };

  const onDocumentCapture = (dataUrl: string) => {
    setDocumentImage(dataUrl);
    record('ID document captured', 'info', `${documentNoun} · ready to read`);
    setStep('face');
  };

  const onSelfieCapture = async (dataUrl: string) => {
    setLoading(true);
    setError(null);
    try {
      const selfie = await captureSelfie(idNumber.trim(), dataUrl);
      setSelfieId(selfie.selfie_id);
      record('Image stored', 'info', selfie.content_type);

      const live = await checkLiveness(selfie.selfie_id);
      setLivenessScore(live.score);
      if (live.is_live) {
        record('Live person confirmed', 'pass', `score ${live.score} · ${live.provider}`);
        setStep('confirm');
      } else {
        setFaceAttempts((n) => n + 1);
        record('Liveness not confirmed', 'fail', live.detail);
        setError(`${live.detail}. Move somewhere brighter and scan again.`);
      }
    } catch (err) {
      setFaceAttempts((n) => n + 1);
      setError(err instanceof Error ? err.message : 'The scan could not be completed.');
    } finally {
      setLoading(false);
    }
  };

  const onConfirm = async () => {
    if (!selfieId || !documentImage) return;
    setLoading(true);
    setError(null);
    try {
      const result = await verifyIdentity({
        id_number: idNumber.trim(),
        selfie_id: selfieId,
        consent,
        document_type: documentType,
        document_image: documentImage,
        full_name: fullName.trim() || undefined,
        msisdn: msisdn.trim() || undefined,
        new_sim_number: newSim.trim() || undefined,
        device_id: getDeviceId(),
      });
      setDecision(result);

      // Each backend check becomes its own ledger line, so the trail shows
      // what every stage returned rather than only the final verdict.
      for (const c of result.checks) {
        record(
          c.label,
          c.status === 'pass' ? 'pass' : c.status === 'fail' ? 'fail' : 'info',
          c.detail,
        );
      }
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification could not be completed.');
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
                            We&apos;ll verify your {documentNoun}, your face and your SIM
                            registration.
            </Typography>
            <Input
              label={isPassport ? 'Passport number' : 'South African ID number'}
              value={idNumber}
              onChangeText={setIdNumber}
              placeholder={isPassport ? 'as printed on your passport' : 'eg. 8801011234089'}
              keyboardType={isPassport ? 'default' : 'numeric'}
              maxLength={isPassport ? 32 : 13}
            />
            <Input
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder={`as it appears on your ${documentNoun}`}
            />
            <Input
              label="Mobile number"
              value={msisdn}
              onChangeText={setMsisdn}
              placeholder="eg. 0821234567"
              keyboardType="phone-pad"
            />
            <Input
              label="New SIM number (optional)"
              value={newSim}
              onChangeText={setNewSim}
              placeholder="printed on the new SIM"
            />
            <Button
              variant="primary"
              onPress={onValidate}
              disabled={!idNumber.trim() || loading}
            >
              {loading ? <ActivityIndicator color={Colors.text} /> : 'Continue'}
            </Button>
            <Button variant="ghost" onPress={startOver}>
                            Start over
            </Button>
          </View>
        )}

        {step === 'document' && (
          <View style={{ gap: Spacing.md, flex: 1 }}>
            <Typography variant="h2" align="center">
                            Photograph your {documentNoun}
            </Typography>
            <Typography variant="subtitle" align="center">
                            We read your name and number off it, and compare its photo
                            to your face.
            </Typography>
            <DocumentCapture
              onCapture={onDocumentCapture}
              loading={loading}
              documentNoun={documentNoun}
            />
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
            <SelfieCapture onCapture={onSelfieCapture} loading={loading} />
            {faceAttempts > LIGHTING_REMINDER_AFTER && (
              <Typography variant="caption" color="textSecondary" align="center">
                                Still not working? Face a window or a lamp so the light falls
                                on your face rather than behind you, and take off hats or
                                sunglasses.
              </Typography>
            )}
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
              <View style={styles.summaryRow}>
                <Typography variant="caption" color="textSecondary">
                                    Document
                </Typography>
                <Typography variant="body" style={{ fontWeight: '600' }}>
                  {isPassport ? 'Passport' : 'SA ID'} · captured
                </Typography>
              </View>
              {livenessScore !== null && (
                <View style={styles.summaryRow}>
                  <Typography variant="caption" color="textSecondary">
                                        Liveness
                  </Typography>
                  <Typography variant="body" style={{ fontWeight: '600' }}>
                                        Confirmed · {livenessScore}
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
          <View style={{ gap: Spacing.md, alignItems: 'center', flex: 1 }}>
            <View style={styles.resultIcon}>
              <Typography variant="h1" style={{ fontSize: 44 }}>
                {OUTCOME_COPY[(decision?.status ?? 'review') as DecisionStatus].mark}
              </Typography>
            </View>
            <Typography variant="h1" align="center">
              {OUTCOME_COPY[(decision?.status ?? 'review') as DecisionStatus].title}
            </Typography>
            {/* The backend's own words. It knows which check failed and why;
                repeating a generic sentence here would hide that. */}
            <Typography variant="subtitle" align="center">
              {decision?.reason ?? 'One of our agents will review your details shortly.'}
            </Typography>

            {decision?.match_score != null && (
              <Card>
                <View style={styles.summaryRow}>
                  <Typography variant="caption" color="textSecondary">
                                        Home Affairs face match
                  </Typography>
                  <Typography variant="body" style={{ fontWeight: '600' }}>
                    {decision.match_score}/100
                  </Typography>
                </View>
              </Card>
            )}

            {decision?.authorisation_token && (
              <Card>
                <View style={styles.summaryRow}>
                  <Typography variant="caption" color="textSecondary">
                                        Authorisation reference
                  </Typography>
                  <Typography variant="body" style={{ fontWeight: '600' }}>
                    {decision.authorisation_token.slice(0, 12)}…
                  </Typography>
                </View>
              </Card>
            )}

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