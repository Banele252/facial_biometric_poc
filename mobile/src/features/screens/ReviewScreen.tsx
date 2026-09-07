// src/features/screens/ReviewScreen.tsx

import {
    useState,
    useCallback,
    useMemo,
    useEffect,
} from 'react';

import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Modal,
    Platform,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { Typography } from '@/components/ui';
import { apiClient } from '@/lib/apiClient';
import { useAudit } from '@/hooks/useAudit';
import {
    getStoredIccid,
    type IccidSource,
} from '@/lib/journeyState';

interface Props {
    idNumber?: string;
    phoneNumber?: string;
    fullName?: string;
    photoUrl?: string;
    sessionId?: string;
    selfieId?: string;

    iccid?: string;
    iccidSource?: 'manual' | 'barcode';

    matchScore?: number;
    matchConfidence?: string;
    reason?: string;

    navigate?: (
        screen: string,
        params?: any,
    ) => void;

    goBack?: () => void;

    dispatch?: (action: {
        type: string;
        payload?: any;
    }) => void;
}

type SubmitStage =
    | 'idle'
    | 'submitting'
    | 'success'
    | 'error';

const MTN_YELLOW = '#FFCB05';
const MTN_BLACK = '#111114';
const BG = '#EFEFF2';
const CARD = '#FDFDFF';
const MUTED = '#6E6E78';
const BORDER = '#E6E6EC';
const ERROR = '#C62A2F';

