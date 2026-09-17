import { useEffect, useState, type ReactNode } from 'react';
import { bootstrapAuth } from '@/lib/auth';
import { getApiErrorMessage } from '@/lib/http';

type State = 'authenticating' | 'ready' | 'failed';

/**
 * Obtains a token before any data query runs. Without this the first
 * management call fires unauthenticated, 401s, and triggers a retry storm.
 */
export function AuthGate({ children }: { children: ReactNode }) {
    const [state, setState] = useState<State>('authenticating');
    const [message, setMessage] = useState('');

    useEffect(() => {
        let cancelled = false;

        bootstrapAuth()
            .then(() => {
                if (!cancelled) setState('ready');
            })
            .catch((error) => {
                if (cancelled) return;
                setMessage(getApiErrorMessage(error));
                setState('failed');
            });

        return () => {
            cancelled = true;
        };
    }, []);

    if (state === 'authenticating') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-mtn-cream">
                <div className="text-sm text-gray-500">
                    Authenticating with the platform…
                </div>
            </div>
        );
    }

    if (state === 'failed') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-mtn-cream p-8">
                <div className="max-w-md bg-white rounded-xl border border-red-100 shadow-sm p-6">
                    <h1 className="text-base font-semibold text-gray-900">
                        Could not sign in to the platform
                    </h1>
                    <p className="text-sm text-gray-600 mt-2">{message}</p>
                    <p className="text-xs text-gray-500 mt-4">
                        Check VITE_API_BASE_URL, the console service-account
                        credentials, and that the API is reachable from this
                        origin.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-5 px-4 py-2 rounded-lg bg-mtn-yellow hover:bg-mtn-yellow-hover text-gray-900 text-sm font-medium"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
