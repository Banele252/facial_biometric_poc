import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
    message: string;
    onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
    return (
        <div className="bg-white rounded-xl border border-red-100 shadow-sm p-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
                <div className="text-sm font-medium text-gray-900">
                    Could not load this data
                </div>
                <p className="text-sm text-gray-600 mt-1">{message}</p>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="mt-3 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Try again
                    </button>
                )}
            </div>
        </div>
    );
}