export default function ReviewScreen({
                                         idNumber,
                                         phoneNumber,
                                         fullName,
                                         sessionId,
                                         selfieId,
                                         iccid,
                                         iccidSource,
                                         matchScore,
                                         matchConfidence,
                                         reason,
                                         navigate,
                                         goBack,
                                     }: Props) {
    const audit =
        useAudit('ReviewScreen');

    const [stage, setStage] =
        useState<SubmitStage>(
            'idle',
        );

    const [error, setError] =
        useState<string | null>(
            null,
        );

    const [swapId, setSwapId] =
        useState<string | null>(
            null,
        );

    const [
        reference,
        setReference,
    ] =
        useState<string | null>(
            null,
        );

    const [storedIccid, setStoredIccid] =
        useState('');

    const [storedIccidSource, setStoredIccidSource] =
        useState<IccidSource | undefined>(undefined);

    const [simStateLoaded, setSimStateLoaded] =
        useState(false);

    useEffect(() => {
        let active = true;

        const loadStoredSim = async () => {
            try {
                const stored = await getStoredIccid();

                if (!active) {
                    return;
                }

                if (stored) {
                    setStoredIccid(stored.iccid);
                    setStoredIccidSource(stored.source);
                }
            } catch (err) {
                console.error(
                    '[ReviewScreen] Failed to load stored ICCID',
                    err,
                );
            } finally {
                if (active) {
                    setSimStateLoaded(true);
                }
            }
        };

        void loadStoredSim();

        return () => {
            active = false;
        };
    }, []);

    // --------------------------------------------------
    // Runtime journey values
    // --------------------------------------------------

    const resolvedIdNumber =
        idNumber?.trim() ?? '';

    const resolvedPhoneNumber =
        phoneNumber?.trim() ?? '';

    const resolvedFullName =
        fullName?.trim() ?? '';

    const resolvedSessionId =
        sessionId?.trim() ?? '';

    const resolvedSelfieId =
        selfieId?.trim() ?? '';

    const resolvedIccid =
        iccid?.trim() ||
        storedIccid;

    const resolvedIccidSource: IccidSource | undefined =
        iccidSource ??
        storedIccidSource;

    const resolvedReason =
        reason?.trim() ?? '';

    // --------------------------------------------------
    // Replacement SIM provenance
    // --------------------------------------------------

    const replacementSimCaptured =
        Boolean(resolvedIccid) &&
        (
            resolvedIccidSource ===
            'manual' ||
            resolvedIccidSource ===
            'barcode'
        );

    const simSourceLabel =
        useMemo(() => {
            switch (resolvedIccidSource) {
                case 'barcode':
                    return 'Barcode captured';

                case 'manual':
                    return 'Entered manually';

                default:
                    return 'Source unavailable';
            }
        }, [resolvedIccidSource]);

    const simRowLabel =
        useMemo(() => {
            switch (resolvedIccidSource) {
                case 'barcode':
                    return 'New SIM ICCID · Barcode';

                case 'manual':
                    return 'New SIM ICCID · Manual';

                default:
                    return 'New SIM ICCID';
            }
        }, [resolvedIccidSource]);

    const replacementSimCheckLabel =
        useMemo(() => {
            switch (resolvedIccidSource) {
                case 'barcode':
                    return 'Replacement SIM barcode captured';

                case 'manual':
                    return 'Replacement SIM ICCID entered';

                default:
                    return 'Replacement SIM captured';
            }
        }, [resolvedIccidSource]);

    // --------------------------------------------------
    // Masked display values
    // --------------------------------------------------

    const maskedId =
        useMemo(() => {
            if (!resolvedIdNumber) {
                return 'Not available';
            }

            if (
                resolvedIdNumber.length <
                7
            ) {
                return resolvedIdNumber;
            }

            return (
                resolvedIdNumber.slice(
                    0,
                    3,
                ) +
                ' ****** ' +
                resolvedIdNumber.slice(
                    -4,
                )
            );
        }, [resolvedIdNumber]);

    const maskedPhone =
        useMemo(() => {
            if (
                !resolvedPhoneNumber
            ) {
                return 'Not available';
            }

            if (
                resolvedPhoneNumber.length <
                7
            ) {
                return resolvedPhoneNumber;
            }

            return (
                resolvedPhoneNumber.slice(
                    0,
                    3,
                ) +
                ' **** ' +
                resolvedPhoneNumber.slice(
                    -3,
                )
            );
        }, [
            resolvedPhoneNumber,
        ]);

    const maskedIccid =
        useMemo(() => {
            if (!resolvedIccid) {
                return simStateLoaded
                    ? 'Not available'
                    : 'Loading replacement SIM…';
            }

            if (
                resolvedIccid.length <
                10
            ) {
                return resolvedIccid;
            }

            return (
                resolvedIccid.slice(
                    0,
                    4,
                ) +
                ' ********** ' +
                resolvedIccid.slice(
                    -4,
                )
            );
        }, [resolvedIccid, simStateLoaded]);

    // --------------------------------------------------
    // Face verification display
    // --------------------------------------------------

    const faceMatchValue =
        useMemo(() => {
            const hasScore =
                typeof matchScore ===
                'number' &&
                Number.isFinite(
                    matchScore,
                );

            const hasConfidence =
                Boolean(
                    matchConfidence?.trim(),
                );

            if (
                hasScore &&
                hasConfidence
            ) {
                return `${
                    matchConfidence
                } (${Math.round(
                    matchScore! * 100,
                )}%)`;
            }

            if (hasConfidence) {
                return (
                    matchConfidence?.trim() ??
                    ''
                );
            }

            if (hasScore) {
                return `${Math.round(
                    matchScore! * 100,
                )}%`;
            }

            return resolvedSelfieId
                ? 'Liveness verified'
                : 'Not available';
        }, [
            matchScore,
            matchConfidence,
            resolvedSelfieId,
        ]);

    // --------------------------------------------------
    // Request type
    // --------------------------------------------------

    const reasonValue =
        useMemo(() => {
            if (!resolvedReason) {
                return 'SIM swap';
            }

            return (
                resolvedReason
                    .charAt(0)
                    .toUpperCase() +
                resolvedReason.slice(1)
            );
        }, [resolvedReason]);

    // --------------------------------------------------
    // Confirm transaction
    // --------------------------------------------------

    const handleConfirm =
        useCallback(async () => {
            if (
                stage !== 'idle' &&
                stage !== 'error'
            ) {
                return;
            }

            if (!resolvedIdNumber) {
                setError(
                    'Identity details are missing. Please return to identity verification.',
                );
                setStage('error');
                return;
            }

            if (
                !resolvedPhoneNumber
            ) {
                setError(
                    'Mobile number is missing. Please return to identity verification.',
                );
                setStage('error');
                return;
            }

            if (!resolvedIccid) {
                setError(
                    'Replacement SIM ICCID is missing. Please enter or scan the replacement SIM.',
                );
                setStage('error');
                return;
            }

            if (
                resolvedIccidSource !==
                'manual' &&
                resolvedIccidSource !==
                'barcode'
            ) {
                setError(
                    'Replacement SIM source is missing. Please re-enter or rescan the replacement SIM.',
                );
                setStage('error');
                return;
            }

            if (
                !resolvedSelfieId
            ) {
                setError(
                    'Face verification result is missing. Please complete face verification.',
                );
                setStage('error');
                return;
            }

            setStage('submitting');
            setError(null);

            try {
                const res =
                    await apiClient
                        .initiateSimSwap({
                            idNumber:
                            resolvedIdNumber,

                            msisdn:
                            resolvedPhoneNumber,

                            iccid:
                            resolvedIccid,

                            selfieId:
                            resolvedSelfieId,
                        });

                const transactionId =
                    res.order_id ||
                    res.reference;

                audit.log(
                    'SWAP_REQUESTED',
                    {
                        outcome: 'success',

                        metadata: {
                            orderId:
                            res.order_id,

                            reference:
                            res.reference,

                            status:
                            res.status,

                            sessionId:
                            resolvedSessionId,

                            iccidSource: resolvedIccidSource,
                        },
                    },
                );

                setSwapId(
                    transactionId,
                );

                setReference(
                    res.reference ||
                    null,
                );

                setStage('success');
            } catch (err: any) {
                const msg =
                    err?.message ||
                    'Failed to initiate SIM swap. Please try again.';

                setError(msg);
                setStage('error');

                audit.log(
                    'SWAP_REJECTED',
                    {
                        outcome: 'failure',
                        reason: msg,

                        metadata: {
                            sessionId:
                            resolvedSessionId,

                            iccidSource: resolvedIccidSource,
                        },
                    },
                );
            }
        }, [
            stage,
            resolvedIdNumber,
            resolvedPhoneNumber,
            resolvedIccid,
            resolvedSelfieId,
            resolvedSessionId,
            resolvedIccidSource,
            audit,
        ]);

    // --------------------------------------------------
    // Continue
    // --------------------------------------------------

    const handleDone =
        useCallback(() => {
            navigate?.(
                'CompleteScreen',
                {
                    swapId:
                        swapId ??
                        undefined,

                    reference:
                        reference ??
                        undefined,

                    idNumber:
                    resolvedIdNumber,

                    phoneNumber:
                    resolvedPhoneNumber,

                    iccid:
                    resolvedIccid,

                    iccidSource: resolvedIccidSource,
                },
            );
        }, [
            navigate,
            swapId,
            reference,
            resolvedIdNumber,
            resolvedPhoneNumber,
            resolvedIccid,
            resolvedIccidSource,
        ]);

    // --------------------------------------------------
    // Render
    // --------------------------------------------------

    const allSecurityPassed =
        Boolean(resolvedIdNumber) &&
        replacementSimCaptured &&
        Boolean(resolvedSelfieId);

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar style="dark" />

            <View style={styles.shell}>
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Floating MTN Trust header */}
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <TouchableOpacity
                                onPress={goBack}
                                style={styles.backButton}
                                activeOpacity={0.82}
                            >
                                <Ionicons
                                    name="chevron-back"
                                    size={20}
                                    color={MTN_BLACK}
                                />
                            </TouchableOpacity>

                            <View style={styles.brandPill}>
                                <View style={styles.mtnBadge}>
                                    <Typography
                                        variant="body"
                                        style={styles.mtnText}
                                    >
                                        MTN
                                    </Typography>
                                </View>

                                <Typography
                                    variant="body"
                                    style={styles.trustText}
                                >
                                    trust
                                </Typography>
                            </View>
                        </View>

                        <View style={styles.languageButton}>
                            <Typography
                                variant="body"
                                style={styles.languageText}
                            >
                                EN
                            </Typography>
                            <Ionicons
                                name="chevron-down"
                                size={13}
                                color={MUTED}
                            />
                        </View>
                    </View>

                    {/* Review hero */}
                    <View style={styles.glassCard}>
                        <View style={styles.introTitleRow}>
                            <Typography
                                variant="h2"
                                style={styles.title}
                            >
                                Review and confirm
                            </Typography>

                            <Typography
                                variant="body"
                                style={styles.stepInline}
                            >
                                Step 5 of 6
                            </Typography>
                        </View>

                        <View style={styles.segmentRow}>
                            {[0, 1, 2, 3, 4, 5].map((segment) => (
                                <View
                                    key={segment}
                                    style={[
                                        styles.segment,
                                        segment <= 4
                                            ? styles.segmentComplete
                                            : styles.segmentPending,
                                    ]}
                                />
                            ))}
                        </View>

                        <Typography
                            variant="body"
                            style={styles.lead}
                        >
                            Last step. Check these details, then authorise the swap —
                            your old SIM stays active until the new one is live.
                        </Typography>
                    </View>

                    {/* Request + security card */}
                    <View style={styles.glassCard}>
                        <Typography
                            variant="body"
                            style={styles.sectionEyebrow}
                        >
                            YOUR REQUEST
                        </Typography>

                        <View style={styles.requestRows}>
                            {resolvedFullName ? (
                                <>
                                    <DetailRow
                                        icon="person-outline"
                                        label="Full Name"
                                        value={resolvedFullName}
                                    />
                                    <View style={styles.divider} />
                                </>
                            ) : null}

                            <DetailRow
                                icon="card-outline"
                                label="RSA Identity Number"
                                value={maskedId}
                            />

                            <View style={styles.divider} />

                            <DetailRow
                                icon="phone-portrait-outline"
                                label="Mobile number"
                                value={maskedPhone}
                            />

                            <View style={styles.divider} />

                            <DetailRow
                                icon="hardware-chip-outline"
                                label={simRowLabel}
                                value={maskedIccid}
                                meta={resolvedIccid ? simSourceLabel : undefined}
                                metaIcon={
                                    resolvedIccidSource === 'barcode'
                                        ? 'barcode-outline'
                                        : 'create-outline'
                                }
                            />

                            <View style={styles.divider} />

                            <DetailRow
                                icon="scan-outline"
                                label="Face verification"
                                value={faceMatchValue}
                            />

                            <View style={styles.divider} />

                            <DetailRow
                                icon="swap-horizontal-outline"
                                label="Request type"
                                value={reasonValue}
                            />
                        </View>

                        <View style={styles.sectionDivider} />

                        <View style={styles.securityHeader}>
                            <Typography
                                variant="body"
                                style={styles.sectionEyebrow}
                            >
                                SECURITY CHECKS
                            </Typography>

                            <View
                                style={[
                                    styles.securityBadge,
                                    !allSecurityPassed &&
                                    styles.securityBadgePending,
                                ]}
                            >
                                {allSecurityPassed ? (
                                    <View style={styles.badgeCheck}>
                                        <Ionicons
                                            name="checkmark"
                                            size={10}
                                            color={MTN_YELLOW}
                                        />
                                    </View>
                                ) : (
                                    <ActivityIndicator
                                        size="small"
                                        color="#8A6A00"
                                    />
                                )}

                                <Typography
                                    variant="body"
                                    style={styles.securityBadgeText}
                                >
                                    {allSecurityPassed
                                        ? 'All passed'
                                        : 'Checking'}
                                </Typography>
                            </View>
                        </View>

                        <View style={styles.securityRail}>
                            <View style={styles.railBase} />
                            <View
                                style={[
                                    styles.railFill,
                                    {
                                        height: allSecurityPassed
                                            ? '78%'
                                            : replacementSimCaptured
                                                ? '50%'
                                                : resolvedIdNumber
                                                    ? '24%'
                                                    : '0%',
                                    },
                                ]}
                            />

                            <SecurityRow
                                label="Identity verified"
                                meta="Home Affairs"
                                complete={Boolean(resolvedIdNumber)}
                            />

                            <SecurityRow
                                label={replacementSimCheckLabel}
                                meta="ICCID"
                                complete={replacementSimCaptured}
                            />

                            <SecurityRow
                                label="Face liveness passed"
                                meta="Biometrics"
                                complete={Boolean(resolvedSelfieId)}
                            />

                            <SecurityRow
                                label="Ready to submit"
                                meta="Network"
                                complete={allSecurityPassed}
                            />
                        </View>
                    </View>

                    {/* Next step card */}
                    <View style={styles.nextCard}>
                        <View style={styles.detailIconWrap}>
                            <Ionicons
                                name="time-outline"
                                size={18}
                                color="#8A6A00"
                            />
                        </View>

                        <View style={styles.nextTextWrap}>
                            <Typography
                                variant="body"
                                style={styles.nextTitle}
                            >
                                What happens after you confirm
                            </Typography>

                            <Typography
                                variant="body"
                                style={styles.nextSubtitle}
                            >
                                Activation usually completes within 10 minutes.
                            </Typography>
                        </View>

                        <Ionicons
                            name="chevron-forward"
                            size={18}
                            color="#9A9AA4"
                        />
                    </View>

                    {error ? (
                        <View style={styles.errorBanner}>
                            <Ionicons
                                name="alert-circle"
                                size={18}
                                color={ERROR}
                            />

                            <Typography
                                variant="body"
                                style={styles.errorText}
                            >
                                {error}
                            </Typography>
                        </View>
                    ) : null}

                    <View style={styles.secureFooter}>
                        <Ionicons
                            name="lock-closed-outline"
                            size={13}
                            color={MUTED}
                        />
                        <Typography
                            variant="body"
                            style={styles.secureFooterText}
                        >
                            Encrypted · POPIA compliant · Verified by MTN Trust
                        </Typography>
                    </View>
                </ScrollView>

                {/* Bottom action panel — same functionality, upgraded skin */}
                <View style={styles.bottomBar}>
                    <View style={styles.actionPanel}>
                        <TouchableOpacity
                            style={[
                                styles.primaryButton,
                                stage === 'submitting' &&
                                styles.primaryButtonDisabled,
                            ]}
                            onPress={handleConfirm}
                            disabled={stage === 'submitting'}
                            activeOpacity={0.88}
                        >
                            {stage === 'submitting' ? (
                                <>
                                    <Typography
                                        variant="body"
                                        style={styles.primaryButtonText}
                                    >
                                        Submitting…
                                    </Typography>
                                    <ActivityIndicator
                                        color={MTN_BLACK}
                                        size="small"
                                    />
                                </>
                            ) : (
                                <>
                                    <Typography
                                        variant="body"
                                        style={styles.primaryButtonText}
                                    >
                                        Confirm SIM Swap
                                    </Typography>
                                    <Ionicons
                                        name="arrow-forward"
                                        size={18}
                                        color={MTN_BLACK}
                                    />
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Success modal — functionality unchanged */}
            <Modal
                visible={stage === 'success'}
                animationType="fade"
                transparent
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.successIcon}>
                            <Ionicons
                                name="checkmark"
                                size={30}
                                color={MTN_BLACK}
                            />
                        </View>

                        <Typography
                            variant="h2"
                            style={styles.modalTitle}
                        >
                            Activation started
                        </Typography>

                        <Typography
                            variant="body"
                            style={styles.modalText}
                        >
                            Insert your new SIM and restart your phone. Activation
                            usually completes within 10 minutes.
                        </Typography>

                        {reference ? (
                            <View style={styles.referenceCard}>
                                <Typography
                                    variant="body"
                                    style={styles.referenceLabel}
                                >
                                    Reference
                                </Typography>
                                <Typography
                                    variant="body"
                                    style={styles.referenceValue}
                                >
                                    {reference}
                                </Typography>
                            </View>
                        ) : null}

                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={handleDone}
                            activeOpacity={0.88}
                        >
                            <Typography
                                variant="body"
                                style={styles.primaryButtonText}
                            >
                                Continue
                            </Typography>
                            <Ionicons
                                name="arrow-forward"
                                size={18}
                                color={MTN_BLACK}
                            />
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// --------------------------------------------------
// Detail row
// --------------------------------------------------

