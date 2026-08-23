import { useCallback, useState } from 'react';
import { initiateSimSwap } from '@/shared/api';

interface SimSwapPayload {
  idNumber: string;
  msisdn: string;
  iccid: string;
  selfieId?: string;
  deviceId?: string;
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
        device_id: payload.deviceId,
      });
      setServerMessage(result.message);
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
