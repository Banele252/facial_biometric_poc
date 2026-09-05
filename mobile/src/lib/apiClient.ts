// src/lib/apiClient.ts

import axios from 'axios';
import { http } from './http';

export interface ApiError {
    message: string;
    code: string;
    status: number;
}

class ApiClientError extends Error implements ApiError {
    code: string;
    status: number;

    constructor(
        message: string,
        code: string,
        status: number,
    ) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = 'ApiClientError';
    }
}

type FastApiValidationItem = {
    loc?: Array<string | number>;
    msg?: string;
    type?: string;
};

function extractApiMessage(data: unknown): string | null {
    if (!data) {
        return null;
    }

    if (typeof data === 'string') {
        return data;
    }

    if (typeof data !== 'object') {
        return null;
    }

    const body = data as Record<string, unknown>;

    if (typeof body.message === 'string') {
        return body.message;
    }

    if (typeof body.detail === 'string') {
        return body.detail;
    }

    if (Array.isArray(body.detail)) {
        return (body.detail as FastApiValidationItem[])
            .map((item) => {
                const field = item.loc
                    ?.filter((part) => part !== 'body')
                    .join('.');

                const message =
                    item.msg ?? 'Invalid value';

                return field
                    ? `${field}: ${message}`
                    : message;
            })
            .join('\n');
    }

    if (typeof body.error === 'string') {
        return body.error;
    }

    return null;
}

async function apiCall<T>(
    endpoint: string,
    options?: {
        method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        body?: unknown;
    },
): Promise<T> {
    try {
        const response = await http.request<T>({
            url: endpoint,
            method: options?.method ?? 'GET',
            data: options?.body,
            headers: options?.body
                ? {
                    'Content-Type': 'application/json',
                }
                : undefined,
        });

        return response.data;
    } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
            const message =
                extractApiMessage(err.response?.data) ??
                err.message ??
                `Request failed with status ${err.response?.status ?? 0}`;

            const body =
                typeof err.response?.data === 'object' &&
                err.response?.data !== null
                    ? (err.response.data as Record<string, unknown>)
                    : {};

            throw new ApiClientError(
                message,
                typeof body.code === 'string'
                    ? body.code
                    : 'UNKNOWN_ERROR',
                err.response?.status ?? 0,
            );
        }

        throw new ApiClientError(
            err instanceof Error
                ? err.message
                : 'Unknown error',
            'UNKNOWN_ERROR',
            0,
        );
    }
}

// -----------------------------------------------------------------------------
// Identity validation
// -----------------------------------------------------------------------------

export interface ValidateIdRequest {
    idNumber: string;
}

export interface ValidateIdResponse {
    id_number_length: number;
    valid: boolean;
    checks: Record<string, boolean>;
    failed_checks: string[];
}

// Kept temporarily because other screens may still reference the type.
// VerifyDetails should NOT call this endpoint in the current journey.
export interface VerifyIdentityRequest {
    idNumber: string;
    mode?: 'production' | 'sandbox';
}

export interface VerifyIdentityResponse {
    [key: string]: unknown;
}

// -----------------------------------------------------------------------------
// RICA
// -----------------------------------------------------------------------------

export interface CreateRicaRecordRequest {
    idNumber: string;
    fullName: string;
    msisdn: string;
    newSimNumber?: string | null;
}

export interface CreateRicaRecordResponse {
    id_number?: string;
    full_name?: string;
    msisdn?: string;
    new_sim_number?: string | null;

    status?: string;
    record?: {
        id_number: string;
        full_name: string;
        msisdn: string;
        new_sim_number?: string | null;
        updated_at?: string;
        operation?: string;
    };

    [key: string]: unknown;
}

// -----------------------------------------------------------------------------
// Biometrics
// -----------------------------------------------------------------------------

/**
 * Captured selfie.
 *
 * Important:
 *
 * idNumber = RSA identity number captured during VerifyDetailsScreen.
 * image    = real camera image as Base64/data URL.
 *
 * sessionId must NEVER be substituted for idNumber.
 */
export interface SelfieCaptureRequest {
    idNumber: string;
    image: string;
}

export interface SelfieCaptureResponse {
    selfie_id: string;
    content_type: string;
    size_bytes: number;
    liveness_status: string;
}

export interface LivenessRequest {
    selfieId: string;
    challengeType: 'blink' | 'turn_left' | 'turn_right' | 'smile';
    sessionId: string;
}

