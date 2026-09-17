// src/lib/journeyState.ts

import {
    storageGet,
    storageRemove,
    storageSet,
} from './http';

export type IccidSource =
    | 'manual'
    | 'barcode';

const ICCID_KEY =
    'mtn.simswap.iccid';

const ICCID_SOURCE_KEY =
    'mtn.simswap.iccidSource';

export interface StoredIccid {
    iccid: string;
    source: IccidSource;
}

export async function storeIccid(
    iccid: string,
    source: IccidSource,
): Promise<void> {
    const normalized =
        iccid.replace(/\D/g, '');

    if (!normalized) {
        throw new Error(
            'Cannot store an empty ICCID.',
        );
    }

    await Promise.all([
        storageSet(
            ICCID_KEY,
            normalized,
        ),
        storageSet(
            ICCID_SOURCE_KEY,
            source,
        ),
    ]);
}

export async function getStoredIccid():
    Promise<StoredIccid | null> {
    const [
        iccid,
        source,
    ] = await Promise.all([
        storageGet(ICCID_KEY),
        storageGet(ICCID_SOURCE_KEY),
    ]);

    if (!iccid) {
        return null;
    }

    if (
        source !== 'manual' &&
        source !== 'barcode'
    ) {
        return null;
    }

    return {
        iccid,
        source,
    };
}

export async function clearStoredIccid():
    Promise<void> {
    await Promise.all([
        storageRemove(ICCID_KEY),
        storageRemove(ICCID_SOURCE_KEY),
    ]);
}
// -----------------------------------------------------------------------------
// Consent
// -----------------------------------------------------------------------------

const CONSENT_VERSION_KEY =
    'mtn.simswap.consentVersion';

const CONSENT_CAPTURED_AT_KEY =
    'mtn.simswap.consentCapturedAt';

/**
 * The version of the consent text shown on ConsentScreen.
 *
 * Bump this whenever that wording changes: the platform records what the
 * customer agreed to, and a stale version string would attribute the new
 * text to a consent given against the old one.
 */
export const CONSENT_TEXT_VERSION = 'mtn-za.sim-swap.consent.v1';

export interface StoredConsent {
    textVersion: string;
    capturedAt: string;
}

/**
 * Record that the customer granted consent, and when.
 *
 * The platform denies a SIM swap outright without this, and the timestamp is
 * evidence rather than decoration - it has to be the moment the box was
 * ticked, not the moment the order was submitted.
 */
export async function storeConsent(
    textVersion = CONSENT_TEXT_VERSION,
    capturedAt = new Date().toISOString(),
): Promise<StoredConsent> {
    await Promise.all([
        storageSet(
            CONSENT_VERSION_KEY,
            textVersion,
        ),
        storageSet(
            CONSENT_CAPTURED_AT_KEY,
            capturedAt,
        ),
    ]);

    return { textVersion, capturedAt };
}

export async function getStoredConsent():
    Promise<StoredConsent | null> {
    const [
        textVersion,
        capturedAt,
    ] = await Promise.all([
        storageGet(CONSENT_VERSION_KEY),
        storageGet(CONSENT_CAPTURED_AT_KEY),
    ]);

    if (!textVersion || !capturedAt) {
        return null;
    }

    return { textVersion, capturedAt };
}

export async function clearStoredConsent():
    Promise<void> {
    await Promise.all([
        storageRemove(CONSENT_VERSION_KEY),
        storageRemove(CONSENT_CAPTURED_AT_KEY),
    ]);
}
