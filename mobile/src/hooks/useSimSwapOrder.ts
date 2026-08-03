// src/hooks/useSimSwapOrder.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import { request } from '@/shared/api';

export type SimSwapStatus = 'idle' | 'loading' | 'success' | 'error';

interface SimSwapPayload {
    fullName: string;
    msisdn: string;
    iccid: string;
}

interface UseSimSwapOrderReturn {
    status: SimSwapStatus;
    isLoading: boolean;
    serverMessage: string | null;
    submit: (payload: SimSwapPayload) => Promise<boolean>;
    dismissError: () => void;
}

export function useSimSwapOrder(): UseSimSwapOrderReturn {
  const [status, setStatus] = useState<SimSwapStatus>('idle');
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const submit = useCallback(async (payload: SimSwapPayload): Promise<boolean> => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus('loading');
    setServerMessage(null);

    try {
      await request('/api/v1/sim-swap/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: payload.fullName,
          msisdn: payload.msisdn,
          new_sim_serial: payload.iccid,
        }),
        signal: ctrl.signal,
      });

      if (ctrl.signal.aborted) return false;
      setStatus('success');
      return true;
    } catch (err) {
      if (ctrl.signal.aborted) return false;
      const message = err instanceof Error ? err.message : 'Could not submit swap details.';
      setServerMessage(message);
      setStatus('error');
      return false;
    }
  }, []);

  const dismissError = useCallback(() => {
    setServerMessage(null);
    if (status === 'error') setStatus('idle');
  }, [status]);

  return { status, isLoading: status === 'loading', serverMessage, submit, dismissError };
}