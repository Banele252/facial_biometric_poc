import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Typography, Button, Input, Card } from '@/components/ui';
import { Colors, Spacing } from '@/theme';
import { stamp, type LedgerEntry } from '@/shared/ledger-entry';
import { Ledger, SelfieCapture } from '@/components';

import {
  validateId,
  captureSelfie,
  checkLiveness,
  verifyIdentity,
  getHistory,
  getNotifications,
  getDeviceId,
  CHECK_LABELS,
  type DecisionStatus,
  type LivenessResponse,
  type TransactionKind,
  type ValidationResponse,
  type VerificationDecision,
} from '@/shared/api';

type Step = 'id' | 'face' | 'confirm' | 'done';

const STEPS: { key: Step; label: string }[] = [
  { key: 'id', label: 'Identity' },
  { key: 'face', label: 'Face scan' },
  { key: 'confirm', label: 'Confirm' },
  { key: 'done', label: 'Result' },
];

const OUTCOME_COPY: Record<
    DecisionStatus,
    { tone: string; mark: string; title: string; ledger: string }
> = {
  approved: {
    tone: 'pass',
    mark: '✓',
    title: 'Identity verified',
    ledger: 'Identity verified',
  },
  rejected: {
    tone: 'fail',
    mark: '✗',
    title: 'We could not verify you',
    ledger: 'Verification declined',
  },
  review: {
    tone: 'review',
    mark: '◷',
    title: 'One more check to go',
    ledger: 'Sent for manual review',
  },
};

const WILL_RECORD = [
  'ID number check',
  'Face image reference',
  'Liveness result and score',
  'Verification decision',
  'Notifications sent',
];

const RUNNING_STEPS = [
  'Checking the ID number',
  'Matching the SIM registration (RICA)',
  'Verifying the ID with the external provider',
  'Comparing your face to Home Affairs',
];

