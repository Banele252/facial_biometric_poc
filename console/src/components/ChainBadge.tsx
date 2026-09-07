import { Link2, ShieldCheck, ShieldAlert, Unlink } from 'lucide-react';
import type { ChainStatus } from '@/lib/auditAdapter';

const CONFIG: Record<
    ChainStatus,
    { label: string; className: string; icon: JSX.Element; title: string }
> = {
    ok: {
        label: 'Linked',
        className: 'bg-green-50 text-green-700 border-green-200',
        icon: <ShieldCheck size={12} />,
        title: 'previous_hash matches the preceding entry',
    },
    start: {
        label: 'Chain start',
        className: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: <Link2 size={12} />,
        title: 'First entry of a batch — the device resets its chain after each successful flush',
    },
    broken: {
        label: 'Break',
        className: 'bg-red-50 text-red-700 border-red-200',
        icon: <ShieldAlert size={12} />,
        title: 'previous_hash does not match the preceding entry',
    },
    orphan: {
        label: 'Orphan',
        className: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: <Unlink size={12} />,
        title: 'Predecessor is outside the loaded window',
    },
};

export function ChainBadge({ status }: { status: ChainStatus }) {
    const config = CONFIG[status];

    return (
        <span
            title={config.title}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}
        >
            {config.icon}
            {config.label}
        </span>
    );
}
