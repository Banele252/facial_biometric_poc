// src/hooks/useValidateId.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { validateIdNumber, IdValidationResult } from '@/shared/idValidation';
import { validateId } from '@/shared/api';

type SubmitStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseValidateIdReturn {
  value: string;
  setValue: (raw: string) => void;
  liveResult: IdValidationResult;
  status: SubmitStatus;
  isLoading: boolean;
  serverMessage: string | null;
  submit: () => Promise<boolean>;
  reset: () => void;
  dismissError: () => void;
}

export function useValidateId(): UseValidateIdReturn {
  const [value, setValueState] = useState('');
  const [liveResult, setLiveResult] = useState<IdValidationResult>({
    level: 'idle',
    text: '13 digits, as printed in your green ID book or card.',
  });
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const setValue = useCallback((raw: string) => {
    const sanitized = raw.replace(/\D/g, '').slice(0, 13);
    setValueState(sanitized);
    setLiveResult(validateIdNumber(sanitized));
    setServerMessage(null);
    setStatus('idle');
  }, []);

  const dismissError = useCallback(() => {
    setServerMessage(null);
    if (status === 'error') setStatus('idle');
  }, [status]);

  const submit = useCallback(async (): Promise<boolean> => {
    if (liveResult.level !== 'valid') return false;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus('loading');
    setServerMessage(null);

    try {
      const res = await validateId(value);
      if (ctrl.signal.aborted) return false;

      if (res.valid) {
        setStatus('success');
        return true;
      } else {
        setStatus('error');
        setServerMessage(res.failed_checks?.join(', ') ?? 'ID verification failed.');
        return false;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return false;
      setStatus('error');
      setServerMessage((err as Error).message ?? 'Network error. Please try again.');
      return false;
    }
  }, [liveResult.level, value]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setValueState('');
    setLiveResult({
      level: 'idle',
      text: '13 digits, as printed in your green ID book or card.',
    });
    setStatus('idle');
    setServerMessage(null);
  }, []);

  return {
    value,
    setValue,
    liveResult,
    status,
    isLoading: status === 'loading',
    serverMessage,
    submit,
    reset,
    dismissError,
  };
}