export default function MainFlow() {
  const [step, setStep] = useState<Step>('id');
  const [idNumber, setIdNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [msisdn, setMsisdn] = useState('');
  const [newSim, setNewSim] = useState('');
  const [transaction, setTransaction] = useState<TransactionKind>('sim_swap');
  const [targetNetwork, setTargetNetwork] = useState('');
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [selfieId, setSelfieId] = useState<string | null>(null);
  const [liveness, setLiveness] = useState<LivenessResponse | null>(null);
  const [decision, setDecision] = useState<VerificationDecision | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  function record(label: string, kind: LedgerEntry['kind'], detail?: string) {
    setEntries((prev) => [...prev, stamp(label, kind, detail)]);
  }

  function startOver() {
    setStep('id');
    setIdNumber('');
    setFullName('');
    setMsisdn('');
    setNewSim('');
    setTransaction('sim_swap');
    setTargetNetwork('');
    setValidation(null);
    setSelfieId(null);
    setLiveness(null);
    setDecision(null);
    setEntries([]);
    setError(null);
  }

  async function onValidate() {
    setLoading(true);
    setError(null);
    try {
      const result = await validateId(idNumber.trim());
      setValidation(result);
      if (result.valid) {
        record(
          'ID number accepted',
          'pass',
          `${result.id_number_length} digits · all checks passed`,
        );
        setStep('face');
      } else {
        record('ID number rejected', 'fail', result.failed_checks.join(', '));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The check could not be completed. Try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function onCapture(dataUrl: string) {
    setLoading(true);
    setError(null);
    setLiveness(null);
    try {
      const selfie = await captureSelfie(idNumber.trim(), dataUrl);
      setSelfieId(selfie.selfie_id);
      record(
        'Image stored',
        'info',
        `${selfie.selfie_id.slice(0, 12)}… · ${selfie.content_type}`,
      );

      const live = await checkLiveness(selfie.selfie_id);
      setLiveness(live);
      if (live.is_live) {
        record(
          'Live person confirmed',
          'pass',
          `score ${live.score} · ${live.provider}`,
        );
        setStep('confirm');
      } else {
        record(
          'Liveness not confirmed',
          'fail',
          `score ${live.score} · ${live.detail}`,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The scan could not be completed. Try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function onConfirm() {
    if (!selfieId) return;
    setLoading(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const result = await verifyIdentity({
        id_number: idNumber.trim(),
        selfie_id: selfieId,
        full_name: fullName.trim() || undefined,
        msisdn: msisdn.trim() || undefined,
        new_sim_number: newSim.trim() || undefined,
        device_id: deviceId,
        transaction,
        target_network: targetNetwork.trim() || undefined,
      });
      setDecision(result);

      for (const c of result.checks) {
        record(
          c.label,
          c.status === 'pass' ? 'pass' : c.status === 'fail' ? 'fail' : 'info',
          [c.detail, c.score !== null ? `score ${c.score}` : null]
            .filter(Boolean)
            .join(' · '),
        );
      }

      record(
        OUTCOME_COPY[result.status].ledger,
        result.status === 'approved'
          ? 'pass'
          : result.status === 'rejected'
            ? 'fail'
            : 'info',
        result.method,
      );

      const id = idNumber.trim();
      const inbox = await getNotifications(id);
      if (inbox.length > 0) {
        record('You were notified', 'info', inbox.map((n) => n.channel).join(', '));
      }
      setStep('done');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Verification could not be completed. Try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.topbar}>
        <Typography
          variant="caption"
          style={{ fontWeight: '700', color: '#FFCC00' }}
        >
            MTN
        </Typography>
        <Typography
          variant="caption"
          color="textLight"
          style={{ marginLeft: 8 }}
        >
            SIM swap · identity check
        </Typography>
        <Typography
          variant="caption"
          style={{
            marginLeft: 'auto',
            color: '#8B9099',
            textTransform: 'uppercase',
          }}
        >
            Secure
        </Typography>
      </View>

      <View style={styles.layout}>
        <View style={styles.stage}>
          {/* Step Spine */}
          <View style={styles.spine}>
            {STEPS.map((s, i) => (
              <View
                key={s.key}
                style={[
                  styles.spineStep,
                  i === stepIndex && styles.spineStepCurrent,
                ]}
              >
                <View style={styles.spineNode}>
                  <View
                    style={[
                      styles.spineDot,
                      i < stepIndex && styles.spineDotDone,
                      i === stepIndex && styles.spineDotCurrent,
                    ]}
                  >
                    <Typography
                      variant="caption"
                      style={{
                        color: i < stepIndex
                          ? '#FFCC00'
                          : i === stepIndex
                            ? '#101114'
                            : '#6E727A',
                      }}
                    >
                      {i < stepIndex ? '✓' : i + 1}
                    </Typography>
                  </View>
                  <Typography
                    variant="caption"
                    style={{
                      fontSize: 10,
                      marginTop: 4,
                      color: i === stepIndex ? '#101114' : '#6E727A',
                    }}
                  >
                    {s.label}
                  </Typography>
                </View>
                {i < STEPS.length - 1 && (
                  <View
                    style={[
                      styles.spineLine,
                      i < stepIndex && styles.spineLineDone,
                    ]}
                  />
                )}
              </View>
            ))}
          </View>

          {error && (
            <View style={styles.alert}>
              <Typography variant="caption" color="error">
                    Error: {error}
              </Typography>
            </View>
          )}

          {step === 'id' && (
            <Card style={styles.card}>
              <Typography
                variant="caption"
                style={{
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  color: '#6E727A',
                  marginBottom: 8,
                }}
              >
                    Step 1 of 4 · Identity
              </Typography>
              <Typography variant="h1" style={{ marginBottom: 8 }}>
                    Your SIM swap details
              </Typography>
              <Typography variant="subtitle" style={{ marginBottom: 24 }}>
                    We check these against the registration on your SIM before
                    anything is verified.
              </Typography>

              <View style={{ gap: 12, marginBottom: 16 }}>
                <Typography variant="caption" style={{ fontWeight: '700' }}>
                      What are you doing?
                </Typography>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    variant={transaction === 'sim_swap' ? 'primary' : 'secondary'}
                    size="md"
                    onPress={() => setTransaction('sim_swap')}
                  >
                        Swap my SIM
                  </Button>
                  <Button
                    variant={transaction === 'number_port' ? 'primary' : 'secondary'}
                    size="md"
                    onPress={() => setTransaction('number_port')}
                  >
                        Move my number
                  </Button>
                </View>
              </View>

              <View style={{ gap: Spacing.md }}>
                <Input
                  label="SA ID number"
                  value={idNumber}
                  onChangeText={setIdNumber}
                  placeholder="0000000000000"
                  keyboardType="numeric"
                  maxLength={13}
                />
                <Input
                  label="Full name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="As registered on your SIM"
                />
                <Input
                  label="Number being swapped"
                  value={msisdn}
                  onChangeText={setMsisdn}
                  placeholder="0820000000"
                  keyboardType="phone-pad"
                />
                {transaction === 'sim_swap' ? (
                  <Input
                    label="New SIM number"
                    value={newSim}
                    onChangeText={setNewSim}
                    placeholder="Printed on the new SIM"
                    keyboardType="numeric"
                  />
                ) : (
                  <Input
                    label="Network you are moving to"
                    value={targetNetwork}
                    onChangeText={setTargetNetwork}
                    placeholder="Receiving network"
                  />
                )}
              </View>

              <Button
                variant="primary"
                onPress={onValidate}
                disabled={loading || idNumber.trim().length === 0}
                style={{ marginTop: 24 }}
              >
                {loading ? 'Checking…' : 'Check my details'}
              </Button>

              {validation && !validation.valid && (
                <View style={{ marginTop: 16, gap: 4 }}>
                  {Object.entries(validation.checks).map(([name, passed]) => (
                    <View
                      key={name}
                      style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
                    >
                      <Typography
                        variant="caption"
                        color={passed ? 'success' : 'error'}
                      >
                        {passed ? '✓' : '✗'}
                      </Typography>
                      <Typography variant="caption">
                        {CHECK_LABELS[name] ?? name}
                      </Typography>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          )}

          {step === 'face' && (
            <Card style={styles.card}>
              <Typography
                variant="caption"
                style={{
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  color: '#6E727A',
                  marginBottom: 8,
                }}
              >
                    Step 2 of 4 · Face scan
              </Typography>
              <Typography variant="h1" style={{ marginBottom: 8 }}>
                    Scan your face
              </Typography>
              <Typography variant="subtitle" style={{ marginBottom: 24 }}>
                    Hold your phone at eye level in good light. Stay still — we check
                    that a live person is present, not a photo.
              </Typography>

              <SelfieCapture onCapture={onCapture} loading={loading} />

              {loading && (
                <Typography
                  variant="caption"
                  style={{ marginTop: 12, textAlign: 'center' }}
                >
                        Checking that you are live…
                </Typography>
              )}
              {liveness && !liveness.is_live && (
                <View
                  style={{
                    marginTop: 16,
                    padding: 12,
                    backgroundColor: '#fbeceb',
                    borderRadius: 10,
                  }}
                >
                  <Typography variant="caption" color="error">
                          ✗ {liveness.detail}
                  </Typography>
                </View>
              )}
            </Card>
          )}

          {step === 'confirm' && !loading && (
            <Card style={styles.card}>
              <Typography
                variant="caption"
                style={{
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  color: '#6E727A',
                  marginBottom: 8,
                }}
              >
                    Step 3 of 4 · Confirm
              </Typography>
              <Typography variant="h1" style={{ marginBottom: 8 }}>
                    Confirm your SIM swap
              </Typography>
              <Typography variant="subtitle" style={{ marginBottom: 24 }}>
                    Your face matched a live capture. Confirming runs the remaining
                    identity checks and records the outcome against your number.
              </Typography>

              <View
                style={{
                  marginBottom: 24,
                  padding: 12,
                  backgroundColor: '#e8f4ec',
                  borderRadius: 10,
                }}
              >
                <Typography variant="body" color="success">
                      ✓ Live person confirmed — score {liveness?.score} via{' '}
                  {liveness?.provider}.
                </Typography>
              </View>

              <View style={{ gap: 8 }}>
                <Button variant="primary" onPress={onConfirm}>
                      Confirm and verify
                </Button>
                <Button variant="ghost" onPress={startOver}>
                      Cancel
                </Button>
              </View>
            </Card>
          )}

          {step === 'confirm' && loading && (
            <Card style={styles.card}>
              <Typography
                variant="caption"
                style={{
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  color: '#6E727A',
                  marginBottom: 8,
                }}
              >
                    Step 3 of 4 · Running checks
              </Typography>
              <Typography variant="h1" style={{ marginBottom: 8 }}>
                    Checking your identity
              </Typography>
              <Typography variant="subtitle" style={{ marginBottom: 24 }}>
                    This takes about fifteen seconds. Keep this screen open.
              </Typography>

              <View style={{ gap: 8 }}>
                {RUNNING_STEPS.map((label, idx) => (
                  <View
                    key={label}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: Colors.primary,
                        opacity: 0.25 + idx * 0.2,
                      }}
                    />
                    <Typography variant="body" color="textSecondary">
                      {label}
                    </Typography>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {step === 'done' && decision && (
            <Card style={styles.card}>
              <View
                style={[
                  styles.outcomeSeal,
                  styles[OUTCOME_COPY[decision.status].tone as keyof typeof styles],
                ]}
              >
                <Typography variant="h2" style={{ fontSize: 32 }}>
                  {OUTCOME_COPY[decision.status].mark}
                </Typography>
              </View>
              <Typography variant="h1" style={{ textAlign: 'center' }}>
                {OUTCOME_COPY[decision.status].title}
              </Typography>
              <Typography variant="subtitle" style={{ textAlign: 'center', marginBottom: 24 }}>
                {decision.reason}
              </Typography>

              {decision.match_score !== null && (
                <View style={styles.matchReadout}>
                  <Typography variant="caption">
                          Face match against Home Affairs
                  </Typography>
                  <Typography variant="body" style={{ fontWeight: '700' }}>
                    {decision.match_score}/100
                  </Typography>
                </View>
              )}

              {decision.checks.length > 0 && (
                <View>
                  <Typography
                    variant="caption"
                    style={{ textTransform: 'uppercase', marginBottom: 8 }}
                  >
                          What we checked
                  </Typography>
                  <View style={{ gap: 8, marginBottom: 20 }}>
                    {decision.checks.map((c) => (
                      <View
                        key={c.name}
                        style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}
                      >
                        <Typography variant="caption" style={{ fontWeight: '700' }}>
                          {c.status === 'pass'
                            ? '✓'
                            : c.status === 'fail'
                              ? '✗'
                              : c.status === 'review'
                                ? '◷'
                                : '–'}
                        </Typography>
                        <View>
                          <Typography variant="body" style={{ fontWeight: '600' }}>
                            {c.label}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {c.detail}
                          </Typography>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <Button variant="ghost" onPress={startOver}>
                    Start another check
              </Button>
            </Card>
          )}
        </View>

        <Ledger entries={entries} pending={WILL_RECORD} />
      </View>
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
  layout: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  stage: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 400,
  },
  spine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 400,
    marginBottom: 24,
  },
  spineStep: {
    flex: 1,
    alignItems: 'center',
  },
  spineStepCurrent: {
    flex: 1,
  },
  spineNode: {
    alignItems: 'center',
  },
  spineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spineDotCurrent: {
    backgroundColor: '#FFCC00',
    borderColor: '#FFCC00',
  },
  spineDotDone: {
    backgroundColor: '#101114',
    borderColor: '#101114',
  },
  spineLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E4E4DF',
    marginTop: 14,
  },
  spineLineDone: {
    backgroundColor: '#101114',
  },
  alert: {
    backgroundColor: '#fbebeb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    width: '100%',
    maxWidth: 400,
  },
  outcomeSeal: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  pass: { backgroundColor: '#e8f4ec' },
  fail: { backgroundColor: '#fbeceb' },
  review: { backgroundColor: '#fdf3e0' },
  matchReadout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderColor: '#E4E4DF',
    borderRadius: 8,
    marginBottom: 16,
  },
});