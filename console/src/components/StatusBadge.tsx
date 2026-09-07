import { STATUS_STYLES, DOT_COLORS } from '@/lib/constants';

interface StatusBadgeProps {
  status: string;
  children?: React.ReactNode;
}

export function StatusBadge({ status, children }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.approved;
  const dot = DOT_COLORS[status] || DOT_COLORS.approved;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${style}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {children || status}
    </span>
  );
}
