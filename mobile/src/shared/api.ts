// src/shared/api.ts
export type TransactionKind = 'sim_swap' | 'port_in' | 'new_activation';
export type DecisionStatus = 'approved' | 'rejected' | 'review';

export interface ValidationResponse {
    valid: boolean;
    id_number_length: number;
    failed_checks: string[];
}

export interface LivenessResponse {
    is_live: boolean;
    score: number;
    provider: string;
    detail?: string;
}

export interface VerificationCheck {
    label: string;
    status: 'pass' | 'fail' | 'info';
    detail?: string;
    score: number | null;
}

export interface VerificationDecision {
    status: DecisionStatus;
    checks: VerificationCheck[];
    method: string;
}

export interface NotificationRecord {
    channel: string;
    sent_at: string;
}

export interface AttemptRecord {
    timestamp: string;
    status: DecisionStatus;
    method: string;
}

export const CHECK_LABELS = ['ID Check', 'Face Match', 'Liveness Check'];

export const captureSelfie = async (_idNumber: string, _dataUrl: string) => ({
    selfie_id: `selfie_${Date.now()}`,
    content_type: 'image/jpeg'
});

export const checkLiveness = async (_selfieId: string): Promise<LivenessResponse> => ({
    is_live: true,
    score: 0.98,
    provider: 'MockProvider',
    detail: 'Passed liveness check'
});

export const getDeviceId = async () => 'mock_device_123';

export const getHistory = async (_idNumber: string): Promise<AttemptRecord[]> => ([]);

export const getNotifications = async (_idNumber: string): Promise<NotificationRecord[]> => ([]);

export const validateId = async (idNumber: string): Promise<ValidationResponse> => ({
    valid: true,
    id_number_length: idNumber.length,
    failed_checks: []
});

export const verifyIdentity = async (_payload: any): Promise<VerificationDecision> => ({
    status: 'approved',
    method: 'auto',
    checks: [
        { label: 'ID Check', status: 'pass', score: 100 },
        { label: 'Face Match', status: 'pass', score: 99 },
        { label: 'Liveness Check', status: 'pass', score: 98 }
    ]
});