function DetailRow({
                       icon,
                       label,
                       value,
                       meta,
                       metaIcon,
                   }: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    value: string;
    meta?: string;
    metaIcon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
    return (
        <View style={styles.detailRow}>
            <View style={styles.detailIconWrap}>
                <Ionicons
                    name={icon}
                    size={18}
                    color="#8A6A00"
                />
            </View>

            <View style={styles.detailTextWrap}>
                <Typography
                    variant="body"
                    style={styles.label}
                >
                    {label}
                </Typography>

                <Typography
                    variant="body"
                    style={styles.value}
                >
                    {value}
                </Typography>

                {meta ? (
                    <View style={styles.metaRow}>
                        {metaIcon ? (
                            <Ionicons
                                name={metaIcon}
                                size={12}
                                color="#8A6A00"
                            />
                        ) : null}
                        <Typography
                            variant="body"
                            style={styles.metaText}
                        >
                            {meta}
                        </Typography>
                    </View>
                ) : null}
            </View>
        </View>
    );
}

// --------------------------------------------------
// Security row
// --------------------------------------------------

function SecurityRow({
                         label,
                         meta,
                         complete,
                     }: {
    label: string;
    meta: string;
    complete: boolean;
}) {
    return (
        <View style={styles.securityRow}>
            <View
                style={[
                    styles.securityDot,
                    complete && styles.securityDotComplete,
                ]}
            >
                {complete ? (
                    <Ionicons
                        name="checkmark"
                        size={11}
                        color={MTN_BLACK}
                    />
                ) : null}
            </View>

            <Typography
                variant="body"
                style={
                    complete
                        ? styles.securityLabel
                        : styles.securityLabelPending
                }
            >
                {label}
            </Typography>

            <Typography
                variant="body"
                style={[
                    styles.securityMeta,
                    !complete && styles.securityMetaPending,
                ]}
            >
                {complete ? meta : 'Queued'}
            </Typography>
        </View>
    );
}

