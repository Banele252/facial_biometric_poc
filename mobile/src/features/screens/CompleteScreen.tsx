// src/features/screens/CompleteScreen.tsx

import {
    useCallback,
    useEffect,
} from 'react';

import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Platform,
} from 'react-native';

import {
    SafeAreaView,
} from 'react-native-safe-area-context';

import {
    StatusBar,
} from 'expo-status-bar';

import {
    Ionicons,
} from '@expo/vector-icons';

import {
    Typography,
} from '@/components/ui';

import {
    useAudit,
} from '@/hooks/useAudit';

interface Props {
    swapId?: string;
    reference?: string;
    idNumber?: string;
    phoneNumber?: string;
    iccid?: string;

    onFinish?: () => void;

    navigate?: (
        screen: string,
        params?: any,
    ) => void;

    goBack?: () => void;
}

const MTN_YELLOW = '#FFCB05';
const MTN_BLACK = '#111114';
const BG = '#EFEFF2';
const MUTED = '#6E6E78';
const CARD = '#FDFDFF';
const BORDER = '#EFEFF3';

export default function CompleteScreen({
                                           swapId,
                                           reference,
                                           idNumber: _idNumber,
                                           phoneNumber: _phoneNumber,
                                           iccid: _iccid,
                                           onFinish,
                                           navigate,
                                           goBack: _goBack,
                                       }: Props) {
    const audit =
        useAudit('CompleteScreen');

    const resolvedReference =
        reference ||
        swapId ||
        'Processing';

    useEffect(() => {
        audit.log(
            'SCREEN_VIEWED',
            {
                outcome: 'success',
                metadata: {
                    swapId: swapId ?? null,
                    reference: reference ?? null,
                    status: 'submitted',
                },
            },
        );
    }, [
        audit,
        swapId,
        reference,
    ]);

    const handleDone =
        useCallback(() => {
            audit.log(
                'SIM_SWAP_JOURNEY_COMPLETED',
                {
                    outcome: 'success',
                    metadata: {
                        swapId: swapId ?? null,
                        reference:
                        resolvedReference,
                    },
                },
            );

            if (onFinish) {
                onFinish();
                return;
            }

            navigate?.(
                'LandingScreen',
            );
        }, [
            audit,
            swapId,
            resolvedReference,
            onFinish,
            navigate,
        ]);

    return (
        <SafeAreaView
            style={styles.safeArea}
        >
            <StatusBar style="dark" />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.page}
            >
                <View style={styles.shell}>
                    {/* Floating header from the HTML reference */}
                    <View style={styles.header}>
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

                    {/* Completion hero */}
                    <View style={styles.heroCard}>
                        <View style={styles.heroGlow} />

                        <View style={styles.successHalo}>
                            <View style={styles.successTile}>
                                <Ionicons
                                    name="checkmark"
                                    size={42}
                                    color={MTN_BLACK}
                                />
                            </View>
                        </View>

                        <Typography
                            variant="h2"
                            style={styles.heroTitle}
                        >
                            All set!
                        </Typography>

                        <Typography
                            variant="body"
                            style={styles.heroSubtitle}
                        >
                            Your SIM swap request has been submitted. Follow the steps
                            below to bring your new SIM online.
                        </Typography>

                        <View style={styles.segmentRow}>
                            {[0, 1, 2, 3, 4, 5].map((segment) => (
                                <View
                                    key={segment}
                                    style={styles.segment}
                                />
                            ))}
                        </View>
                    </View>

                    {/* Do this now */}
                    <View style={styles.glassCard}>
                        <Typography
                            variant="body"
                            style={styles.eyebrow}
                        >
                            DO THIS NOW
                        </Typography>

                        <View style={styles.todoRail}>
                            <View style={styles.railBase} />

                            <TodoRow
                                number="1"
                                label="Insert your new SIM"
                                meta="Now"
                            />

                            <TodoRow
                                number="2"
                                label="Restart your phone"
                                meta="~30s"
                            />

                            <TodoRow
                                number="3"
                                label="Wait for signal to return"
                                meta="~2 min"
                            />
                        </View>

                        <View style={styles.sectionDivider} />

                        <MetaRow
                            icon="checkmark-circle-outline"
                            label="Request status"
                            value="Submitted"
                        />

                        <View style={styles.metaDivider} />

                        <MetaRow
                            icon="receipt-outline"
                            label="Reference number"
                            value={resolvedReference}
                        />
                    </View>

                    {/* Help card */}
                    <View style={styles.helpCard}>
                        <View style={styles.helpIcon}>
                            <Ionicons
                                name="call-outline"
                                size={18}
                                color="#8A6A00"
                            />
                        </View>

                        <View style={styles.helpBody}>
                            <Typography
                                variant="body"
                                style={styles.helpTitle}
                            >
                                No signal after 5 minutes?
                            </Typography>

                            <Typography
                                variant="body"
                                style={styles.helpSubtitle}
                            >
                                Two things to try before you call
                            </Typography>

                            <HelpLine>
                                Restart your phone once more — most SIMs pick up signal on
                                the second boot.
                            </HelpLine>

                            <HelpLine>
                                Still nothing? Call 135 free from any MTN line and quote
                                your reference.
                            </HelpLine>
                        </View>
                    </View>

                    {/* Premium CTA panel */}
                    <View style={styles.ctaPanel}>
                        <TouchableOpacity
                            style={styles.doneButton}
                            onPress={handleDone}
                            activeOpacity={0.88}
                        >
                            <Typography
                                variant="body"
                                style={styles.doneText}
                            >
                                Done
                            </Typography>

                            <Ionicons
                                name="arrow-forward"
                                size={18}
                                color={MTN_BLACK}
                            />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.securityFooter}>
                        <Ionicons
                            name="lock-closed-outline"
                            size={13}
                            color="#8A8A94"
                        />

                        <Typography
                            variant="body"
                            style={styles.securityText}
                        >
                            Encrypted · POPIA compliant · Verified by MTN Trust
                        </Typography>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function TodoRow({
                     number,
                     label,
                     meta,
                 }: {
    number: string;
    label: string;
    meta: string;
}) {
    return (
        <View style={styles.todoRow}>
            <View style={styles.todoNumber}>
                <Typography
                    variant="body"
                    style={styles.todoNumberText}
                >
                    {number}
                </Typography>
            </View>

            <Typography
                variant="body"
                style={styles.todoLabel}
            >
                {label}
            </Typography>

            <Typography
                variant="body"
                style={styles.todoMeta}
            >
                {meta}
            </Typography>
        </View>
    );
}

