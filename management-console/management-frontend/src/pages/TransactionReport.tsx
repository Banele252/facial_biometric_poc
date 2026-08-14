import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './pages.css'
import { Card } from '../components/ui/Card'
import { StatTile } from '../components/ui/StatTile'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Table, type TableColumn } from '../components/ui/Table'
import { Select } from '../components/ui/Input'
import {
  getTransactions,
  getTransactionStatusSummary,
  getTransactionVolumeByDay,
  type Transaction,
  type TransactionStatusCount,
  type TransactionVolumeRow,
} from '../api'
import { ChartColors } from '../theme/chartColors'
import { formatDate } from '../utils/date'

const STATUS_TONE: Record<string, BadgeTone> = {
  approved: 'approved',
  completed: 'approved',
  activated: 'approved',
  pending: 'review',
  review: 'review',
  rejected: 'rejected',
  flagged: 'flagged',
}
const STATUS_DOT: Record<string, string> = {
  approved: ChartColors.outcome.approved,
  completed: ChartColors.outcome.approved,
  activated: ChartColors.outcome.approved,
  pending: ChartColors.outcome.review,
  review: ChartColors.outcome.review,
  rejected: ChartColors.outcome.rejected,
  flagged: ChartColors.outcome.rejected,
}
const statusTone = (status: string): BadgeTone => STATUS_TONE[status.toLowerCase()] ?? 'neutral'
const statusColor = (status: string) => STATUS_DOT[status.toLowerCase()] ?? ChartColors.volumeBar

export function TransactionReport() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [statusSummary, setStatusSummary] = useState<TransactionStatusCount[]>([])
  const [volumeRows, setVolumeRows] = useState<TransactionVolumeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    Promise.all([getTransactionStatusSummary(), getTransactionVolumeByDay(14)])
      .then(([statusRes, volumeRes]) => {
        if (ignore) return
        setStatusSummary(statusRes.statuses)
        setVolumeRows(volumeRes.days)
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load transaction overview')
      })
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError(null)
    getTransactions({
      status: statusFilter === 'all' ? undefined : statusFilter,
      transaction_kind: kindFilter === 'all' ? undefined : kindFilter,
      limit: 100,
    })
      .then((res) => {
        if (!ignore) {
          setTransactions(res.items)
          setTotal(res.total)
        }
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load transactions')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [statusFilter, kindFilter])

  const { chartData, statuses } = useMemo(() => {
    const statusSet = Array.from(new Set(volumeRows.map((r) => r.status)))
    const byDay = new Map<string, { date: string; [status: string]: string | number }>()
    for (const row of volumeRows) {
      const entry = byDay.get(row.day) ?? { date: row.day }
      entry[row.status] = row.count
      byDay.set(row.day, entry)
    }
    const data = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date))
    return { chartData: data, statuses: statusSet }
  }, [volumeRows])

  const kinds = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.transaction_kind))).sort(),
    [transactions],
  )

  const columns: TableColumn<Transaction>[] = [
    { key: 'id', header: 'ID', render: (row) => row.id },
    { key: 'msisdn', header: 'MSISDN', render: (row) => row.msisdn },
    { key: 'id_number', header: 'ID number', render: (row) => row.id_number },
    { key: 'transaction_kind', header: 'Kind', render: (row) => row.transaction_kind },
    { key: 'sim_serial', header: 'SIM serial', render: (row) => row.sim_serial },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge> },
    { key: 'reason', header: 'Reason', render: (row) => row.reason },
    { key: 'created_at', header: 'Timestamp', render: (row) => formatDate(row.created_at) },
  ]

  return (
    <div className="page">
      <p className="page__subtitle">Transactions processed across the application.</p>

      <div className="stat-grid">
        <StatTile label="Total transactions" value={total} />
        {statusSummary.map((s) => (
          <StatTile key={s.status} label={s.status} value={s.count} dotColor={statusColor(s.status)} />
        ))}
      </div>

      <Card className="chart-card">
        <h2 className="chart-card__title">Transaction volume, last 14 days</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={ChartColors.grid} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} stroke={ChartColors.axisText} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke={ChartColors.axisText} fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              labelFormatter={(value) => formatDate(String(value))}
              contentStyle={{ borderRadius: 10, border: `1px solid ${ChartColors.grid}`, fontSize: 12 }}
            />
            <Legend />
            {statuses.map((status, i) => (
              <Bar
                key={status}
                dataKey={status}
                stackId="volume"
                fill={statusColor(status)}
                name={status}
                radius={i === statuses.length - 1 ? [4, 4, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="filters-row">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {statusSummary.map((s) => (
            <option key={s.status} value={s.status}>
              {s.status}
            </option>
          ))}
        </Select>
        <Select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
          <option value="all">All kinds</option>
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {loading ? (
          <p className="page__subtitle">Loading transactions…</p>
        ) : error ? (
          <p className="page__subtitle">Could not load transactions: {error}</p>
        ) : (
          <Table columns={columns} rows={transactions} rowKey={(row) => row.id} />
        )}
      </Card>
    </div>
  )
}
