import { useFraudStats } from '@/hooks/useFraudStats';
import { KpiCard } from '@/components/KpiCard';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/ErrorState';
import { getApiErrorMessage } from '@/lib/http';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function FraudIntelligence() {
  const { data, isLoading, isError, error, refetch } = useFraudStats();

  if (isError) {
    return (
      <div className="p-8">
        <ErrorState message={getApiErrorMessage(error)} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !data) {
    return <div className="p-8 text-center text-gray-500">Loading fraud intelligence...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Fraud Intelligence Repo</h1>
          <p className="text-sm text-gray-500 mt-1">
            Device risk, watchlist, and velocity signals composed into a single fraud decision per request.
          </p>
        </div>
        <div className="text-sm text-gray-500">Signed in as banelemdluli25@gmail.com</div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="Approved" value={data.approved} dotColor="bg-green-500" />
        <KpiCard label="Review" value={data.review} dotColor="bg-amber-500" />
        <KpiCard label="Rejected" value={data.rejected} dotColor="bg-red-500" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Average risk score, last 14 days</h3>
        <div className="flex items-center gap-4 mb-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" /> Low (0–39)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Medium (40–69)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" /> High (70–100)
          </span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data.riskTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 12, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#111827"
              strokeWidth={2}
              fill="url(#riskGradient)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Identity ref</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">MSISDN</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Outcome</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Decision</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Risk score</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Reasons</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.identities.map((row) => (
              <tr key={row.identityRef} className="hover:bg-gray-50">
                <td className="px-5 py-3 text-gray-700">{row.identityRef}</td>
                <td className="px-5 py-3 text-gray-700">{row.msisdn}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={row.outcome}>{row.outcome}</StatusBadge>
                </td>
                <td className="px-5 py-3 text-gray-700">{row.decision}</td>
                <td className="px-5 py-3 text-gray-700">{row.riskScore}</td>
                <td className="px-5 py-3 text-gray-500">{row.reasons}</td>
                <td className="px-5 py-3 text-gray-500">{row.timestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
