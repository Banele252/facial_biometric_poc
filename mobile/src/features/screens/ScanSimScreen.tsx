// src/features/screens/ScanSimScreen.tsx

import {
    useState,
    useCallback,
    useEffect,
    useRef,
} from 'react';

import {
    View,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Text,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TextInput,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import {
    CameraView,
    useCameraPermissions,
} from 'expo-camera';

import { useAudit } from '@/hooks/useAudit';
import { apiClient } from '@/lib/apiClient';

import {
    storeIccid,
    type IccidSource,
} from '@/lib/journeyState';

const DESIGN_WIDTH = 393;

const Colors = {
    background: '#FFFFFF',
    text: '#111114',
    muted: '#6E6E78',
    error: '#E5484D',
    success: '#79A54E',
    primary: '#FFCB05',
};

const ACCENT = Colors.primary;

interface Props {
    idNumber?: string;
    phoneNumber?: string;
    fullName?: string;
    photoUrl?: string;
    sessionId?: string;
    selfieId?: string;

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

type Stage =
    | 'camera'
    | 'scanning'
    | 'processing'
    | 'failed'
    | 'success'
    | 'manual';

/**
 * Strip everything except digits.
 */
function normalizeIccid(
    value: string,
): string {
    return value.replace(/\D/g, '');
}

/**
 * South African / standard SIM ICCIDs normally:
 * - start with 89
 * - contain 19 or 20 digits
 */
function isValidICCID(
    value: string,
): boolean {
    const normalized =
        normalizeIccid(value);

    return /^89\d{17,18}$/.test(
        normalized,
    );
}

/**
 * Barcode readers may return:
 *
 * 8957012345678901234
 *
 * ICCID: 8957012345678901234
 *
 * 89 5701 2345 6789 0123 4
 *
 * or even packaging text around the number.
 *
 * We extract the ICCID instead of requiring the
 * entire scanner value to exactly equal an ICCID.
 */
function extractIccidFromBarcode(
    raw: string,
): string | null {
    if (!raw) {
        return null;
    }

    const digits =
        normalizeIccid(raw);

    const match =
        digits.match(
            /89\d{17,18}/,
        );

    if (!match) {
        return null;
    }

    const candidate =
        match[0];

    if (
        !isValidICCID(
            candidate,
        )
    ) {
        return null;
    }

    return candidate;
}

async function capturedPhotoToDataUrl(
    photo: {
        base64?: string | null;
        uri?: string;
    },
): Promise<string> {
    const rawBase64 = photo.base64?.trim();

    if (rawBase64) {
        return rawBase64.startsWith('data:image/')
            ? rawBase64
            : `data:image/jpeg;base64,${rawBase64}`;
    }

    if (Platform.OS === 'web' && photo.uri) {
        const response = await fetch(photo.uri);

        if (!response.ok) {
            throw new Error(
                'Unable to read the captured SIM image.',
            );
        }

        const blob = await response.blob();

        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();

            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                    return;
                }

                reject(
                    new Error(
                        'Unable to convert the captured SIM image.',
                    ),
                );
            };

            reader.onerror = () => {
                reject(
                    new Error(
                        'Unable to read the captured SIM image.',
                    ),
                );
            };

            reader.readAsDataURL(blob);
        });
    }

    throw new Error(
        'Camera did not return image data for the SIM barcode.',
    );
}

