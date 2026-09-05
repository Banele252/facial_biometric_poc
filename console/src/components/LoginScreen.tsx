import { useState, type FormEvent } from 'react';
import { LogIn, AlertCircle } from 'lucide-react';
import { login } from '@/lib/auth';
import { getApiErrorMessage } from '@/lib/http';

interface LoginScreenProps {
    onSuccess: () => void;
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();

        if (!username || !password || busy) return;

        setBusy(true);
        setError('');

        try {
            await login(username, password);
            onSuccess();
        } catch (err) {
            // Deliberately not distinguishing "no such user" from "wrong
            // password" — that difference tells an attacker which
            // usernames are real.
            setError(getApiErrorMessage(err));
            setPassword('');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-mtn-cream p-8">
            <div className="w-full max-w-sm">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-mtn-yellow rounded-lg flex items-center justify-center text-gray-900 font-bold">
                        M
                    </div>
                    <div>
                        <div className="font-semibold text-gray-900">
                            MTN Console
                        </div>
                        <div className="text-xs text-gray-500">
                            Management Dashboard
                        </div>
                    </div>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm p-6"
                >
                    <h1 className="text-lg font-semibold text-gray-900">
                        Sign in
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 mb-5">
                        Use your operator account.
                    </p>

                    <label className="block text-xs font-medium text-gray-700 mb-1">
                        Username
                    </label>
                    <input
                        type="text"
                        autoComplete="username"
                        autoFocus
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full px-3 py-2 mb-4 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-mtn-yellow"
                    />

                    <label className="block text-xs font-medium text-gray-700 mb-1">
                        Password
                    </label>
                    <input
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-mtn-yellow"
                    />

                    {error && (
                        <div className="mt-4 flex items-start gap-2 text-sm text-red-700">
                            <AlertCircle
                                size={16}
                                className="shrink-0 mt-0.5"
                            />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={busy || !username || !password}
                        className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-mtn-yellow hover:bg-mtn-yellow-hover disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 text-sm font-medium"
                    >
                        <LogIn size={16} />
                        {busy ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>

                <p className="text-xs text-gray-400 mt-4 text-center">
                    Actions in this console are recorded against your account.
                </p>
            </div>
        </div>
    );
}
