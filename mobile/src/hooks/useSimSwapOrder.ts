import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { initiateSimSwap, type SwapConsent } from '@/shared/api';

interface SimSwapPayload {
  idNumber: string;
  msisdn: string;
  iccid: string;
  selfieId?: string;
  /** The device identifier, at least 16 characters. */
  deviceId: string;
  /** Read back from where ConsentScreen recorded it - never synthesised
   *  here, because the platform stores it as evidence of what the customer
   *  agreed to and when. */
  consent: SwapConsent;
  /** Play Integrity / DeviceCheck attestation, when the build has it. */
  deviceAttested?: boolean;
}

function devicePlatform(): 'android' | 'ios' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export function useSimSwapOrder() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [serverMessage, setServerMessage] = useState('');

  const submit = useCallback(async (payload: SimSwapPayload): Promise<boolean> => {
    setStatus('loading');
    setServerMessage('');

    try {
      const result = await initiateSimSwap({
        id_number: payload.idNumber,
        msisdn: payload.msisdn,
        iccid: payload.iccid,
        selfie_id: payload.selfieId,
        consent: payload.consent,
        device: {
          fingerprint: payload.deviceId,
          platform: devicePlatform(),
          attested: payload.deviceAttested ?? false,
        },
        idempotency_key: `swap-${Crypto.randomUUID()}`,
      });

      setServerMessage(result.message);

      // The status is the decision, not the transport result: `in_review` and
      // `denied` both arrive as a successful response, and neither is an
      // accepted swap.
      if (result.status !== 'pending_verification') {
        setStatus('error');
        return false;
      }

      setStatus('success');
      return true;
    } catch (error) {
      setStatus('error');
      setServerMessage(error instanceof Error ? error.message : 'Failed to initiate SIM swap.');
      return false;
    }
  }, []);

  const dismissError = useCallback(() => {
    setServerMessage('');
    if (status === 'error') setStatus('idle');
  }, [status]);

  return { submit, status, serverMessage, dismissError };
}
