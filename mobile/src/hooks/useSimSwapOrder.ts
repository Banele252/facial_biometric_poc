import { useState, useCallback } from 'react';

// ── TEMP MOCK FLAG ─────────────────────────────────────────────
// Set to false when the real endpoint is ready.
const USE_MOCK = true;
// ───────────────────────────────────────────────────────────────

interface SimSwapPayload {
  fullName: string;
  msisdn: string;
  iccid: string;
}

export function useSimSwapOrder() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [serverMessage, setServerMessage] = useState('');

  const submit = useCallback(async (payload: SimSwapPayload): Promise<boolean> => {
    setStatus('loading');
    setServerMessage('');

    if (USE_MOCK) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      console.log('[MOCK] sim-swap/initiate 200 OK', payload);
      setStatus('success');
      return true;
    }

    try {
      const base = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
      const response = await fetch(`${base}/api/v1/sim-swap/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Request failed (${response.status})`);
      }

      setStatus('success');
      return true;
    } catch (error: any) {
      setStatus('error');
      setServerMessage(error.message || 'Failed to initiate SIM swap.');
      return false;
    }
  }, []);

  const dismissError = useCallback(() => {
    setServerMessage('');
    if (status === 'error') setStatus('idle');
  }, [status]);

  return { submit, status, serverMessage, dismissError };
}