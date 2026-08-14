import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './pages.css'
import { Card } from '../components/ui/Card'
import { StatTile } from '../components/ui/StatTile'
import { Badge } from '../components/ui/Badge'
import { Table, type TableColumn } from '../components/ui/Table'
import { Select } from '../components/ui/Input'
import {
  getFraudRejections,
  getFraudRejectionsSummary,
  type FraudRejection,
  type FraudRuleSummaryEntry,
} from '../api'
import { ChartColors } from '../theme/chartColors'
import { formatDate } from '../utils/date'

export function FraudIntelligence() {
  const [stageFilter, setStageFilter] = useState('all')

  const [rejections, setRejections] = useState<FraudRejection[]>([])
  const [summary, setSummary] = useState<FraudRuleSummaryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    getFraudRejectionsSummary()
      .then((res) => {
        if (!ignore) setSummary(res.rules)
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load fraud summary')
      })
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError(null)
    getFraudRejections({ stage: stageFilter === 'all' ? undefined : stageFilter, limit: 100 })
      .then((res) => {
        if (!ignore) setRejections(res.items)
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load fraud rejections')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [stageFilter])

  const stageTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const rule of summary) {
      totals.set(rule.stage, (totals.get(rule.stage) ?? 0) + rule.trigger_count)
    }
    return Array.from(totals, ([stage, total]) => ({ stage, total })).sort((a, b) => b.total - a.total)
  }, [summary])

  const totalRejections = useMemo(() => stageTotals.reduce((sum, s) => sum + s.total, 0), [stageTotals])
  const topStage = stageTotals[0]

  const columns: TableColumn<FraudRejection>[] = [
    { key: 'id', header: 'ID', render: (row) => row.id },
    { key: 'id_number', header: 'ID number', render: (row) => row.id_number },
    { key: 'msisdn', header: 'MSISDN', render: (row) => row.msisdn },
    { key: 'device_id', header: 'Device ID', render: (row) => row.device_id },
    { key: 'stage', header: 'Stage', render: (row) => <Badge tone="rejected">{row.stage}</Badge> },
    { key: 'reason', header: 'Reason', render: (row) => row.reason },
    { key: 'created_at', header: 'Timestamp', render: (row) => formatDate(row.created_at) },
  ]

  return (
    <div className="page">
      <p className="page__subtitle">Fraud-rule rejections triggered while processing requests, by check stage.</p>

      <div className="stat-grid">
        <StatTile label="Total rejections" value={totalRejections} dotColor={ChartColors.outcome.rejected} />
        <StatTile label="Top stage" value={topStage ? `${topStage.stage} (${topStage.total})` : '—'} />
        <StatTile label="Distinct stages" value={stageTotals.length} />
      </div>

      <Card className="chart-card">
        <h2 className="chart-card__title">Fraud-rule rejections by stage</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={stageTotals} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={ChartColors.grid} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="stage" stroke={ChartColors.axisText} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke={ChartColors.axisText} fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${ChartColors.grid}`, fontSize: 12 }} />
            <Bar dataKey="total" fill={ChartColors.outcome.rejected} radius={[4, 4, 0, 0]} name="Rejections" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="filters-row">
        <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="all">All stages</option>
          {stageTotals.map((s) => (
            <option key={s.stage} value={s.stage}>
              {s.stage}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {loading ? (
          <p className="page__subtitle">Loading fraud rejections…</p>
        ) : error ? (
          <p className="page__subtitle">Could not load fraud rejections: {error}</p>
        ) : (
          <Table columns={columns} rows={rejections} rowKey={(row) => row.id} />
        )}
      </Card>
    </div>
  )
}
