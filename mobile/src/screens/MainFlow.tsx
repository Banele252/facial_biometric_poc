import React, { useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView,
    StyleSheet, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import {
    CHECK_LABELS,
    captureSelfie,
    checkLiveness,
    getDeviceId,
    getHistory,
    getNotifications,
    validateId,
    verifyIdentity,
    type AttemptRecord,
    type DecisionStatus,
    type LivenessResponse,
    type NotificationRecord,
    type TransactionKind,
    type ValidationResponse,
    type VerificationDecision,
} from '../shared/api';
import { stamp, type LedgerEntry } from '../shared/ledger-entry';
import Ledger from '../components/Ledger';
import SelfieCapture from '../components/SelfieCapture';

type Step = 'id' | 'face' | 'confirm' | 'done';

const STEPS: { key: Step; label: string }[] = [
    { key: 'id', label: 'Identity' },
    { key: 'face', label: 'Face scan' },
    { key: 'confirm', label: 'Confirm' },
    { key: 'done', label: 'Result' },
];

const OUTCOME_COPY: Record<DecisionStatus, { tone: string; mark: string; title: string; ledger: string }> = {
    approved: { tone: 'pass', mark: '✓', title: 'Identity verified', ledger: 'Identity verified' },
    rejected: { tone: 'fail', mark: '✗', title: 'We could not verify you', ledger: 'Verification declined' },
    review: { tone: 'review', mark: '◷', title: 'One more check to go', ledger: 'Sent for manual review' },
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
    const [newSim, setNewSim] = useState('');
    const [transaction, setTransaction] = useState<TransactionKind>('sim_swap');
    const [targetNetwork, setTargetNetwork] = useState('');
    const [validation, setValidation] = useState<ValidationResponse | null>(null);
    const [selfieId, setSelfieId] = useState<string | null>(null);
    const [liveness, setLiveness] = useState<LivenessResponse | null>(null);
    const [decision, setDecision] = useState<VerificationDecision | null>(null);
    const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
    const [history, setHistory] = useState<AttemptRecord[]>([]);
    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const record = (label: string, kind: LedgerEntry['kind'], detail?: string) => {
        setEntries((prev) => [...prev, stamp(label, kind, detail)]);
    };

    const startOver = () => {
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
        setNotifications([]);
        setHistory([]);
        setEntries([]);
        setError(null);
    };

    const onValidate = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await validateId(idNumber.trim());
            setValidation(result);
            if (result.valid) {
                record('ID number accepted', 'pass', `${result.id_number_length} digits · all checks passed`);
                setStep('face');
            } else {
                record('ID number rejected', 'fail', result.failed_checks.join(', '));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'The check could not be completed. Try again.');
        } finally {
            setLoading(false);
        }
    };

    const onCapture = async (dataUrl: string) => {
        setLoading(true);
        setError(null);
        setLiveness(null);
        try {
            const selfie = await captureSelfie(idNumber.trim(), dataUrl);
            setSelfieId(selfie.selfie_id);
            record('Image stored', 'info', `${selfie.selfie_id.slice(0, 12)}… · ${selfie.content_type}`);

            const live = await checkLiveness(selfie.selfie_id);
            setLiveness(live);
            if (live.is_live) {
                record('Live person confirmed', 'pass', `score ${live.score} · ${live.provider}`);
                setStep('confirm');
            } else {
                record('Liveness not confirmed', 'fail', `score ${live.score} · ${live.detail}`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'The scan could not be completed. Try again.');
        } finally {
            setLoading(false);
        }
    };

    const onConfirm = async () => {
        if (!selfieId) return;
        setLoading(true);
        setError(null);
        try {
            const result = await verifyIdentity({
                id_number: idNumber.trim(),
                selfie_id: selfieId,
                full_name: fullName.trim() || undefined,
                msisdn: msisdn.trim() || undefined,
                new_sim_number: newSim.trim() || undefined,
                device_id: await getDeviceId(),
                transaction,
                target_network: targetNetwork.trim() || undefined,
            });
            setDecision(result);

            for (const c of result.checks) {
                record(
                    c.label,
                    c.status === 'pass' ? 'pass' : c.status === 'fail' ? 'fail' : 'info',
                    [c.detail, c.score !== null ? `score ${c.score}` : null].filter(Boolean).join(' · ')
                );
            }

            record(
                OUTCOME_COPY[result.status].ledger,
                result.status === 'approved' ? 'pass' : result.status === 'rejected' ? 'fail' : 'info',
                result.method
            );

            const id = idNumber.trim();
            const [inbox, past] = await Promise.all([getNotifications(id), getHistory(id)]);
            setNotifications(inbox);
            setHistory(past);
            if (inbox.length > 0) {
                record('You were notified', 'info', inbox.map((n) => n.channel).join(', '));
            }
            setStep('done');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Verification could not be completed. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.shell}>
            <StatusBar style="dark" />
            <View style={styles.topbar}>
                <Text style={styles.brandmark}>MTN</Text>
                <Text style={styles.topbarTitle}>SIM swap · identity check</Text>
                <Text style={styles.topbarEnv}>Secure</Text>
            </View>
            <ScrollView contentContainerStyle={styles.layout}>
                <View style={styles.stage}>
                    {error && (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    {step === 'id' && (
                        <View style={styles.formContainer}>
                            <Text style={styles.headline}>Let's check your identity</Text>
                            <Text style={styles.subhead}>We'll verify your ID and face to keep your SIM safe.</Text>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>South African ID number</Text>
                                <TextInput
                                    style={styles.input}
                                    value={idNumber}
                                    onChangeText={setIdNumber}
                                    placeholder="eg. 8801011234089"
                                    keyboardType="numeric"
                                    maxLength={13}
                                    editable={!loading}
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Full name (optional)</Text>
                                <TextInput
                                    style={styles.input}
                                    value={fullName}
                                    onChangeText={setFullName}
                                    placeholder="as it appears on ID"
                                    editable={!loading}
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Mobile number (optional)</Text>
                                <TextInput
                                    style={styles.input}
                                    value={msisdn}
                                    onChangeText={setMsisdn}
                                    placeholder="eg. 0821234567"
                                    keyboardType="phone-pad"
                                    editable={!loading}
                                />
                            </View>

                            <Pressable
                                style={[styles.primaryButton, !idNumber.trim() && styles.disabledButton]}
                                onPress={onValidate}
                                disabled={!idNumber.trim() || loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#14110C" />
                                ) : (
                                    <Text style={styles.primaryText}>Verify ID</Text>
                                )}
                            </Pressable>
                            <Pressable style={styles.tertiaryButton} onPress={startOver}>
                                <Text style={styles.tertiaryText}>Start over</Text>
                            </Pressable>
                        </View>
                    )}

                    {step === 'face' && (
                        <View style={styles.formContainer}>
                            <Text style={styles.headline}>Face scan</Text>
                            <Text style={styles.subhead}>Position your face in the frame and press capture.</Text>
                            <SelfieCapture onCapture={onCapture} loading={loading} />
                        </View>
                    )}

                    {step === 'confirm' && (
                        <View style={styles.formContainer}>
                            <Text style={styles.headline}>Confirm details</Text>
                            <Text style={styles.subhead}>We'll verify your identity now. This may take a moment.</Text>

                            <View style={styles.summaryCard}>
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>ID number</Text>
                                    <Text style={styles.summaryValue}>{idNumber}</Text>
                                </View>
                                {fullName ? (
                                    <View style={styles.summaryRow}>
                                        <Text style={styles.summaryLabel}>Name</Text>
                                        <Text style={styles.summaryValue}>{fullName}</Text>
                                    </View>
                                ) : null}
                                {msisdn ? (
                                    <View style={styles.summaryRow}>
                                        <Text style={styles.summaryLabel}>Phone number</Text>
                                        <Text style={styles.summaryValue}>{msisdn}</Text>
                                    </View>
                                ) : null}
                            </View>

                            <Pressable style={styles.primaryButton} onPress={onConfirm} disabled={loading}>
                                {loading ? (
                                    <ActivityIndicator color="#14110C" />
                                ) : (
                                    <Text style={styles.primaryText}>Confirm & verify</Text>
                                )}
                            </Pressable>
                            <Pressable style={styles.tertiaryButton} onPress={startOver}>
                                <Text style={styles.tertiaryText}>Start over</Text>
                            </Pressable>
                        </View>
                    )}

                    {step === 'done' && (
                        <View style={styles.formContainer}>
                            <View style={styles.resultIcon}>
                                <Text style={styles.resultMark}>{OUTCOME_COPY[decision?.status ?? 'review'].mark}</Text>
                            </View>
                            <Text style={styles.headline}>{OUTCOME_COPY[decision?.status ?? 'review'].title}</Text>
                            <Text style={styles.subhead}>
                                {decision?.status === 'approved' ? 'Your identity has been verified successfully.' :
                                    decision?.status === 'rejected' ? 'We could not verify your identity.' :
                                        'One of our agents will review your details shortly.'}
                            </Text>
                            <Pressable style={styles.primaryButton} onPress={startOver}>
                                <Text style={styles.primaryText}>Start a new check</Text>
                            </Pressable>
                        </View>
                    )}
                </View>
                <Ledger entries={entries} pending={WILL_RECORD} />
            </ScrollView>
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
    brandmark: {
        fontFamily: 'monospace',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1.6,
        backgroundColor: '#FFCC00',
        color: '#101114',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 3,
    },
    topbarTitle: { color: '#CFD2D6', fontSize: 13, marginLeft: 8 },
    topbarEnv: {
        marginLeft: 'auto',
        color: '#8B9099',
        fontSize: 11,
        textTransform: 'uppercase',
    },
    layout: { flexGrow: 1, flexDirection: 'row', flexWrap: 'wrap' },
    stage: { flex: 1, padding: 24, alignItems: 'center' },
    formContainer: { flex: 1, width: '100%', maxWidth: 400, gap: 16 },
    headline: { fontSize: 24, fontWeight: '700', color: '#14110C', textAlign: 'center' },
    subhead: { fontSize: 15, color: '#5C574E', textAlign: 'center', marginBottom: 16 },
    inputGroup: { gap: 6 },
    label: { fontSize: 13, fontWeight: '600', color: '#5C574E' },
    input: {
        backgroundColor: '#FFFFFF',
        borderColor: '#E0DDD6',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#14110C',
    },
    primaryButton: {
        height: 54,
        borderRadius: 27,
        backgroundColor: '#FFCB05',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#FFCB05',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.42,
        shadowRadius: 20,
        elevation: 8,
        width: '100%',
        marginTop: 8,
    },
    disabledButton: { opacity: 0.5 },
    primaryText: { color: '#14110C', fontSize: 16.5, fontWeight: '800' },
    tertiaryButton: { alignItems: 'center', padding: 12, marginTop: 4 },
    tertiaryText: { color: '#8B9099', fontSize: 14 },
    errorBox: { backgroundColor: '#FEE9E7', padding: 12, borderRadius: 8, marginBottom: 12, width: '100%' },
    errorText: { color: '#C0392B', textAlign: 'center', fontSize: 14 },
    summaryCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        width: '100%',
        gap: 12,
        borderWidth: 1,
        borderColor: '#E0DDD6',
        marginBottom: 8,
    },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
    summaryLabel: { color: '#5C574E', fontSize: 14 },
    summaryValue: { color: '#14110C', fontSize: 14, fontWeight: '600' },
    resultIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#F0F0EC',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    resultMark: { fontSize: 44, fontWeight: '300', color: '#14110C' },
});