function MetaRow({
                     icon,
                     label,
                     value,
                 }: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    value: string;
}) {
    return (
        <View style={styles.metaRow}>
            <View style={styles.metaIcon}>
                <Ionicons
                    name={icon}
                    size={18}
                    color="#8A6A00"
                />
            </View>

            <View style={styles.metaBody}>
                <Typography
                    variant="body"
                    style={styles.metaLabel}
                >
                    {label}
                </Typography>

                <Typography
                    variant="body"
                    style={styles.metaValue}
                >
                    {value}
                </Typography>
            </View>
        </View>
    );
}

function HelpLine({
                      children,
                  }: {
    children: React.ReactNode;
}) {
    return (
        <View style={styles.helpLine}>
            <View style={styles.helpCheck}>
                <Ionicons
                    name="checkmark"
                    size={11}
                    color="#8A6A00"
                />
            </View>

            <Typography
                variant="body"
                style={styles.helpLineText}
            >
                {children}
            </Typography>
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: BG,
    },

    page: {
        flexGrow: 1,
        alignItems: 'center',
        backgroundColor: BG,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },

    shell: {
        width: '100%',
        maxWidth: Platform.OS === 'web' ? 430 : undefined,
    },

    header: {
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
        marginBottom: 8,
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 6,
    },

    languageText: {
        color: MUTED,
        fontSize: 12.5,
        fontWeight: '700',
    },

    heroCard: {
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#FFF8DE',
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 28,
        paddingBottom: 24,
        alignItems: 'center',
        shadowColor: '#111114',
        shadowOpacity: 0.08,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 12 },
        elevation: 3,
    },

    heroGlow: {
        position: 'absolute',
        top: -32,
        width: 250,
        height: 190,
        borderRadius: 125,
        backgroundColor: '#FFF1A8',
        opacity: 0.56,
    },

    successHalo: {
        width: 108,
        height: 108,
        borderRadius: 34,
        backgroundColor: 'rgba(255,203,5,0.16)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    successTile: {
        width: 84,
        height: 84,
        borderRadius: 26,
        backgroundColor: MTN_YELLOW,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#BE8C00',
        shadowOpacity: 0.32,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 5,
    },

    heroTitle: {
        color: MTN_BLACK,
        marginTop: 16,
        fontSize: 29,
        lineHeight: 34,
        fontWeight: '800',
        letterSpacing: -0.7,
        textAlign: 'center',
    },

    heroSubtitle: {
        color: '#5A5A64',
        marginTop: 8,
        maxWidth: 320,
        fontSize: 13,
        lineHeight: 20,
        textAlign: 'center',
    },

    segmentRow: {
        width: '100%',
        flexDirection: 'row',
        gap: 6,
        marginTop: 16,
    },

    segment: {
        flex: 1,
        height: 4,
        borderRadius: 2,
        backgroundColor: MTN_YELLOW,
    },

    glassCard: {
        marginTop: 12,
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 20,
        padding: 18,
        shadowColor: '#111114',
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 2,
    },

    eyebrow: {
        color: MUTED,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
    },

    todoRail: {
        position: 'relative',
        marginTop: 16,
        paddingLeft: 31,
        gap: 2,
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

    todoRow: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingVertical: 7,
    },

    todoNumber: {
        position: 'absolute',
        left: -31,
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: '#F8EBBE',
        backgroundColor: '#FFF7DA',
        alignItems: 'center',
        justifyContent: 'center',
    },

    todoNumberText: {
        color: '#8A6A00',
        fontSize: 10,
        fontWeight: '800',
    },

    todoLabel: {
        flex: 1,
        color: MTN_BLACK,
        fontSize: 13.5,
        fontWeight: '700',
    },

    todoMeta: {
        color: '#8A8A94',
        fontSize: 11,
        fontWeight: '700',
    },

    sectionDivider: {
        height: 1,
        backgroundColor: '#EDEDF1',
        marginTop: 18,
        marginBottom: 2,
    },

    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 14,
    },

    metaIcon: {
        width: 38,
        height: 38,
        borderRadius: 11,
        backgroundColor: '#F4F4F7',
        borderWidth: 1,
        borderColor: BORDER,
        alignItems: 'center',
        justifyContent: 'center',
    },

    metaBody: {
        flex: 1,
        minWidth: 0,
    },

    metaLabel: {
        color: MUTED,
        fontSize: 12,
        fontWeight: '700',
    },

    metaValue: {
        color: MTN_BLACK,
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: -0.2,
        marginTop: 2,
    },

    metaDivider: {
        height: 1,
        backgroundColor: '#EDEDF1',
    },

    helpCard: {
        marginTop: 12,
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 20,
        padding: 18,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 13,
        shadowColor: '#111114',
        shadowOpacity: 0.07,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 2,
    },

    helpIcon: {
        width: 38,
        height: 38,
        borderRadius: 11,
        backgroundColor: '#FFF3C9',
        borderWidth: 1,
        borderColor: '#F2DC8E',
        alignItems: 'center',
        justifyContent: 'center',
    },

    helpBody: {
        flex: 1,
        minWidth: 0,
    },

    helpTitle: {
        color: MTN_BLACK,
        fontSize: 14,
        fontWeight: '700',
    },

    helpSubtitle: {
        color: MUTED,
        fontSize: 12.5,
        marginTop: 2,
        marginBottom: 10,
    },

    helpLine: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 9,
        marginTop: 8,
    },

    helpCheck: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#FFF7DA',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },

    helpLineText: {
        flex: 1,
        color: '#5A5A64',
        fontSize: 12.5,
        lineHeight: 18,
    },

    ctaPanel: {
        marginTop: 12,
        padding: 10,
        borderRadius: 22,
        backgroundColor: '#F8F8FA',
        borderWidth: 1,
        borderColor: '#EDEDF1',
        shadowColor: '#111114',
        shadowOpacity: 0.09,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 9 },
        elevation: 3,
    },

    doneButton: {
        minHeight: 52,
        borderRadius: 16,
        backgroundColor: MTN_YELLOW,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        shadowColor: MTN_YELLOW,
        shadowOpacity: 0.34,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
    },

    doneText: {
        color: MTN_BLACK,
        fontSize: 15,
        fontWeight: '800',
    },

    securityFooter: {
        marginTop: 14,
        marginBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },

    securityText: {
        color: '#8A8A94',
        fontSize: 11.5,
        lineHeight: 18,
        fontWeight: '600',
        textAlign: 'center',
    },
});