// --------------------------------------------------
// Styles
// --------------------------------------------------

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: BG,
    },

    shell: {
        flex: 1,
        width: '100%',
        maxWidth: Platform.OS === 'web' ? 430 : undefined,
        alignSelf: 'center',
        backgroundColor: BG,
    },

    scroll: {
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 132,
    },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
        marginBottom: 10,
    },

    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FDFDFF',
        borderWidth: 1,
        borderColor: '#EFEFF3',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#111114',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
    },

    brandPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#000000',
        borderRadius: 999,
        paddingVertical: 5,
        paddingLeft: 6,
        paddingRight: 12,
    },

    mtnBadge: {
        width: 52,
        height: 27,
        borderRadius: 999,
        borderWidth: 2.5,
        borderColor: MTN_YELLOW,
        alignItems: 'center',
        justifyContent: 'center',
    },

    mtnText: {
        color: MTN_YELLOW,
        fontSize: 12.5,
        fontWeight: '800',
    },

    trustText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
        marginLeft: 9,
    },

    languageButton: {
        minHeight: 44,
        paddingHorizontal: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },

    languageText: {
        color: MUTED,
        fontSize: 12.5,
        fontWeight: '700',
    },

    glassCard: {
        marginTop: 12,
        backgroundColor: CARD,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#EFEFF3',
        padding: 18,
        shadowColor: '#111114',
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 2,
    },

    introTitleRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
    },

    title: {
        color: MTN_BLACK,
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: -0.35,
    },

    stepInline: {
        color: MUTED,
        fontSize: 12,
        fontWeight: '700',
    },

    segmentRow: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 12,
    },

    segment: {
        flex: 1,
        height: 4,
        borderRadius: 2,
    },

    segmentComplete: {
        backgroundColor: MTN_YELLOW,
    },

    segmentPending: {
        backgroundColor: '#DEDEE4',
    },

    lead: {
        marginTop: 12,
        color: '#5A5A64',
        fontSize: 13,
        lineHeight: 20,
    },

    sectionEyebrow: {
        color: MUTED,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
    },

    requestRows: {
        marginTop: 14,
    },

    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 14,
    },

    detailIconWrap: {
        width: 38,
        height: 38,
        borderRadius: 11,
        backgroundColor: '#F4F4F7',
        borderWidth: 1,
        borderColor: BORDER,
        alignItems: 'center',
        justifyContent: 'center',
    },

    detailTextWrap: {
        flex: 1,
        minWidth: 0,
    },

    label: {
        color: MUTED,
        fontSize: 12,
        fontWeight: '700',
    },

    value: {
        color: MTN_BLACK,
        fontSize: 14,
        fontWeight: '800',
        marginTop: 2,
    },

    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 5,
    },

    metaText: {
        color: '#8A6A00',
        fontSize: 11,
        fontWeight: '700',
    },

    divider: {
        height: 1,
        backgroundColor: '#EDEDF1',
    },

    sectionDivider: {
        height: 1,
        backgroundColor: '#EDEDF1',
        marginTop: 18,
        marginBottom: 16,
    },

    securityHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },

    securityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: MTN_YELLOW,
        borderWidth: 1,
        borderColor: '#F2BE00',
    },

    securityBadgePending: {
        backgroundColor: '#F4F4F7',
        borderColor: '#EFEFF3',
    },

    badgeCheck: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: MTN_BLACK,
        alignItems: 'center',
        justifyContent: 'center',
    },

    securityBadgeText: {
        color: MTN_BLACK,
        fontSize: 11,
        fontWeight: '800',
    },

    securityRail: {
        position: 'relative',
        marginTop: 16,
        paddingLeft: 31,
    },

    railBase: {
        position: 'absolute',
        left: 10,
        top: 11,
        bottom: 11,
        width: 2,
        borderRadius: 1,
        backgroundColor: '#EDEDF1',
    },

    railFill: {
        position: 'absolute',
        left: 10,
        top: 11,
        width: 2,
        borderRadius: 1,
        backgroundColor: MTN_YELLOW,
    },

    securityRow: {
        minHeight: 38,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingVertical: 7,
    },

    securityDot: {
        position: 'absolute',
        left: -31,
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: '#E2E2E9',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },

    securityDotComplete: {
        backgroundColor: MTN_YELLOW,
        borderColor: MTN_YELLOW,
    },

    securityLabel: {
        flex: 1,
        color: MTN_BLACK,
        fontSize: 13.5,
        fontWeight: '800',
    },

    securityLabelPending: {
        flex: 1,
        color: '#A2A2AC',
        fontSize: 13.5,
        fontWeight: '700',
    },

    securityMeta: {
        color: '#8A6A00',
        fontSize: 11,
        fontWeight: '700',
    },

    securityMetaPending: {
        color: '#A2A2AC',
    },

    nextCard: {
        marginTop: 12,
        minHeight: 74,
        backgroundColor: CARD,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#EFEFF3',
        padding: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        shadowColor: '#111114',
        shadowOpacity: 0.07,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 2,
    },

    nextTextWrap: {
        flex: 1,
        minWidth: 0,
    },

    nextTitle: {
        color: MTN_BLACK,
        fontSize: 14,
        fontWeight: '700',
    },

    nextSubtitle: {
        color: MUTED,
        fontSize: 12.5,
        marginTop: 3,
    },

    errorBanner: {
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#FFF5F5',
        borderRadius: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: '#FECDD3',
    },

    errorText: {
        color: ERROR,
        flex: 1,
        fontWeight: '600',
    },

    secureFooter: {
        marginTop: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },

    secureFooterText: {
        color: '#8A8A94',
        fontSize: 11.5,
        fontWeight: '600',
        textAlign: 'center',
    },

    bottomBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingBottom: 10,
    },

    actionPanel: {
        padding: 10,
        borderRadius: 22,
        backgroundColor: '#F8F8FA',
        borderWidth: 1,
        borderColor: '#EDEDF1',
        shadowColor: '#111114',
        shadowOpacity: 0.12,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: -6 },
        elevation: 5,
    },

    primaryButton: {
        minHeight: 52,
        borderRadius: 16,
        backgroundColor: MTN_YELLOW,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 18,
        shadowColor: MTN_YELLOW,
        shadowOpacity: 0.28,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
    },

    primaryButtonDisabled: {
        opacity: 0.65,
    },

    primaryButtonText: {
        color: MTN_BLACK,
        fontSize: 15,
        fontWeight: '800',
    },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(12,12,16,0.5)',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: 14,
    },

    modalCard: {
        width: '100%',
        maxWidth: 430,
        backgroundColor: '#FDFDFF',
        borderRadius: 22,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#EFEFF3',
        shadowColor: '#000000',
        shadowOpacity: 0.28,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 14 },
        elevation: 8,
    },

    successIcon: {
        width: 56,
        height: 56,
        borderRadius: 18,
        backgroundColor: MTN_YELLOW,
        alignItems: 'center',
        justifyContent: 'center',
    },

    modalTitle: {
        color: MTN_BLACK,
        marginTop: 14,
        textAlign: 'center',
        fontSize: 19,
        fontWeight: '800',
    },

    modalText: {
        color: '#5A5A64',
        textAlign: 'center',
        lineHeight: 20,
        marginTop: 7,
        maxWidth: 330,
    },

    referenceCard: {
        width: '100%',
        marginTop: 18,
        padding: 14,
        backgroundColor: '#F4F4F7',
        borderRadius: 14,
        alignItems: 'center',
    },

    referenceLabel: {
        color: MUTED,
        fontSize: 11,
        fontWeight: '700',
    },

    referenceValue: {
        color: MTN_BLACK,
        fontWeight: '800',
        marginTop: 4,
    },
});