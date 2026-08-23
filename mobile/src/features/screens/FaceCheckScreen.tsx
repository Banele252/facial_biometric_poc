// src/features/screens/FaceCheckScreen.tsx

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
  Platform,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  CameraView,
  useCameraPermissions,
} from 'expo-camera';

import { apiClient } from '@/lib/apiClient';
import { getApiErrorMessage } from '@/lib/http';
import { useAudit } from '@/hooks/useAudit';

interface Props {
  idNumber?: string;
  phoneNumber?: string;
  fullName?: string;
  photoUrl?: string;
  sessionId?: string;
  selfieId?: string;
  iccid?: string;
  iccidSource?: 'manual' | 'barcode';
  navigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  dispatch?: (action: { type: string; payload?: any }) => void;
}

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

type Stage =
    | 'camera'
    | 'countdown'
    | 'capture'
    | 'processing'
    | 'failed'
    | 'success';

export default function FaceCheckScreen({
                                          idNumber = '',
                                          phoneNumber = '',
                                          fullName = '',
                                          photoUrl = '',
                                          sessionId = '',
                                          iccid = '',
                                          iccidSource,
                                          navigate,
                                          goBack,
                                          dispatch,
                                        }: Props) {
  const audit = useAudit('FaceCheckScreen');

  const [permission, requestPermission] =
      useCameraPermissions();

  const [stage, setStage] =
      useState<Stage>('camera');

  const [countdown, setCountdown] =
      useState(3);

  const [error, setError] =
      useState<string | null>(null);

  const cameraRef =
      useRef<CameraView>(null);

  const timersRef =
      useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!permission?.granted) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  const proceedToReview = useCallback(
      (capturedSelfieId: string) => {
        const params = {
          idNumber,
          phoneNumber,
          fullName,
          photoUrl,
          sessionId,
          selfieId: capturedSelfieId,
          iccid,
          iccidSource,
        };

        if (navigate) {
          navigate('ReviewScreen', params);
          return;
        }

        dispatch?.({
          type: 'NAVIGATE',
          payload: {
            screen: 'ReviewScreen',
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
        iccid,
        iccidSource,
        navigate,
        dispatch,
      ],
  );

  const handleCapture = useCallback(async () => {
    setStage('capture');
    setError(null);

    try {
      if (!idNumber.trim()) {
        throw new Error(
            'RSA identity number is missing. Please return to identity verification.',
        );
      }

      audit.log('LIVENESS_INITIATED', {
        outcome: 'pending',
        metadata: {
          sessionId,
          method: 'selfie',
          idNumberLast4: idNumber.slice(-4),
        },
      });

      const camera = cameraRef.current;

      if (!camera) {
        throw new Error(
            'Camera is not ready. Please try again.',
        );
      }

      const photo =
          await camera.takePictureAsync({
            base64: true,
            quality: 0.85,
            skipProcessing: false,
          });

      if (!photo) {
        throw new Error(
            'Camera did not return an image. Please try again.',
        );
      }

      setStage('processing');

      let image: string;

      const rawBase64 =
          photo.base64?.trim();

      if (rawBase64) {
        image =
            rawBase64.startsWith('data:image/')
                ? rawBase64
                : `data:image/jpeg;base64,${rawBase64}`;
      } else if (
          Platform.OS === 'web' &&
          photo.uri
      ) {
        const response =
            await fetch(photo.uri);

        if (!response.ok) {
          throw new Error(
              'Unable to read the captured camera image.',
          );
        }

        const blob =
            await response.blob();

        image =
            await new Promise<string>(
                (resolve, reject) => {
                  const reader =
                      new FileReader();

                  reader.onloadend = () => {
                    if (
                        typeof reader.result === 'string'
                    ) {
                      resolve(reader.result);
                      return;
                    }

                    reject(
                        new Error(
                            'Unable to convert captured image to Base64.',
                        ),
                    );
                  };

                  reader.onerror = () => {
                    reject(
                        new Error(
                            'Unable to read captured camera image.',
                        ),
                    );
                  };

                  reader.readAsDataURL(blob);
                },
            );
      } else {
        throw new Error(
            'Camera capture did not contain image data.',
        );
      }

      if (!image.startsWith('data:image/')) {
        throw new Error(
            'Captured image is not a supported image format.',
        );
      }

      const base64Marker =
          ';base64,';

      const markerIndex =
          image.indexOf(base64Marker);

      if (markerIndex < 0) {
        throw new Error(
            'Captured image is not Base64 encoded.',
        );
      }

      const encoded =
          image.slice(
              markerIndex +
              base64Marker.length,
          );

      if (!encoded.trim()) {
        throw new Error(
            'Captured image contains no image data.',
        );
      }

      console.log(
          '[FaceCheck] image diagnostics',
          {
            platform: Platform.OS,
            idNumberLength:
                idNumber.length,
            photoUriPresent:
                Boolean(photo.uri),
            photoBase64Present:
                Boolean(photo.base64),
            rawBase64Length:
                rawBase64?.length ?? 0,
            imageLength:
                image.length,
            imagePrefix:
                image.slice(0, 32),
            encodedLength:
                encoded.length,
          },
      );

      const selfie =
          await apiClient.captureSelfie({
            idNumber,
            image,
          });

      const capturedSelfieId =
          selfie.selfie_id;

      if (!capturedSelfieId) {
        throw new Error(
            'The selfie service did not return a selfie reference.',
        );
      }

      /*
       * Keep ID_SCAN_COMPLETED for now only if it exists
       * in your AuditEvent union.
       * Later rename/add SELFIE_CAPTURED.
       */
      audit.log('ID_SCAN_COMPLETED', {
        outcome: 'success',
        metadata: {
          selfieId: capturedSelfieId,
          sizeBytes: selfie.size_bytes,
          sessionId,
          captureMethod: 'camera',
        },
      });

      const liveness =
          await apiClient.checkLiveness({
            selfieId: capturedSelfieId,
            challengeType: 'blink',
            sessionId,
          });

      if (!liveness.is_live) {
        const reason =
            liveness.detail ||
            'Liveness check failed. Please try again.';

        audit.log('LIVENESS_FAILED', {
          outcome: 'failure',
          reason,
          metadata: {
            score: liveness.score,
            provider: liveness.provider,
            sessionId,
            selfieId: capturedSelfieId,
          },
        });

        throw new Error(reason);
      }

      audit.log('LIVENESS_PASSED', {
        outcome: 'success',
        metadata: {
          score: liveness.score,
          provider: liveness.provider,
          sessionId,
          selfieId: capturedSelfieId,
        },
      });

      setStage('success');

      const timer = setTimeout(() => {
        proceedToReview(capturedSelfieId);
      }, 800);

      timersRef.current.push(timer);
    } catch (err: unknown) {
      const message =
          getApiErrorMessage(err);

      console.error(
          '[FaceCheckScreen] Face verification failed',
          err,
      );

      setError(message);
      setStage('failed');

      audit.log('LIVENESS_FAILED', {
        outcome: 'failure',
        reason: message,
        metadata: {
          sessionId,
          idNumberLast4: idNumber.slice(-4),
        },
      });
    }
  }, [
    audit,
    idNumber,
    proceedToReview,
    sessionId,
  ]);

  const handleStart = useCallback(() => {
    setError(null);
    setCountdown(3);
    setStage('countdown');
  }, []);

  useEffect(() => {
    if (
        stage !== 'countdown' ||
        countdown <= 0
    ) {
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((current) => current - 1);
    }, 1000);

    timersRef.current.push(timer);

    return () => clearTimeout(timer);
  }, [stage, countdown]);

  useEffect(() => {
    if (
        stage !== 'countdown' ||
        countdown !== 0
    ) {
      return;
    }

    const timer = setTimeout(() => {
      void handleCapture();
    }, 0);

    timersRef.current.push(timer);

    return () => clearTimeout(timer);
  }, [
    stage,
    countdown,
    handleCapture,
  ]);

  const handleRetry = useCallback(() => {
    setError(null);
    setCountdown(3);
    setStage('camera');
  }, []);

  if (!permission?.granted) {
    return (
        <SafeAreaView style={styles.permissionScreen}>
          <StatusBar style="dark" />

          <View style={styles.permissionBrand}>
            <View style={styles.headerBrand}>
              <View style={styles.mtnBadge}>
                <Text style={styles.mtnText}>MTN</Text>
              </View>

              <Text style={styles.trustText}>
                trust
              </Text>
            </View>
          </View>

          <View style={styles.permissionIcon}>
            <Ionicons
                name="camera-outline"
                size={36}
                color={Colors.text}
            />
          </View>

          <Text style={styles.permissionTitle}>
            Camera access required
          </Text>

          <Text style={styles.permissionText}>
            We need camera access to verify your face
            and run a secure liveness check.
          </Text>

          <TouchableOpacity
              style={styles.primaryBtn}
              onPress={requestPermission}
              activeOpacity={0.88}
          >
            <Text style={styles.btnText}>
              Allow Camera
            </Text>

            <Ionicons
                name="arrow-forward"
                size={18}
                color={Colors.text}
            />
          </TouchableOpacity>
        </SafeAreaView>
    );
  }

  return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        <View style={styles.cameraWrap}>
          {(stage === 'camera' ||
              stage === 'countdown' ||
              stage === 'capture') && (
              <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing="front"
              />
          )}

          <View style={styles.overlay}>
            <View style={styles.header}>
              <TouchableOpacity
                  onPress={goBack}
                  style={styles.backBtn}
                  hitSlop={8}
                  activeOpacity={0.85}
              >
                <Ionicons
                    name="chevron-back"
                    size={22}
                    color="#FFFFFF"
                />
              </TouchableOpacity>

              <View style={styles.headerBrand}>
                <View style={styles.mtnBadge}>
                  <Text style={styles.mtnText}>
                    MTN
                  </Text>
                </View>

                <Text style={styles.trustText}>
                  trust
                </Text>
              </View>

              <View style={styles.stepPill}>
                <Text style={styles.stepPillText}>
                  STEP 4 OF 5
                </Text>
              </View>
            </View>

            <View style={styles.topCopy}>
              <Text style={styles.title}>
                Verify your face
              </Text>

              <Text style={styles.lead}>
                Position your face inside the frame.
                We will capture your image and run a
                secure liveness check.
              </Text>
            </View>

            <View style={styles.guide}>
              <View style={styles.oval}>
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
              </View>
            </View>

            {stage === 'camera' && (
                <View style={styles.controls}>
                  <View style={styles.instructionCard}>
                    <Ionicons
                        name="sunny-outline"
                        size={18}
                        color={ACCENT}
                    />

                    <Text style={styles.instruction}>
                      Keep your face centred and make sure
                      the lighting is clear.
                    </Text>
                  </View>

                  <TouchableOpacity
                      style={styles.captureButton}
                      onPress={handleStart}
                      activeOpacity={0.9}
                  >
                    <View style={styles.captureIconWrap}>
                      <Ionicons
                          name="scan-outline"
                          size={24}
                          color={Colors.text}
                      />
                    </View>

                    <Text style={styles.captureButtonText}>
                      Start face scan
                    </Text>

                    <Ionicons
                        name="arrow-forward"
                        size={19}
                        color={Colors.text}
                    />
                  </TouchableOpacity>

                  <View style={styles.trustRow}>
                    <Ionicons
                        name="lock-closed-outline"
                        size={14}
                        color="#FFFFFF"
                    />

                    <Text style={styles.trustTextSmall}>
                      Encrypted · Liveness protected ·
                      POPIA compliant
                    </Text>
                  </View>
                </View>
            )}

            {stage === 'countdown' && (
                <View style={styles.countdownWrap}>
                  <Text style={styles.countdownLabel}>
                    Hold still
                  </Text>

                  <Text style={styles.countdownText}>
                    {countdown}
                  </Text>
                </View>
            )}

            {(stage === 'processing' ||
                stage === 'capture') && (
                <View style={styles.processingWrap}>
                  <ActivityIndicator
                      size="large"
                      color={ACCENT}
                  />

                  <Text style={styles.processingTitle}>
                    {stage === 'capture'
                        ? 'Capturing your face…'
                        : 'Checking liveness…'}
                  </Text>

                  <Text style={styles.processingText}>
                    This should only take a moment.
                  </Text>
                </View>
            )}

            {stage === 'failed' && (
                <View style={styles.resultWrap}>
                  <Ionicons
                      name="close-circle"
                      size={64}
                      color={Colors.error}
                  />

                  <Text style={styles.resultTitle}>
                    Verification failed
                  </Text>

                  <Text style={styles.resultText}>
                    {error ||
                        'Face verification could not be completed. Please try again.'}
                  </Text>

                  <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={handleRetry}
                      activeOpacity={0.88}
                  >
                    <Text style={styles.btnText}>
                      Try Again
                    </Text>
                  </TouchableOpacity>
                </View>
            )}

            {stage === 'success' && (
                <View style={styles.resultWrap}>
                  <Ionicons
                      name="checkmark-circle"
                      size={64}
                      color={Colors.success}
                  />

                  <Text style={styles.resultTitle}>
                    Face verified
                  </Text>

                  <Text style={styles.resultText}>
                    Liveness passed. Proceeding to review…
                  </Text>
                </View>
            )}
          </View>
        </View>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    maxWidth:
        Platform.OS === 'web'
            ? 520
            : DESIGN_WIDTH,
    alignSelf: 'center',
    backgroundColor: '#000000',
  },

  cameraWrap: {
    flex: 1,
    backgroundColor: '#000000',
  },

  camera: {
    ...StyleSheet.absoluteFillObject,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },

  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
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
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },

  mtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.1,
    color: ACCENT,
  },

  trustText: {
    marginLeft: 9,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.32,
  },

  stepPill: {
    minHeight: 32,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: 10,
  },

  stepPillText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  topCopy: {
    marginTop: 26,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.78,
  },

  lead: {
    color: '#E5E7EB',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 360,
  },

  guide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  oval: {
    width: 252,
    height: 328,
    borderRadius: 126,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
    position: 'relative',
  },

  corner: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderColor: ACCENT,
    borderWidth: 4,
  },

  cornerTL: {
    top: 12,
    left: 8,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 24,
  },

  cornerTR: {
    top: 12,
    right: 8,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 24,
  },

  cornerBL: {
    bottom: 12,
    left: 8,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 24,
  },

  cornerBR: {
    bottom: 12,
    right: 8,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 24,
  },

  controls: {
    gap: 14,
  },

  instructionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(17,17,20,0.72)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  instruction: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },

  captureButton: {
    minHeight: 60,
    borderRadius: 20,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: ACCENT,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 8,
  },

  captureIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },

  captureButtonText: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.25,
  },

  trustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 2,
  },

  trustTextSmall: {
    color: '#E5E7EB',
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
  },

  countdownWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.46)',
  },

  countdownLabel: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },

  countdownText: {
    color: ACCENT,
    fontSize: 104,
    lineHeight: 110,
    fontWeight: '800',
  },

  processingWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.80)',
    paddingHorizontal: 32,
  },

  processingTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 18,
  },

  processingText: {
    color: '#D1D5DB',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },

  resultWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.86)',
    gap: 12,
    paddingHorizontal: 32,
  },

  resultTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
  },

  resultText: {
    color: '#D1D5DB',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },

  primaryBtn: {
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: ACCENT,
    paddingVertical: 16,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },

  btnText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },

  permissionScreen: {
    flex: 1,
    width: '100%',
    maxWidth:
        Platform.OS === 'web'
            ? 520
            : DESIGN_WIDTH,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    backgroundColor: Colors.background,
  },

  permissionBrand: {
    marginBottom: 30,
  },

  permissionIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF7D6',
  },

  permissionTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 20,
  },

  permissionText: {
    color: Colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
});