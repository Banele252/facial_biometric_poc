import { Fragment, useMemo, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { useAuditLogs } from '@/hooks/useAuditLogs';
import { StatusBadge } from '@/components/StatusBadge';
import { ChainBadge } from '@/components/ChainBadge';
import { ErrorState } from '@/components/ErrorState';
import { getApiErrorMessage } from '@/lib/http';
import {
    formatTimestamp,
    maskMsisdn,
    shortHash,
    humaniseEvent,
} from '@/lib/auditAdapter';
import type { AuditOutcome } from '@/types/audit';

const ALL_EVENTS = 'All events';
const ALL_OUTCOMES = 'All outcomes';

export default function AuditLogs() {
    const [search, setSearch] = useState('');
    const [eventFilter, setEventFilter] = useState(ALL_EVENTS);
    const [outcomeFilter, setOutcomeFilter] = useState(ALL_OUTCOMES);
    const [expanded, setExpanded] = useState<string | null>(null);

    // Outcome is filtered server-side (it is an indexed column); free-text
    // search stays client-side over the loaded window.
    const { data, isLoading, isFetching, isError, error, refetch } =
        useAuditLogs({
            outcome:
                outcomeFilter === ALL_OUTCOMES
                    ? undefined
                    : (outcomeFilter as AuditOutcome),
        });

    const rows = data?.rows ?? [];

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return rows.filter((row) => {
            const matchesEvent =
                eventFilter === ALL_EVENTS || row.eventType === eventFilter;

            if (!matchesEvent) return false;
            if (!q) return true;

            return (
                row.process.toLowerCase().includes(q) ||
                row.sessionId.toLowerCase().includes(q) ||
                row.deviceId.toLowerCase().includes(q) ||
                (row.msisdn ?? '').includes(q) ||
                (row.screen ?? '').toLowerCase().includes(q) ||
                (row.reason ?? '').toLowerCase().includes(q) ||
                JSON.stringify(row.payload).toLowerCase().includes(q)
            );
        });
    }, [rows, search, eventFilter]);

    const eventTypes = useMemo(
        () => Array.from(new Set(rows.map((row) => row.eventType))).sort(),
        [rows],
    );

    const breaks = filtered.filter((row) => row.chain === 'broken').length;

    return (
        <div className="p-8">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">
                        Audit Logs
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Tamper-evident event stream emitted by the mobile SIM-swap
                        journey.
                    </p>
                </div>
                <button
                    onClick={() => refetch()}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"
                >
                    <RefreshCw
                        size={14}
                        className={isFetching ? 'animate-spin' : undefined}
                    />
                    Refresh
                </button>
            </div>

            {breaks > 0 && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                    {breaks} {breaks === 1 ? 'entry has' : 'entries have'} a hash
                    chain break in the loaded window. Investigate before treating
                    this trail as evidential.
                </div>
            )}

            <div className="flex gap-3 mb-6">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by session, device, screen, MSISDN, or metadata..."
                        className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-mtn-yellow bg-white"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select
                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-700"
                    value={eventFilter}
                    onChange={(e) => setEventFilter(e.target.value)}
                >
                    <option>{ALL_EVENTS}</option>
                    {eventTypes.map((type) => (
                        <option key={type} value={type}>
                            {humaniseEvent(type)}
                        </option>
                    ))}
                </select>
                <select
                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-700"
                    value={outcomeFilter}
                    onChange={(e) => setOutcomeFilter(e.target.value)}
                >
                    <option>{ALL_OUTCOMES}</option>
                    <option value="success">Success</option>
                    <option value="failure">Failure</option>
                    <option value="blocked">Blocked</option>
                    <option value="pending">Pending</option>
                </select>
            </div>

            {isError ? (
                <ErrorState
                    message={getApiErrorMessage(error)}
                    onRetry={() => refetch()}
                />
            ) : isLoading ? (
                <div className="text-center py-20 text-gray-500">
                    Loading audit logs...
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                    No audit events match these filters.
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-left">
                                {[
                                    'Timestamp',
                                    'Event',
                                    'Screen',
                                    'Outcome',
                                    'MSISDN',
                                    'Session',
                                    'Chain',
                                ].map((heading) => (
                                    <th
                                        key={heading}
                                        className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider"
                                    >
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.map((row) => (
                                <Fragment key={row.id}>
                                    <tr
                                        onClick={() =>
                                            setExpanded(
                                                expanded === row.id
                                                    ? null
                                                    : row.id,
                                            )
                                        }
                                        className="hover:bg-gray-50 cursor-pointer"
                                    >
                                        <td className="px-5 py-3 text-gray-700 whitespace-nowrap">
                                            {formatTimestamp(row.timestamp)}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                                                {row.process}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-600">
                                            {row.screen ?? '—'}
                                        </td>
                                        <td className="px-5 py-3">
                                            {row.outcome ? (
                                                <StatusBadge
                                                    status={row.outcome}
                                                >
                                                    {row.outcome}
                                                </StatusBadge>
                                            ) : (
                                                <span className="text-gray-400">
                                                    —
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-gray-600 font-mono text-xs">
                                            {maskMsisdn(row.msisdn)}
                                        </td>
                                        <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                                            {row.sessionId.slice(0, 8)}
                                        </td>
                                        <td className="px-5 py-3">
                                            <ChainBadge status={row.chain} />
                                        </td>
                                    </tr>

                                    {expanded === row.id && (
                                        <tr className="bg-gray-50">
                                            <td colSpan={7} className="px-5 py-4">
                                                <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs mb-3">
                                                    <div className="flex gap-2">
                                                        <dt className="text-gray-500">
                                                            Event ID
                                                        </dt>
                                                        <dd className="font-mono text-gray-700">
                                                            {row.id}
                                                        </dd>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <dt className="text-gray-500">
                                                            Device
                                                        </dt>
                                                        <dd className="font-mono text-gray-700">
                                                            {row.deviceId}
                                                        </dd>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <dt className="text-gray-500">
                                                            Hash
                                                        </dt>
                                                        <dd className="font-mono text-gray-700">
                                                            {shortHash(
                                                                row.integrityHash,
                                                            )}
                                                        </dd>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <dt className="text-gray-500">
                                                            Previous
                                                        </dt>
                                                        <dd className="font-mono text-gray-700">
                                                            {shortHash(
                                                                row.previousHash,
                                                            )}
                                                        </dd>
                                                    </div>
                                                    {row.receivedAt && (
                                                        <div className="flex gap-2">
                                                            <dt className="text-gray-500">
                                                                Received
                                                            </dt>
                                                            <dd className="text-gray-700">
                                                                {formatTimestamp(
                                                                    row.receivedAt,
                                                                )}
                                                            </dd>
                                                        </div>
                                                    )}
                                                    {row.reason && (
                                                        <div className="flex gap-2">
                                                            <dt className="text-gray-500">
                                                                Reason
                                                            </dt>
                                                            <dd className="text-gray-700">
                                                                {row.reason}
                                                            </dd>
                                                        </div>
                                                    )}
                                                </dl>
                                                <pre className="text-xs font-mono text-gray-600 bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto">
                                                    {JSON.stringify(
                                                        row.payload,
                                                        null,
                                                        2,
                                                    )}
                                                </pre>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
