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

/** One entry of an RFC 7807 problem's `errors` array. */
type ProblemValidationError = {
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

    // A platform validation failure carries the offending fields in
    // `errors`, and its `detail` is the constant "One or more fields failed
    // validation." - true of every 422 and useless on its own. Naming the
    // fields is the difference between a bug report and a guess.
    if (Array.isArray(body.errors) && body.errors.length > 0) {
        const fields = (body.errors as ProblemValidationError[])
            .map((item) => {
                const field = Array.isArray(item.loc)
                    ? item.loc
                        .filter((part) => part !== 'body')
                        .join('.')
                    : '';

                const message =
                    item.msg ?? 'is invalid';

                return field
                    ? `${field}: ${message}`
                    : message;
            })
            .join('\n');

        if (fields) {
            return fields;
        }
    }

    // The platform answers errors as RFC 7807 problem details, where the
    // human-readable summary is `title`. Without this every 4xx read as
    // "Request failed with status N".
    if (typeof body.title === 'string') {
        return body.title;
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
        headers?: Record<string, string>;
    },
): Promise<T> {
    try {
        const response = await http.request<T>({
            url: endpoint,
            method: options?.method ?? 'GET',
            data: options?.body,
            headers: {
                ...(options?.body
                    ? { 'Content-Type': 'application/json' }
                    : {}),
                ...(options?.headers ?? {}),
            },
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

export interface FaceMatchRequest {
    selfieId: string;
    idNumber: string;
}

export interface FaceMatchResponse {
    selfie_id: string;
    matched: boolean;
    status: string;
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
// Verification journey
// -----------------------------------------------------------------------------

export interface VerificationCheck {
    name: string;
    label: string;
    /** 'pass' | 'fail' | 'review' | 'skipped' */
    status: string;
    detail: string;
    score?: number | null;
}

export interface VerificationJourneyRequest {
    idNumber: string;
    fullName?: string;
    msisdn?: string;
    /** The replacement SIM's ICCID. */
    newSimNumber?: string;
    selfieId: string;
    /** Device and consent evidence the rule packs score. */
    deviceFingerprint: string;
    devicePlatform: DevicePlatform;
    deviceAttested?: boolean;
    deviceCompromised?: boolean;
    consentTextVersion: string;
    consentCapturedAt: string;
    idempotencyKey: string;
}

export interface VerificationJourneyResponse {
    attempt_id: string;
    id_number: string;
    /** 'approved' | 'rejected' | 'review' */
    status: string;
    method: string;
    reason: string;
    provider_status?: string | null;
    notification_type: string;
    match_score?: number | null;
    mode?: string | null;
    checks: VerificationCheck[];
    order_id?: string | null;
    reference?: string | null;
}

/**
 * The platform's order status, mapped to the decision the journey shows.
 *
 * `pending_verification` is an acceptance, not a completed swap: the order
 * passed every gate and is queued for fulfilment. The PoC's orchestrator
 * activated the swap in the same call, so the review screen treated its
 * success as final - this build must not claim more than the platform did.
 */
const DECISION_BY_ORDER_STATUS: Record<string, 'approved' | 'review' | 'rejected'> = {
    pending_verification: 'approved',
    in_review: 'review',
    denied: 'rejected',
};

// -----------------------------------------------------------------------------
// SIM Swap
// -----------------------------------------------------------------------------

export type DevicePlatform = 'android' | 'ios' | 'web';

export interface SimSwapInitiateRequest {
    idNumber: string;
    msisdn: string;
    iccid: string;
    selfieId?: string | null;

    /** At least 16 characters; the platform rejects anything shorter. */
    deviceFingerprint: string;
    devicePlatform: DevicePlatform;
    /** Play Integrity / DeviceCheck attestation. Unattested orders are
     *  referred for review by DT.PLATFORM.003 rather than accepted. */
    deviceAttested?: boolean;
    deviceCompromised?: boolean;

    /** The consent text the customer actually agreed to, and when. */
    consentTextVersion: string;
    consentCapturedAt: string;

    /** Client-generated, stable across retries of the same request. */
    idempotencyKey: string;
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
    // Local RSA ID rules plus, when the identity provider is configured, the
    // authoritative Home Affairs record.
    validateId: (body: ValidateIdRequest) =>
        apiCall<ValidateIdResponse>(
            '/v1/validate-id',
            {
                method: 'POST',
                body: {
                    id_number: body.idNumber,
                },
            },
        ),

    // Legacy alias. The platform has one validation endpoint and it takes no
    // `mode` - the provider is chosen by server configuration, not by the
    // handset.
    verifyIdentity: (body: VerifyIdentityRequest) =>
        apiCall<VerifyIdentityResponse>(
            '/v1/validate-id',
            {
                method: 'POST',
                body: {
                    id_number: body.idNumber,
                },
            },
        ),

    // Step 2:
    // Store ID + MSISDN for later RICA/SIM swap processing.
    createRicaRecord: (body: CreateRicaRecordRequest) =>
        apiCall<CreateRicaRecordResponse>(
            '/v1/rica/records',
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
    // Resolve a replacement SIM ICCID from either manual input or a barcode
    // image. The platform requires exactly one of the two.
    resolveIccid: (body: IccidResolveRequest) =>
        apiCall<IccidResolveResponse>(
            '/v1/iccid/extract',
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
            '/v1/iccid/extract',
            {
                method: 'POST',
                body: {
                    image_base64: body.imageBase64,
                },
            },
        ),

    // Step 4:
    // Camera capture -> image -> /v1/selfies.
    captureSelfie: (body: SelfieCaptureRequest) =>
        apiCall<SelfieCaptureResponse>(
            '/v1/selfies',
            {
                method: 'POST',
                body: {
                    id_number: body.idNumber,
                    image: body.image,
                },
            },
        ),

    // Step 4:
    // Liveness check against the selfie reference returned by captureSelfie().
    checkLiveness: (body: LivenessRequest) =>
        apiCall<LivenessResponse>(
            `/v1/selfies/${encodeURIComponent(body.selfieId)}/liveness`,
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

    // Step 5:
    // Compare the captured selfie against the Home Affairs reference photo.
    // This is a separate call on the platform; the PoC folded it into its
    // `/verifications` orchestrator.
    matchFace: (body: FaceMatchRequest) =>
        apiCall<FaceMatchResponse>(
            `/v1/selfies/${encodeURIComponent(body.selfieId)}/match`,
            {
                method: 'POST',
                body: {
                    id_number: body.idNumber,
                },
            },
        ),

    // Step 5 (ReviewScreen):
    // Raise the SIM swap.
    //
    // This is not the thin order insert the PoC's endpoint of the same name
    // was. The platform's service runs the identity precheck and the signed
    // rule packs (za.fic-rica.identity, za.icasa.sim-swap and the OpCo pack),
    // persists the order, and extends the tenant's audit chain. The returned
    // `status` is the decision, so a 202 can still be a refusal.
    //
    // The consent and device evidence is required: the platform defaults deny
    // outright without consent, and the packs score the device signals. The
    // Idempotency-Key is the caller's, because raising a swap is not safe to
    // repeat - retrying with the same key returns the same order rather than
    // creating a second one.
    initiateSimSwap: (body: SimSwapInitiateRequest) =>
        apiCall<SimSwapInitiateResponse>(
            '/v1/sim-swap/initiate',
            {
                method: 'POST',
                body: {
                    id_number: body.idNumber,
                    msisdn: body.msisdn,
                    iccid: body.iccid,
                    selfie_id:
                        body.selfieId ?? null,
                    consent: {
                        granted: true,
                        text_version:
                        body.consentTextVersion,
                        captured_at:
                        body.consentCapturedAt,
                    },
                    device: {
                        fingerprint:
                        body.deviceFingerprint,
                        platform:
                        body.devicePlatform,
                        attested:
                            body.deviceAttested ?? false,
                        rooted_or_jailbroken:
                            body.deviceCompromised ?? false,
                    },
                    channel: 'app',
                },
                headers: {
                    'Idempotency-Key':
                    body.idempotencyKey,
                },
            },
        ),

    // Step 5 (ReviewScreen):
    // The decision chain, as the platform composes it.
    //
    // The PoC had one server-side orchestrator at POST /api/v1/verifications
    // that ran every check and returned a single decision. The platform has
    // no such endpoint: face match is its own call, and the fraud and
    // regulatory rules run inside the SIM swap service. This runs the two
    // remaining steps in order and reports them in the shape the review
    // screen already consumes, so a refusal at either point is a decision the
    // caller can branch on rather than an exception.
    runVerificationJourney: async (
        body: VerificationJourneyRequest,
    ): Promise<VerificationJourneyResponse> => {
        const checks: VerificationCheck[] = [];

        let match: FaceMatchResponse;

        try {
            match = await apiClient.matchFace({
                selfieId: body.selfieId,
                idNumber: body.idNumber,
            });
        } catch (err: unknown) {
            const status =
                err instanceof ApiClientError
                    ? err.status
                    : 0;

            // 409: no Home Affairs reference photo was retained, because the
            // identity provider is not configured or returned none.
            // 503: no face-match provider at all.
            //
            // Either way the biometric gate did not run, which is not the
            // same as it passing. Raising the swap anyway would put an order
            // through with the one check that makes it a *biometric* trust
            // decision silently absent, so the journey stops here and says
            // so - it does not fall through to the order.
            if (status === 409 || status === 503) {
                const detail =
                    err instanceof Error
                        ? err.message
                        : 'Face verification is unavailable.';

                return {
                    attempt_id: body.selfieId,
                    id_number: body.idNumber,
                    status: 'review',
                    method: 'unavailable',
                    reason: detail,
                    provider_status: null,
                    notification_type: 'sim_swap_review',
                    match_score: null,
                    mode: null,
                    checks: [
                        {
                            name: 'face_match',
                            label: 'Face match',
                            status: 'skipped',
                            detail,
                            score: null,
                        },
                    ],
                    order_id: null,
                };
            }

            throw err;
        }

        checks.push({
            name: 'face_match',
            label: 'Face match',
            status: match.matched
                ? 'pass'
                : 'fail',
            detail: match.detail,
            score: match.score,
        });

        if (!match.matched) {
            return {
                attempt_id: body.selfieId,
                id_number: body.idNumber,
                status: 'rejected',
                method: match.provider,
                reason: match.detail,
                provider_status: match.status,
                notification_type: 'sim_swap_rejected',
                match_score: match.score,
                mode: null,
                checks,
                order_id: null,
            };
        }

        if (!body.msisdn || !body.newSimNumber) {
            // Guarded rather than defaulted: a swap raised without the
            // customer's own number or the replacement SIM would be an order
            // against the wrong line.
            throw new Error(
                'Mobile number and replacement SIM are required to raise a SIM swap.',
            );
        }

        const order = await apiClient.initiateSimSwap({
            idNumber: body.idNumber,
            msisdn: body.msisdn,
            iccid: body.newSimNumber,
            selfieId: body.selfieId,
            deviceFingerprint: body.deviceFingerprint,
            devicePlatform: body.devicePlatform,
            deviceAttested: body.deviceAttested,
            deviceCompromised: body.deviceCompromised,
            consentTextVersion: body.consentTextVersion,
            consentCapturedAt: body.consentCapturedAt,
            idempotencyKey: body.idempotencyKey,
        });

        const decision =
            DECISION_BY_ORDER_STATUS[order.status] ??
            'review';

        checks.push({
            name: 'sim_swap_decision',
            label: 'Fraud and regulatory checks',
            status:
                decision === 'approved'
                    ? 'pass'
                    : decision === 'review'
                        ? 'review'
                        : 'fail',
            detail: order.message,
            score: null,
        });

        return {
            attempt_id: order.order_id,
            id_number: body.idNumber,
            status: decision,
            method: match.provider,
            reason: order.message,
            provider_status: order.status,
            notification_type:
                decision === 'approved'
                    ? 'sim_swap_accepted'
                    : 'sim_swap_rejected',
            match_score: match.score,
            mode: null,
            checks,
            order_id: order.order_id,
            reference: order.reference,
        };
    },
};