export interface LivenessResponse {
    selfie_id: string;
    is_live: boolean;
    score: number;
    provider: string;
    detail: string;
}

// -----------------------------------------------------------------------------
// ICCID
// -----------------------------------------------------------------------------

export interface IccidResolveRequest {
    iccid?: string;
    imageBase64?: string;
}

export interface IccidResolveResponse {
    iccid: string;
    raw: string;
    barcode_type: string;
    source: 'manual' | 'barcode_scan';
}

// -----------------------------------------------------------------------------
// SIM Swap
// -----------------------------------------------------------------------------

export interface SimSwapInitiateRequest {
    idNumber: string;
    msisdn: string;
    iccid: string;
    selfieId?: string | null;
}

export interface SimSwapInitiateResponse {
    order_id: string;
    status: string;
    reference: string;
    message: string;
}

// -----------------------------------------------------------------------------
// API client
// -----------------------------------------------------------------------------

export const apiClient = {
    // Step 2:
    // Validate RSA ID locally/backend rules only.
    validateId: (body: ValidateIdRequest) =>
        apiCall<ValidateIdResponse>(
            '/api/v1/validate-id',
            {
                method: 'POST',
                body: {
                    id_number: body.idNumber,
                },
            },
        ),

    // Legacy/direct verification API.
    // Current VerifyDetailsScreen should not call this.
    verifyIdentity: (body: VerifyIdentityRequest) =>
        apiCall<VerifyIdentityResponse>(
            '/api/v1/validate-id',
            {
                method: 'POST',
                body: {
                    id_number: body.idNumber,
                    mode: body.mode ?? 'sandbox',
                },
            },
        ),

    // Step 2:
    // Store ID + MSISDN for later RICA/SIM swap processing.
    createRicaRecord: (body: CreateRicaRecordRequest) =>
        apiCall<CreateRicaRecordResponse>(
            '/api/v1/rica/records',
            {
                method: 'POST',
                body: {
                    id_number: body.idNumber,
                    full_name: body.fullName,
                    msisdn: body.msisdn,
                    new_sim_number:
                        body.newSimNumber ?? null,
                },
            },
        ),

    // Step 3:
    // Resolve a replacement SIM ICCID from either manual input or a barcode image.
    resolveIccid: (body: IccidResolveRequest) =>
        apiCall<IccidResolveResponse>(
            '/api/v1/iccid/extract',
            {
                method: 'POST',
                body: {
                    ...(body.iccid
                        ? { iccid: body.iccid }
                        : {}),
                    ...(body.imageBase64
                        ? { image_base64: body.imageBase64 }
                        : {}),
                },
            },
        ),

    // Backward-compatible image-only alias.
    extractIccidFromImage: (body: { imageBase64: string }) =>
        apiCall<IccidResolveResponse>(
            '/api/v1/iccid/extract',
            {
                method: 'POST',
                body: {
                    image_base64: body.imageBase64,
                },
            },
        ),

    // Step 4:
    // Camera capture -> image -> /selfies.
    //
    // Backend contract:
    //
    // {
    //   "id_number": "...",
    //   "image": "data:image/jpeg;base64,..."
    // }
    captureSelfie: (body: SelfieCaptureRequest) =>
        apiCall<SelfieCaptureResponse>(
            '/api/v1/selfies',
            {
                method: 'POST',
                body: {
                    id_number: body.idNumber,
                    image: body.image,
                },
            },
        ),

    // Step 4:
    // Liveness check against the selfie reference
    // returned by captureSelfie().
    checkLiveness: (body: LivenessRequest) =>
        apiCall<LivenessResponse>(
            `/api/v1/selfies/${encodeURIComponent(body.selfieId)}/liveness`,
            {
                method: 'POST',
                body: {
                    challenge_type:
                    body.challengeType,
                    session_id:
                    body.sessionId,
                },
            },
        ),

    // SIM swap transaction.
    initiateSimSwap: (body: SimSwapInitiateRequest) =>
        apiCall<SimSwapInitiateResponse>(
            '/api/v1/sim-swap/initiate',
            {
                method: 'POST',
                body: {
                    id_number: body.idNumber,
                    msisdn: body.msisdn,
                    iccid: body.iccid,
                    selfie_id:
                        body.selfieId ?? null,
                },
            },
        ),
};