// src/lib/eventStream.ts
//
// SSE client built on fetch + ReadableStream rather than the native
// EventSource.
//
// EventSource cannot set request headers. This API requires Authorization,
// X-Device-Fingerprint and X-Geo-Fence on every call (ZeroTrustMiddleware
// rejects requests without them), so EventSource cannot reach it. Moving
// the token to a query parameter would work and is the usual workaround --
// it also writes a live credential into every access and proxy log, so it
// is not done here.

import { env } from './env';
import { ACCESS_TOKEN_KEY, storageGet } from './http';

export interface StreamEvent {
    type: string;
    data: unknown;
}

export interface StreamOptions {
    onEvent: (event: StreamEvent) => void;
    onStatusChange?: (connected: boolean) => void;
    signal: AbortSignal;
}

/** Reconnect backoff: 1s, 2s, 4s, 8s, capped at 15s. */
function backoffMs(attempt: number): number {
    return Math.min(1000 * 2 ** attempt, 15000);
}

function deviceId(): string {
    return storageGet('console.deviceId') ?? 'console-unknown';
}

function randomId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return Math.random().toString(16).slice(2);
}

/**
 * Parse an SSE frame buffer. Frames are separated by a blank line; within
 * a frame, `event:` names it, `data:` carries the payload, and a leading
 * `:` marks a comment (used here for keepalives).
 */
function parseFrame(frame: string): StreamEvent | null {
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of frame.split('\n')) {
        if (!line || line.startsWith(':')) continue;

        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? '' : line.slice(colon + 1).trimStart();

        if (field === 'event') eventName = value;
        else if (field === 'data') dataLines.push(value);
    }

    if (dataLines.length === 0) return null;

    const raw = dataLines.join('\n');

    try {
        return { type: eventName, data: JSON.parse(raw) };
    } catch {
        return { type: eventName, data: raw };
    }
}

/**
 * Connect and keep reconnecting until the signal aborts.
 * Resolves only when aborted.
 */
export async function connectEventStream({
    onEvent,
    onStatusChange,
    signal,
}: StreamOptions): Promise<void> {
    let attempt = 0;

    while (!signal.aborted) {
        try {
            const token = storageGet(ACCESS_TOKEN_KEY);

            const response = await fetch(
                `${env.apiBaseUrl}${env.managementPath}/stream`,
                {
                    method: 'GET',
                    signal,
                    headers: {
                        Accept: 'text/event-stream',
                        'X-Correlation-Id': `console-${randomId()}`,
                        'X-Device-Fingerprint': deviceId(),
                        'X-Geo-Fence': env.geoFence,
                        ...(token
                            ? { Authorization: `Bearer ${token}` }
                            : {}),
                        ...(env.apiKey ? { 'X-API-Key': env.apiKey } : {}),
                    },
                },
            );

            if (!response.ok || !response.body) {
                throw new Error(`Stream returned ${response.status}`);
            }

            attempt = 0;
            onStatusChange?.(true);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Frames end with a blank line. Anything after the last
                // separator is a partial frame -- keep it buffered.
                const frames = buffer.split('\n\n');
                buffer = frames.pop() ?? '';

                for (const frame of frames) {
                    const parsed = parseFrame(frame);
                    if (parsed) onEvent(parsed);
                }
            }
        } catch (error) {
            if (signal.aborted) break;

            console.warn('[eventStream] disconnected:', error);
        }

        onStatusChange?.(false);

        if (signal.aborted) break;

        await new Promise((resolve) =>
            setTimeout(resolve, backoffMs(attempt++)),
        );
    }
}