export default function ScanSimScreen({
                                          idNumber = '',
                                          phoneNumber = '',
                                          fullName = '',
                                          photoUrl = '',
                                          sessionId = '',
                                          selfieId = '',
                                          navigate,
                                          goBack,
                                          dispatch,
                                      }: Props) {
    const audit =
        useAudit('ScanSimScreen');

    const [
        permission,
        requestPermission,
    ] =
        useCameraPermissions();

    const [
        stage,
        setStage,
    ] =
        useState<Stage>(
            'camera',
        );

    const [
        error,
        setError,
    ] =
        useState<string | null>(
            null,
        );

    const [
        iccid,
        setIccid,
    ] =
        useState<string | null>(
            null,
        );

    const [
        manualIccid,
        setManualIccid,
    ] =
        useState('');

    const [
        isProcessing,
        setIsProcessing,
    ] =
        useState(false);

    const cameraRef =
        useRef<CameraView>(
            null,
        );

    const timersRef =
        useRef<
            ReturnType<
                typeof setTimeout
            >[]
        >([]);


    // Camera permission


    useEffect(() => {
        if (
            !permission?.granted
        ) {
            void requestPermission();
        }
    }, [
        permission,
        requestPermission,
    ]);


    // Timer cleanup


    useEffect(() => {
        const timers =
            timersRef.current;

        return () => {
            timers.forEach(
                clearTimeout,
            );
        };
    }, []);


    // Navigation


    const proceedToFaceCheck =
        useCallback(
            (
                finalIccid: string,
                source:
                IccidSource,
            ) => {
                const params = {
                    idNumber,
                    phoneNumber,
                    fullName,
                    photoUrl,
                    sessionId,
                    selfieId,

                    iccid:
                    finalIccid,

                    iccidSource:
                    source,
                };

                if (navigate) {
                    navigate(
                        'FaceCheckScreen',
                        params,
                    );

                    return;
                }

                dispatch?.({
                    type: 'NAVIGATE',

                    payload: {
                        screen:
                            'FaceCheckScreen',

                        params,
                    },
                });
            },
            [
                idNumber,
                phoneNumber,
                fullName,
                photoUrl,
                sessionId,
                selfieId,
                navigate,
                dispatch,
            ],
        );


    // Automatic barcode scanning


    const handleBarcodeScanned =
        useCallback(
            async (
                result: {
                    data: string;
                    type?: string;
                },
            ) => {
                if (
                    stage !== 'camera' ||
                    isProcessing ||
                    iccid
                ) {
                    return;
                }

                // CameraView is the live trigger. Ignore unrelated or partial barcodes.
                const detectedIccid =
                    extractIccidFromBarcode(result.data);

                if (!detectedIccid) {
                    return;
                }

                setIsProcessing(true);
                setError(null);
                setStage('scanning');

                try {
                    if (!cameraRef.current) {
                        throw new Error(
                            'Camera is not available.',
                        );
                    }

                    /*
                     * The live reader detected a likely ICCID.
                     * Capture the frame automatically and let the backend
                     * /api/v1/iccid/extract endpoint perform the authoritative
                     * barcode extraction and validation.
                     */
                    const photo =
                        await cameraRef.current.takePictureAsync({
                            base64: true,
                            quality: 0.9,
                            skipProcessing: false,
                        });

                    if (!photo) {
                        throw new Error(
                            'Unable to capture the replacement SIM barcode.',
                        );
                    }

                    const imageBase64 =
                        await capturedPhotoToDataUrl(photo);

                    setStage('processing');

                    const resolved =
                        await apiClient.resolveIccid({
                            imageBase64,
                        });

                    const finalIccid =
                        normalizeIccid(resolved.iccid);

                    if (!isValidICCID(finalIccid)) {
                        throw new Error(
                            'The backend returned an invalid ICCID.',
                        );
                    }

                    await storeIccid(
                        finalIccid,
                        'barcode',
                    );

                    setIccid(finalIccid);

                    audit.log(
                        'ICCID_CAPTURED',
                        {
                            outcome: 'success',
                            metadata: {
                                iccidLast4:
                                    finalIccid.slice(-4),
                                method: 'barcode',
                                backendSource:
                                resolved.source,
                                barcodeType:
                                    resolved.barcode_type ||
                                    result.type ||
                                    'unknown',
                                sessionId,
                            },
                        },
                    );

                    setStage('success');

                    const timer =
                        setTimeout(
                            () => {
                                proceedToFaceCheck(
                                    finalIccid,
                                    'barcode',
                                );
                            },
                            700,
                        );

                    timersRef.current.push(timer);
                } catch (err: any) {
                    const message =
                        err?.message ||
                        'Unable to read the SIM barcode. Hold it steady and try again.';

                    setError(message);
                    setStage('failed');
                    setIsProcessing(false);
                    setIccid(null);

                    audit.log(
                        'ICCID_CAPTURE_FAILED',
                        {
                            outcome: 'failure',
                            reason: message,
                            metadata: {
                                operation:
                                    'backend_iccid_barcode_resolution',
                                sessionId,
                            },
                        },
                    );
                }
            },
            [
                stage,
                isProcessing,
                iccid,
                audit,
                sessionId,
                proceedToFaceCheck,
            ],
        );

    // Manual ICCID fallback

    const handleManualSubmit =
        useCallback(
            async () => {
                const enteredDigits =
                    normalizeIccid(manualIccid);

                const candidate =
                    `89${enteredDigits}`;

                if (!isValidICCID(candidate)) {
                    setError(
                        'Please enter a valid 19–20 digit ICCID beginning with 89.',
                    );
                    return;
                }

                setIsProcessing(true);
                setError(null);
                setStage('processing');

                try {
                    /*
                     * Manual entry uses the same backend resolver.
                     * The backend response is the authoritative ICCID value.
                     */
                    const resolved =
                        await apiClient.resolveIccid({
                            iccid: candidate,
                        });

                    const finalIccid =
                        normalizeIccid(resolved.iccid);

                    if (!isValidICCID(finalIccid)) {
                        throw new Error(
                            'The backend returned an invalid ICCID.',
                        );
                    }

                    await storeIccid(
                        finalIccid,
                        'manual',
                    );

                    setIccid(finalIccid);

                    audit.log(
                        'ICCID_CAPTURED',
                        {
                            outcome: 'success',
                            metadata: {
                                iccidLast4:
                                    finalIccid.slice(-4),
                                method: 'manual',
                                backendSource:
                                resolved.source,
                                sessionId,
                            },
                        },
                    );

                    setStage('success');

                    const timer =
                        setTimeout(
                            () => {
                                proceedToFaceCheck(
                                    finalIccid,
                                    'manual',
                                );
                            },
                            700,
                        );

                    timersRef.current.push(timer);
                } catch (err: any) {
                    const message =
                        err?.message ||
                        'Failed to validate the replacement SIM ICCID.';

                    setError(message);
                    setStage('failed');
                    setIsProcessing(false);
                    setIccid(null);

                    audit.log(
                        'ERROR_OCCURRED',
                        {
                            outcome: 'failure',
                            reason: message,
                            metadata: {
                                operation:
                                    'backend_iccid_manual_resolution',
                                sessionId,
                            },
                        },
                    );
                }
            },
            [
                manualIccid,
                audit,
                sessionId,
                proceedToFaceCheck,
            ],
        );


    // Retry


    const handleRetry =
        useCallback(() => {
            setIccid(null);

            setError(null);

            setManualIccid('');

            setIsProcessing(
                false,
            );

            setStage(
                'camera',
            );
        }, []);

    // Permission UI

    if (
        !permission?.granted
    ) {
        return (
            <SafeAreaView
                style={styles.center}
            >
                <StatusBar style="dark" />

                <View
                    style={
                        styles.permissionBrand
                    }
                >
                    <View
                        style={
                            styles.headerBrand
                        }
                    >
                        <View
                            style={
                                styles.mtnBadge
                            }
                        >
                            <Text
                                style={
                                    styles.mtnText
                                }
                            >
                                MTN
                            </Text>
                        </View>

                        <Text
                            style={
                                styles.trustText
                            }
                        >
                            trust
                        </Text>
                    </View>
                </View>

                <View
                    style={
                        styles.permissionIcon
                    }
                >
                    <Ionicons
                        name="barcode-outline"
                        size={44}
                        color={
                            Colors.text
                        }
                    />
                </View>

                <Text
                    style={
                        styles.permissionTitle
                    }
                >
                    Camera access required
                </Text>

                <Text
                    style={
                        styles.permissionText
                    }
                >
                    We need camera access to
                    automatically read the
                    barcode on your replacement
                    SIM card.
                </Text>

                <TouchableOpacity
                    style={
                        styles.ctaButton
                    }
                    onPress={
                        requestPermission
                    }
                    activeOpacity={0.9}
                >
                    <View
                        style={
                            styles.ctaTextWrap
                        }
                    >
                        <Text
                            style={
                                styles.ctaLabel
                            }
                        >
                            Allow Camera
                        </Text>

                        <Ionicons
                            name="arrow-forward"
                            size={18}
                            color={
                                Colors.text
                            }
                        />
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={
                        styles.manualEntryBtn
                    }
                    onPress={() => {
                        setError(null);

                        setStage(
                            'manual',
                        );
                    }}
                >
                    <Ionicons
                        name="keypad-outline"
                        size={18}
                        color={
                            Colors.text
                        }
                    />

                    <Text
                        style={
                            styles.manualEntryText
                        }
                    >
                        Enter ICCID manually
                    </Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }


    // Main UI


    return (
        <SafeAreaView
            style={
                styles.safeArea
            }
        >
            <StatusBar style="dark" />

            <KeyboardAvoidingView
                behavior={
                    Platform.OS ===
                    'ios'
                        ? 'padding'
                        : 'height'
                }
                style={
                    styles.scrollView
                }
            >
                <ScrollView
                    contentContainerStyle={
                        styles.scrollContent
                    }
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={
                        false
                    }
                >
                    {/* HEADER */}

                    <View
                        style={
                            styles.header
                        }
                    >
                        <View
                            style={
                                styles.headerLeft
                            }
                        >
                            <TouchableOpacity
                                onPress={
                                    goBack
                                }
                                style={
                                    styles.backBtn
                                }
                                hitSlop={8}
                                activeOpacity={0.85}
                            >
                                <Ionicons
                                    name="chevron-back"
                                    size={22}
                                    color={
                                        Colors.text
                                    }
                                />
                            </TouchableOpacity>

                            <View
                                style={
                                    styles.headerBrand
                                }
                            >
                                <View
                                    style={
                                        styles.mtnBadge
                                    }
                                >
                                    <Text
                                        style={
                                            styles.mtnText
                                        }
                                    >
                                        MTN
                                    </Text>
                                </View>

                                <Text
                                    style={
                                        styles.trustText
                                    }
                                >
                                    trust
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={
                                styles.langBtn
                            }
                        >
                            <Text
                                style={
                                    styles.langText
                                }
                            >
                                EN
                            </Text>

                            <Ionicons
                                name="chevron-down"
                                size={14}
                                color={
                                    Colors.text
                                }
                            />
                        </TouchableOpacity>
                    </View>

                    {/* PROGRESS */}

                    <View
                        style={
                            styles.progressContainer
                        }
                    >
                        <View
                            style={
                                styles.progressBarBg
                            }
                        >
                            <View
                                style={[
                                    styles.progressBarFill,
                                    {
                                        width:
                                            '60%',
                                    },
                                ]}
                            />
                        </View>

                        <Text
                            style={
                                styles.stepText
                            }
                        >
                            STEP 3 OF 5
                        </Text>
                    </View>

                    {/* TITLE  */}

                    <Text
                        style={
                            styles.title
                        }
                    >
                        Scan your new SIM
                    </Text>

                    <Text
                        style={
                            styles.lead
                        }
                    >
                        Hold the replacement SIM
                        barcode inside the yellow
                        frame. We will capture it
                        automatically.
                    </Text>

                    {/*  CAMERA */}

                    {stage !==
                        'manual' && (
                            <View
                                style={
                                    styles.cameraContainer
                                }
                            >
                                {(
                                    stage ===
                                    'camera' ||
                                    stage ===
                                    'scanning'
                                ) && (
                                    <CameraView
                                        ref={
                                            cameraRef
                                        }
                                        style={
                                            styles.camera
                                        }
                                        facing="back"
                                        barcodeScannerSettings={{
                                            barcodeTypes: [
                                                'code128',
                                                'code39',
                                                'code93',
                                                'codabar',
                                                'itf14',
                                                'ean13',
                                                'upc_a',
                                                'qr',
                                            ],
                                        }}
                                        onBarcodeScanned={
                                            stage ===
                                            'camera' &&
                                            !isProcessing &&
                                            !iccid
                                                ? handleBarcodeScanned
                                                : undefined
                                        }
                                    />
                                )}

                                {/* scanner overlay */}

                                <View
                                    pointerEvents="none"
                                    style={
                                        styles.cameraOverlay
                                    }
                                >
                                    <View
                                        style={
                                            styles.frame
                                        }
                                    >
                                        <View
                                            style={[
                                                styles.corner,
                                                styles.cornerTL,
                                            ]}
                                        />

                                        <View
                                            style={[
                                                styles.corner,
                                                styles.cornerTR,
                                            ]}
                                        />

                                        <View
                                            style={[
                                                styles.corner,
                                                styles.cornerBL,
                                            ]}
                                        />

                                        <View
                                            style={[
                                                styles.corner,
                                                styles.cornerBR,
                                            ]}
                                        />

                                        <View
                                            style={
                                                styles.scanLine
                                            }
                                        />
                                    </View>

                                    {stage ===
                                        'camera' && (
                                            <View
                                                style={
                                                    styles.autoScanHint
                                                }
                                            >
                                                <View
                                                    style={
                                                        styles.scanPulseDot
                                                    }
                                                />

                                                <Text
                                                    style={
                                                        styles.camHint
                                                    }
                                                >
                                                    Scanning automatically ·
                                                    Hold the barcode steady
                                                </Text>
                                            </View>
                                        )}
                                </View>

                                {/* processing */}

                                {(
                                    stage ===
                                    'scanning' ||
                                    stage ===
                                    'processing'
                                ) && (
                                    <View
                                        style={
                                            styles.processingWrap
                                        }
                                    >
                                        <ActivityIndicator
                                            size="large"
                                            color={
                                                ACCENT
                                            }
                                        />

                                        <Text
                                            style={
                                                styles.processingTitle
                                            }
                                        >
                                            {stage ===
                                            'scanning'
                                                ? 'SIM barcode detected'
                                                : 'Saving ICCID'}
                                        </Text>

                                        <Text
                                            style={
                                                styles.processingText
                                            }
                                        >
                                            {stage ===
                                            'scanning'
                                                ? 'Validating the replacement SIM…'
                                                : 'Securing the replacement SIM details…'}
                                        </Text>
                                    </View>
                                )}

                                {/* failed */}

                                {stage ===
                                    'failed' && (
                                        <View
                                            style={
                                                styles.resultWrap
                                            }
                                        >
                                            <View
                                                style={
                                                    styles.failureIcon
                                                }
                                            >
                                                <Ionicons
                                                    name="close"
                                                    size={28}
                                                    color="#FFFFFF"
                                                />
                                            </View>

                                            <Text
                                                style={
                                                    styles.resultTitle
                                                }
                                            >
                                                Unable to save SIM
                                            </Text>

                                            <Text
                                                style={
                                                    styles.resultText
                                                }
                                            >
                                                {error}
                                            </Text>

                                            <TouchableOpacity
                                                style={
                                                    styles.ctaButton
                                                }
                                                onPress={
                                                    handleRetry
                                                }
                                                activeOpacity={0.9}
                                            >
                                                <View
                                                    style={
                                                        styles.ctaTextWrap
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.ctaLabel
                                                        }
                                                    >
                                                        Try Again
                                                    </Text>

                                                    <Ionicons
                                                        name="refresh"
                                                        size={18}
                                                        color={
                                                            Colors.text
                                                        }
                                                    />
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                {/* success */}

                                {stage ===
                                    'success' && (
                                        <View
                                            style={
                                                styles.resultWrap
                                            }
                                        >
                                            <View
                                                style={
                                                    styles.successIcon
                                                }
                                            >
                                                <Ionicons
                                                    name="checkmark"
                                                    size={30}
                                                    color={
                                                        Colors.text
                                                    }
                                                />
                                            </View>

                                            <Text
                                                style={
                                                    styles.resultTitle
                                                }
                                            >
                                                SIM captured
                                            </Text>

                                            <Text
                                                style={
                                                    styles.resultText
                                                }
                                            >
                                                Replacement SIM ICCID
                                                captured successfully.
                                            </Text>

                                            {iccid ? (
                                                <View
                                                    style={
                                                        styles.iccidConfirmation
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.iccidConfirmationLabel
                                                        }
                                                    >
                                                        ICCID
                                                    </Text>

                                                    <Text
                                                        style={
                                                            styles.iccidConfirmationValue
                                                        }
                                                    >
                                                        •••• •••• ••••{' '}
                                                        {iccid.slice(
                                                            -4,
                                                        )}
                                                    </Text>
                                                </View>
                                            ) : null}
                                        </View>
                                    )}
                            </View>
                        )}

                    {/* ---------------------------------------------------------------
              MANUAL FALLBACK LINK
          --------------------------------------------------------------- */}

                    {stage !==
                        'manual' &&
                        !iccid && (
                            <TouchableOpacity
                                style={
                                    styles.manualEntryBtn
                                }
                                onPress={() => {
                                    setError(null);

                                    setStage(
                                        'manual',
                                    );
                                }}
                                activeOpacity={0.8}
                            >
                                <Ionicons
                                    name="keypad-outline"
                                    size={19}
                                    color={
                                        Colors.text
                                    }
                                />

                                <Text
                                    style={
                                        styles.manualEntryText
                                    }
                                >
                                    Enter ICCID manually
                                </Text>
                            </TouchableOpacity>
                        )}

                    {/* ---------------------------------------------------------------
              MANUAL FORM
          --------------------------------------------------------------- */}

                    {stage ===
                        'manual' && (
                            <View
                                style={
                                    styles.manualInputContainer
                                }
                            >
                                <View
                                    style={
                                        styles.manualHeader
                                    }
                                >
                                    <View
                                        style={
                                            styles.manualIcon
                                        }
                                    >
                                        <Ionicons
                                            name="keypad-outline"
                                            size={20}
                                            color={
                                                Colors.text
                                            }
                                        />
                                    </View>

                                    <View
                                        style={
                                            styles.manualHeaderText
                                        }
                                    >
                                        <Text
                                            style={
                                                styles.manualTitle
                                            }
                                        >
                                            Enter ICCID manually
                                        </Text>

                                        <Text
                                            style={
                                                styles.manualSubtitle
                                            }
                                        >
                                            Use the number printed on
                                            the replacement SIM.
                                        </Text>
                                    </View>
                                </View>

                                <Text
                                    style={
                                        styles.label
                                    }
                                >
                                    ICCID number
                                </Text>

                                <View
                                    style={
                                        styles.inputWrapper
                                    }
                                >
                                    <Text
                                        style={
                                            styles.prefixText
                                        }
                                    >
                                        89
                                    </Text>

                                    <TextInput
                                        style={
                                            styles.input
                                        }
                                        value={
                                            manualIccid
                                        }
                                        onChangeText={(
                                            value,
                                        ) => {
                                            setManualIccid(
                                                value.replace(
                                                    /\D/g,
                                                    '',
                                                ),
                                            );

                                            setError(null);
                                        }}
                                        placeholder="0000 0000 0000 0000 00"
                                        placeholderTextColor="#A1A1AA"
                                        keyboardType="number-pad"
                                        maxLength={18}
                                        editable={
                                            !isProcessing
                                        }
                                    />
                                </View>

                                {error ? (
                                    <View
                                        style={
                                            styles.inlineError
                                        }
                                    >
                                        <Ionicons
                                            name="alert-circle"
                                            size={15}
                                            color={
                                                Colors.error
                                            }
                                        />

                                        <Text
                                            style={
                                                styles.hintError
                                            }
                                        >
                                            {error}
                                        </Text>
                                    </View>
                                ) : null}

                                <Text
                                    style={
                                        styles.manualHint
                                    }
                                >
                                    The ICCID usually contains
                                    19–20 digits and starts with
                                    89.
                                </Text>

                                <TouchableOpacity
                                    style={[
                                        styles.ctaButton,
                                        styles.manualContinueButton,

                                        isProcessing &&
                                        styles.ctaBusy,
                                    ]}
                                    onPress={
                                        handleManualSubmit
                                    }
                                    disabled={
                                        isProcessing
                                    }
                                    activeOpacity={0.9}
                                >
                                    {isProcessing ? (
                                        <ActivityIndicator
                                            color={
                                                Colors.text
                                            }
                                        />
                                    ) : (
                                        <View
                                            style={
                                                styles.ctaTextWrap
                                            }
                                        >
                                            <Text
                                                style={
                                                    styles.ctaLabel
                                                }
                                            >
                                                Continue
                                            </Text>

                                            <Ionicons
                                                name="arrow-forward"
                                                size={18}
                                                color={
                                                    Colors.text
                                                }
                                            />
                                        </View>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={
                                        styles.backToCameraBtn
                                    }
                                    onPress={() => {
                                        setStage(
                                            'camera',
                                        );

                                        setManualIccid(
                                            '',
                                        );

                                        setError(null);

                                        setIccid(null);

                                        setIsProcessing(
                                            false,
                                        );
                                    }}
                                >
                                    <Ionicons
                                        name="barcode-outline"
                                        size={17}
                                        color={
                                            Colors.text
                                        }
                                    />

                                    <Text
                                        style={
                                            styles.backToCameraText
                                        }
                                    >
                                        Back to automatic scan
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}

                    {/* ---------------------------------------------------------------
              TRUST FOOTER
          --------------------------------------------------------------- */}

                    <View
                        style={
                            styles.trustRow
                        }
                    >
                        <Ionicons
                            name="lock-closed-outline"
                            size={13}
                            color={
                                Colors.muted
                            }
                        />

                        <Text
                            style={
                                styles.trustRowText
                            }
                        >
                            Encrypted · POPIA compliant ·
                            ICCID only
                        </Text>
                    </View>

                    <View
                        style={
                            styles.footerHint
                        }
                    >
                        <Text
                            style={
                                styles.footerText
                            }
                        >
                            Having trouble scanning?
                            Enter the ICCID manually.
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles =
    StyleSheet.create({
        safeArea: {
            flex: 1,

            backgroundColor:
            Colors.background,

            width:
                Platform.OS ===
                'web'
                    ? '100%'
                    : DESIGN_WIDTH,

            maxWidth:
                Platform.OS ===
                'web'
                    ? 520
                    : DESIGN_WIDTH,

            alignSelf:
                'center',
        },

        scrollView: {
            flex: 1,
        },

        scrollContent: {
            paddingTop: 12,
            paddingHorizontal: 20,
            paddingBottom: 40,
        },

        center: {
            flex: 1,

            justifyContent:
                'center',

            alignItems:
                'center',

            paddingHorizontal: 30,

            backgroundColor:
            Colors.background,
        },

        permissionBrand: {
            marginBottom: 28,
        },

        permissionIcon: {
            width: 82,
            height: 82,

            borderRadius: 24,

            backgroundColor:
                '#FFF6C7',

            alignItems:
                'center',

            justifyContent:
                'center',
        },

        permissionTitle: {
            fontSize: 24,

            fontWeight: '800',

            color:
            Colors.text,

            textAlign:
                'center',

            marginTop: 20,
        },

        permissionText: {
            color:
            Colors.muted,

            textAlign:
                'center',

            fontSize: 15,

            lineHeight: 22,

            marginTop: 9,

            marginBottom: 24,

            maxWidth: 360,
        },

        header: {
            flexDirection: 'row',

            alignItems:
                'center',

            justifyContent:
                'space-between',

            paddingBottom: 14,

            paddingTop: 4,
        },

        headerLeft: {
            flexDirection: 'row',

            alignItems:
                'center',

            gap: 8,
        },

        backBtn: {
            width: 40,
            height: 40,

            borderRadius: 20,

            alignItems:
                'center',

            justifyContent:
                'center',
        },

        headerBrand: {
            flexDirection: 'row',

            alignItems:
                'center',

            backgroundColor:
                '#000000',

            borderRadius: 999,

            paddingVertical: 5,

            paddingRight: 12,

            paddingLeft: 6,
        },

        mtnBadge: {
            width: 46,
            height: 26,

            borderRadius: 999,

            borderWidth: 2.5,

            borderColor:
            ACCENT,

            alignItems:
                'center',

            justifyContent:
                'center',

            backgroundColor:
                '#000000',
        },

        mtnText: {
            fontSize: 12.5,

            fontWeight: '800',

            letterSpacing: 0.1,

            color:
            ACCENT,
        },

        trustText: {
            marginLeft: 9,

            color:
                '#FFFFFF',

            fontSize: 16,

            fontWeight: '800',

            letterSpacing:
                -0.32,
        },

        langBtn: {
            flexDirection: 'row',

            alignItems:
                'center',

            gap: 4,

            paddingHorizontal: 12,

            paddingVertical: 7,

            backgroundColor:
                '#F3F4F6',

            borderRadius: 20,
        },

        langText: {
            color:
            Colors.text,

            fontWeight: '700',

            fontSize: 13,
        },

        progressContainer: {
            marginBottom: 24,

            marginTop: 4,
        },

        progressBarBg: {
            height: 4,

            backgroundColor:
                '#E5E7EB',

            borderRadius: 999,

            marginBottom: 8,

            overflow: 'hidden',
        },

        progressBarFill: {
            height:
                '100%',

            backgroundColor:
            ACCENT,
        },

        stepText: {
            color:
            Colors.muted,

            fontWeight:
                '800',

            fontSize: 10.5,

            letterSpacing: 0.8,
        },

        title: {
            color:
            Colors.text,

            fontSize: 28,

            lineHeight: 34,

            fontWeight:
                '800',

            letterSpacing:
                -0.78,

            marginBottom: 10,
        },

        lead: {
            color:
            Colors.muted,

            marginBottom: 22,

            lineHeight: 22,

            fontSize: 15,
        },

        cameraContainer: {
            width: '100%',

            height: 300,

            borderRadius: 22,

            overflow: 'hidden',

            backgroundColor:
                '#000000',

            marginBottom: 12,

            position:
                'relative',
        },

        camera: {
            width: '100%',

            height:
                '100%',
        },

        cameraOverlay: {
            ...StyleSheet.absoluteFillObject,

            justifyContent:
                'center',

            alignItems:
                'center',

            paddingHorizontal: 18,
        },

        frame: {
            width: '88%',

            maxWidth: 330,

            height: 150,

            position:
                'relative',

            justifyContent:
                'center',

            alignItems:
                'center',
        },

        corner: {
            position:
                'absolute',

            width: 34,

            height: 34,

            borderColor:
            ACCENT,

            borderWidth: 4,
        },

        cornerTL: {
            top: 0,
            left: 0,

            borderBottomWidth: 0,

            borderRightWidth: 0,

            borderTopLeftRadius: 14,
        },

        cornerTR: {
            top: 0,
            right: 0,

            borderBottomWidth: 0,

            borderLeftWidth: 0,

            borderTopRightRadius: 14,
        },

        cornerBL: {
            bottom: 0,
            left: 0,

            borderTopWidth: 0,

            borderRightWidth: 0,

            borderBottomLeftRadius: 14,
        },

        cornerBR: {
            bottom: 0,
            right: 0,

            borderTopWidth: 0,

            borderLeftWidth: 0,

            borderBottomRightRadius: 14,
        },

        scanLine: {
            position:
                'absolute',

            left: 20,

            right: 20,

            height: 2,

            backgroundColor:
            ACCENT,

            opacity: 0.9,
        },

        autoScanHint: {
            flexDirection: 'row',

            alignItems:
                'center',

            justifyContent:
                'center',

            gap: 8,

            backgroundColor:
                'rgba(0,0,0,0.62)',

            borderRadius: 999,

            paddingHorizontal: 14,

            paddingVertical: 9,

            marginTop: 22,
        },

        scanPulseDot: {
            width: 8,
            height: 8,

            borderRadius: 4,

            backgroundColor:
            ACCENT,
        },

        camHint: {
            flexShrink: 1,

            color:
                '#FFFFFF',

            fontSize: 12.5,

            lineHeight: 17,

            fontWeight:
                '700',

            textAlign:
                'center',
        },

        processingWrap: {
            ...StyleSheet.absoluteFillObject,

            justifyContent:
                'center',

            alignItems:
                'center',

            backgroundColor:
                'rgba(0,0,0,0.82)',

            paddingHorizontal: 28,
        },

        processingTitle: {
            color:
                '#FFFFFF',

            fontSize: 18,

            fontWeight:
                '800',

            marginTop: 16,
        },

        processingText: {
            color:
                '#D1D5DB',

            fontSize: 14,

            textAlign:
                'center',

            lineHeight: 20,

            marginTop: 7,
        },

        resultWrap: {
            ...StyleSheet.absoluteFillObject,

            justifyContent:
                'center',

            alignItems:
                'center',

            backgroundColor:
                'rgba(0,0,0,0.88)',

            paddingHorizontal: 28,
        },

        successIcon: {
            width: 60,
            height: 60,

            borderRadius: 20,

            backgroundColor:
            ACCENT,

            alignItems:
                'center',

            justifyContent:
                'center',
        },

        failureIcon: {
            width: 60,
            height: 60,

            borderRadius: 20,

            backgroundColor:
            Colors.error,

            alignItems:
                'center',

            justifyContent:
                'center',
        },

        resultTitle: {
            color:
                '#FFFFFF',

            fontSize: 22,

            fontWeight:
                '800',

            marginTop: 16,

            textAlign:
                'center',
        },

        resultText: {
            color:
                '#D1D5DB',

            fontSize: 14,

            lineHeight: 20,

            textAlign:
                'center',

            marginTop: 7,

            marginBottom: 16,
        },

        iccidConfirmation: {
            backgroundColor:
                'rgba(255,255,255,0.10)',

            borderRadius: 12,

            paddingVertical: 10,

            paddingHorizontal: 18,

            alignItems:
                'center',

            marginTop: 2,
        },

        iccidConfirmationLabel: {
            color:
                '#AFAFB8',

            fontSize: 10,

            fontWeight:
                '700',

            letterSpacing: 1,
        },

        iccidConfirmationValue: {
            color:
                '#FFFFFF',

            fontSize: 14,

            fontWeight:
                '800',

            marginTop: 3,
        },

        manualEntryBtn: {
            flexDirection: 'row',

            alignItems:
                'center',

            justifyContent:
                'center',

            gap: 7,

            paddingVertical: 13,

            marginBottom: 8,
        },

        manualEntryText: {
            color:
            Colors.text,

            fontWeight:
                '700',

            fontSize: 14,

            textDecorationLine:
                'underline',
        },

        manualInputContainer: {
            backgroundColor:
                '#F9FAFB',

            borderRadius: 20,

            padding: 20,

            marginBottom: 18,

            borderWidth: 1,

            borderColor:
                '#EFEFF3',
        },

        manualHeader: {
            flexDirection: 'row',

            alignItems:
                'center',

            gap: 12,

            marginBottom: 20,
        },

        manualIcon: {
            width: 42,
            height: 42,

            borderRadius: 12,

            backgroundColor:
                '#FFF5C2',

            alignItems:
                'center',

            justifyContent:
                'center',
        },

        manualHeaderText: {
            flex: 1,
        },

        manualTitle: {
            color:
            Colors.text,

            fontSize: 17,

            fontWeight:
                '800',
        },

        manualSubtitle: {
            color:
            Colors.muted,

            fontSize: 12.5,

            lineHeight: 18,

            marginTop: 2,
        },

        label: {
            color:
            Colors.text,

            marginBottom: 8,

            fontWeight:
                '700',

            fontSize: 13.5,
        },

        inputWrapper: {
            flexDirection:
                'row',

            alignItems:
                'center',

            backgroundColor:
                '#FFFFFF',

            borderWidth: 1,

            borderColor:
                '#DADAE1',

            borderRadius: 13,

            marginBottom: 8,
        },

        prefixText: {
            paddingHorizontal: 15,

            paddingVertical: 15,

            color:
            Colors.text,

            fontWeight:
                '800',

            fontSize: 16,

            borderRightWidth: 1,

            borderColor:
                '#E5E7EB',
        },

        input: {
            flex: 1,

            paddingVertical: 15,

            paddingHorizontal: 14,

            fontSize: 15,

            color:
            Colors.text,

            fontWeight:
                '600',
        },

        inlineError: {
            flexDirection: 'row',

            alignItems:
                'center',

            gap: 5,

            marginTop: 3,
        },

        hintError: {
            color:
            Colors.error,

            fontSize: 12,

            fontWeight:
                '600',

            flex: 1,
        },

        manualHint: {
            color:
            Colors.muted,

            fontSize: 12,

            lineHeight: 17,

            marginTop: 5,
        },

        manualContinueButton: {
            marginTop: 18,
        },

        backToCameraBtn: {
            marginTop: 14,

            flexDirection:
                'row',

            alignItems:
                'center',

            justifyContent:
                'center',

            gap: 6,

            paddingVertical: 8,
        },

        backToCameraText: {
            color:
            Colors.text,

            fontWeight:
                '700',

            fontSize: 13.5,

            textDecorationLine:
                'underline',
        },

        trustRow: {
            flexDirection:
                'row',

            alignItems:
                'center',

            justifyContent:
                'center',

            gap: 6,

            marginBottom: 16,

            marginTop: 8,
        },

        trustRowText: {
            color:
            Colors.muted,

            fontSize: 11.5,

            fontWeight:
                '700',

            letterSpacing: 0.1,

            textAlign:
                'center',
        },

        ctaButton: {
            borderRadius: 18,

            paddingVertical: 17,

            paddingHorizontal: 18,

            minHeight: 56,

            flexDirection:
                'row',

            alignItems:
                'center',

            justifyContent:
                'center',

            backgroundColor:
            ACCENT,

            width: '100%',

            maxWidth: 420,
        },

        ctaBusy: {
            opacity: 0.75,
        },

        ctaTextWrap: {
            flexDirection:
                'row',

            alignItems:
                'center',

            justifyContent:
                'center',

            gap: 8,
        },

        ctaLabel: {
            fontSize: 15,

            fontWeight:
                '800',

            letterSpacing:
                -0.25,

            color:
            Colors.text,
        },

        footerHint: {
            alignItems:
                'center',

            marginTop: 5,
        },

        footerText: {
            textAlign:
                'center',

            color:
                '#8A8A94',

            fontSize: 12,

            fontWeight:
                '600',

            lineHeight: 18,
        },
    });
