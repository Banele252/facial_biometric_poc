import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './pages.css'
import { Card } from '../components/ui/Card'
import { StatTile } from '../components/ui/StatTile'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Table, type TableColumn } from '../components/ui/Table'
import { Select } from '../components/ui/Input'
import {
  getSimSwapOrders,
  getSimSwapStatusSummary,
  getSimSwapVolumeByDay,
  type SimSwapOrder,
  type SimSwapStatusCount,
  type SimSwapVolumeRow,
} from '../api'
import { ChartColors } from '../theme/chartColors'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Grounded in Backend/sim_swap_service/sim_swap_request.py's OrderStatus enum.
const STATUS_TONE: Record<string, BadgeTone> = {
  CREATED: 'review',
  ACTIVATED: 'approved',
  REJECTED: 'rejected',
}
const STATUS_DOT: Record<string, string> = {
  CREATED: ChartColors.outcome.review,
  ACTIVATED: ChartColors.outcome.approved,
  REJECTED: ChartColors.outcome.rejected,
}
const statusTone = (status: string): BadgeTone => STATUS_TONE[status] ?? 'neutral'
const statusColor = (status: string) => STATUS_DOT[status] ?? ChartColors.volumeBar

export function TransactionReport() {
  const [statusFilter, setStatusFilter] = useState('all')

  const [orders, setOrders] = useState<SimSwapOrder[]>([])
  const [total, setTotal] = useState(0)
  const [statusSummary, setStatusSummary] = useState<SimSwapStatusCount[]>([])
  const [volumeRows, setVolumeRows] = useState<SimSwapVolumeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    Promise.all([getSimSwapStatusSummary(), getSimSwapVolumeByDay(14)])
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
    getSimSwapOrders({ status: statusFilter === 'all' ? undefined : statusFilter, limit: 100 })
      .then((res) => {
        if (!ignore) {
          setOrders(res.items)
          setTotal(res.total)
        }
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load SIM-swap orders')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [statusFilter])

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

  const columns: TableColumn<SimSwapOrder>[] = [
    { key: 'order_id', header: 'Order ID', render: (row) => row.order_id },
    { key: 'msisdn', header: 'MSISDN', render: (row) => row.msisdn },
    { key: 'identity_reference', header: 'Identity ref', render: (row) => row.identity_reference },
    { key: 'new_sim_serial', header: 'New SIM serial', render: (row) => row.new_sim_serial },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge> },
    { key: 'created_at', header: 'Timestamp', render: (row) => formatDate(row.created_at) },
  ]

  return (
    <div className="page">
      <p className="page__subtitle">SIM-swap orders processed by the application.</p>

      <div className="stat-grid">
        <StatTile label="Total orders" value={total} />
        {statusSummary.map((s) => (
          <StatTile key={s.status} label={s.status} value={s.count} dotColor={statusColor(s.status)} />
        ))}
      </div>

      <Card className="chart-card">
        <h2 className="chart-card__title">Order volume, last 14 days</h2>
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
      </div>

      <Card>
        {loading ? (
          <p className="page__subtitle">Loading SIM-swap orders…</p>
        ) : error ? (
          <p className="page__subtitle">Could not load SIM-swap orders: {error}</p>
        ) : (
          <Table columns={columns} rows={orders} rowKey={(row) => row.order_id} />
        )}
      </Card>
    </div>
  )
}
