import { useLiveEvents } from '@/hooks/useLiveEvents';

const LABEL: Record<string, { text: string; dot: string; tone: string }> = {
    connecting: {
        text: 'Connecting',
        dot: 'bg-gray-400',
        tone: 'text-gray-500',
    },
    live: {
        text: 'Live',
        dot: 'bg-green-500 animate-pulse',
        tone: 'text-green-700',
    },
    reconnecting: {
        text: 'Reconnecting',
        dot: 'bg-amber-500',
        tone: 'text-amber-700',
    },
};

/**
 * Mount once, in Layout. Owning the stream subscription here means one
 * connection per tab rather than one per route that wants live data.
 */
export function LiveIndicator() {
    const status = useLiveEvents();
    const config = LABEL[status];

    return (
        <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.tone}`}
            title={
                status === 'live'
                    ? 'Receiving events as the mobile journey emits them'
                    : 'Falling back to polling until the stream reconnects'
            }
        >
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
            {config.text}
        </span>
    );
}
