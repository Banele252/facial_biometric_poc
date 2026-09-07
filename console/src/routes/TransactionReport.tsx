import { useTransactions } from '@/hooks/useTransactions';
import { KpiCard } from '@/components/KpiCard';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';
import { getApiErrorMessage } from '@/lib/http';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function TransactionReport() {
  const { data, isLoading, isError, error, refetch } = useTransactions();

  if (isError) {
    return (
      <div className="p-8">
        <ErrorState message={getApiErrorMessage(error)} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !data) {
    return <div className="p-8 text-center text-gray-500">Loading transactions...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Transaction Report</h1>
          <p className="text-sm text-gray-500 mt-1">
            SIM-swap orders processed by the application, gated by verification and fraud decisions.
          </p>
        </div>
        <div className="text-sm text-gray-500">Signed in as banelemdluli25@gmail.com</div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="Total transactions" value={data.total} dotColor="bg-gray-400" />
        <KpiCard label="Approved" value={data.approved} dotColor="bg-green-500" />
        <KpiCard label="Flagged" value={data.flagged} dotColor="bg-red-500" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Transaction volume, last 12 days</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.volume} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
            <Bar dataKey="approved" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
            <Bar dataKey="flagged" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
            <Bar dataKey="pending" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-center gap-4 mt-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-green-500" /> Approved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-500" /> Flagged
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500" /> Pending
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">ID</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">MSISDN</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Identity ref</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Verification</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Fraud decision</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Risk score</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Timestamp</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.orders.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 text-gray-700">{row.id}</td>
                <td className="px-5 py-3 text-gray-700">{row.msisdn}</td>
                <td className="px-5 py-3 text-gray-700">{row.identityRef}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={row.verification}>{row.verification}</StatusBadge>
                </td>
                <td className="px-5 py-3 text-gray-700">{row.fraudDecision}</td>
                <td className="px-5 py-3 text-gray-700">{row.riskScore}</td>
                <td className="px-5 py-3 text-gray-500">{row.timestamp}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={row.outcome}>{row.outcome}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
