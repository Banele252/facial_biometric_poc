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