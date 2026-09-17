export const ROUTES = [
  { id: 'audit-logs', label: 'Audit Logs', path: '/audit-logs', icon: 'ClipboardList' },
  { id: 'fraud-intelligence', label: 'Fraud Intelligence Repo', path: '/fraud-intelligence', icon: 'ShieldAlert' },
  { id: 'transactions', label: 'Transaction Report', path: '/transactions', icon: 'BarChart3' },
  { id: 'chatbot', label: 'System Chatbot', path: '/chatbot', icon: 'MessageSquare' },
] as const;

export const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  review: 'bg-amber-50 text-amber-700 border-amber-200',
  pending: 'bg-orange-50 text-orange-700 border-orange-200',
  flagged: 'bg-red-50 text-red-700 border-red-200',
  prod: 'bg-gray-100 text-gray-700 border-gray-200',
  staging: 'bg-blue-50 text-blue-700 border-blue-200',
  dev: 'bg-purple-50 text-purple-700 border-purple-200',
  ACCEPTED: 'bg-green-50 text-green-700 border-green-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  // Audit outcomes emitted by the mobile AuditService.
  success: 'bg-green-50 text-green-700 border-green-200',
  failure: 'bg-red-50 text-red-700 border-red-200',
  blocked: 'bg-red-50 text-red-700 border-red-200',
};

export const DOT_COLORS: Record<string, string> = {
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
  review: 'bg-amber-500',
  pending: 'bg-orange-500',
  flagged: 'bg-red-500',
  ACCEPTED: 'bg-green-500',
  REJECTED: 'bg-red-500',
  success: 'bg-green-500',
  failure: 'bg-red-500',
  blocked: 'bg-red-500',
};
