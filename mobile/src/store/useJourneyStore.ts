// src/store/useJourneyStore.ts
import { create } from 'zustand';
import { stamp, type LedgerEntry } from '@/shared/ledger-entry';
import type {
  ValidationResponse,
  LivenessResponse,
  VerificationDecision,
  AttemptRecord,
  NotificationRecord,
  TransactionKind,
} from '@/shared/api';

export type JourneyStep =
    | 'id'
    | 'face'
    | 'confirm'
    | 'done'
    | 'splash'
    | 'requestSimSwap'
    | 'saidSelection'
    | 'identityValidation'
    | 'simSwapDetails'
    | 'idDocumentScan'
    | 'facialVerification'
    | 'livenessDetection'
    | 'fraudIntelligenceChecks'
    | 'simSwapApproved'
    | 'simSwapComplete';

interface JourneyState {
    // ── Navigation ──
    step: JourneyStep;
    setStep: (step: JourneyStep) => void;

    // ── Identity ──
    idNumber: string;
    setIdNumber: (id: string) => void;
    fullName: string;
    setFullName: (name: string) => void;

    // ── SIM Swap Details ──
    msisdn: string;
    setMsisdn: (m: string) => void;
    newSim: string;
    setNewSim: (s: string) => void;
    transaction: TransactionKind;
    setTransaction: (t: TransactionKind) => void;
    targetNetwork: string;
    setTargetNetwork: (n: string) => void;

    // ── API Results ──
    validation: ValidationResponse | null;
    setValidation: (v: ValidationResponse | null) => void;
    selfieId: string | null;
    setSelfieId: (id: string | null) => void;
    liveness: LivenessResponse | null;
    setLiveness: (l: LivenessResponse | null) => void;
    decision: VerificationDecision | null;
    setDecision: (d: VerificationDecision | null) => void;
    notifications: NotificationRecord[];
    setNotifications: (n: NotificationRecord[]) => void;
    history: AttemptRecord[];
    setHistory: (h: AttemptRecord[]) => void;

    // ── UI State ──
    loading: boolean;
    setLoading: (l: boolean) => void;
    error: string | null;
    setError: (e: string | null) => void;

    // ── Audit Ledger ──
    entries: LedgerEntry[];
    record: (label: string, kind: LedgerEntry['kind'], detail?: string) => void;
    clearLedger: () => void;

    // ── Reset ──
    reset: () => void;
}

const initialState = {
  step: 'splash' as JourneyStep,
  idNumber: '',
  fullName: '',
  msisdn: '',
  newSim: '',
  transaction: 'sim_swap' as TransactionKind,
  targetNetwork: '',
  validation: null as ValidationResponse | null,
  selfieId: null as string | null,
  liveness: null as LivenessResponse | null,
  decision: null as VerificationDecision | null,
  notifications: [] as NotificationRecord[],
  history: [] as AttemptRecord[],
  loading: false,
  error: null as string | null,
  entries: [] as LedgerEntry[],
};

export const useJourneyStore = create<JourneyState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setIdNumber: (idNumber) => set({ idNumber }),
  setFullName: (fullName) => set({ fullName }),

  setMsisdn: (msisdn) => set({ msisdn }),
  setNewSim: (newSim) => set({ newSim }),
  setTransaction: (transaction) => set({ transaction }),
  setTargetNetwork: (targetNetwork) => set({ targetNetwork }),

  setValidation: (validation) => set({ validation }),
  setSelfieId: (selfieId) => set({ selfieId }),
  setLiveness: (liveness) => set({ liveness }),
  setDecision: (decision) => set({ decision }),
  setNotifications: (notifications) => set({ notifications }),
  setHistory: (history) => set({ history }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  record: (label, kind, detail) =>
    set((state) => ({
      entries: [...state.entries, stamp(label, kind, detail)],
    })),

  clearLedger: () => set({ entries: [] }),

  reset: () => set(initialState),
}));