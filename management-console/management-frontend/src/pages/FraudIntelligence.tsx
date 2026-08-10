import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './pages.css'
import { Card } from '../components/ui/Card'
import { StatTile } from '../components/ui/StatTile'
import { Badge } from '../components/ui/Badge'
import { Table, type TableColumn } from '../components/ui/Table'
import { mockFraudOutcomes, mockRiskTrend, type FraudRecord } from '../data/mockFraudOutcomes'
import { ChartColors } from '../theme/chartColors'

const OUTCOME_TONE = {
  approved: 'approved',
  review: 'review',
  rejected: 'rejected',
} as const

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function FraudIntelligence() {
  const approved = mockFraudOutcomes.filter((r) => r.outcome === 'approved').length
  const review = mockFraudOutcomes.filter((r) => r.outcome === 'review').length
  const rejected = mockFraudOutcomes.filter((r) => r.outcome === 'rejected').length

  const columns: TableColumn<FraudRecord>[] = [
    { key: 'identity_reference', header: 'Identity ref', render: (row) => row.identity_reference },
    { key: 'msisdn', header: 'MSISDN', render: (row) => row.msisdn },
    { key: 'outcome', header: 'Outcome', render: (row) => <Badge tone={OUTCOME_TONE[row.outcome]}>{row.outcome}</Badge> },
    { key: 'decision', header: 'Decision', render: (row) => row.decision },
    { key: 'risk_score', header: 'Risk score', align: 'right', render: (row) => row.risk_score },
    {
      key: 'reasons',
      header: 'Reasons',
      render: (row) => <span className="reasons-list">{row.reasons.length ? row.reasons.join(', ') : '—'}</span>,
    },
    { key: 'created_at', header: 'Timestamp', render: (row) => formatDate(row.created_at) },
  ]

  return (
    <div className="page">
      <p className="page__subtitle">Device risk, watchlist, and velocity signals composed into a single fraud decision per request.</p>

      <div className="stat-grid">
        <StatTile label="Approved" value={approved} dotColor={ChartColors.outcome.approved} />
        <StatTile label="Review" value={review} dotColor={ChartColors.outcome.review} />
        <StatTile label="Rejected" value={rejected} dotColor={ChartColors.outcome.rejected} />
      </div>

      <Card className="chart-card">
        <h2 className="chart-card__title">Average risk score, last 14 days</h2>
        <div className="risk-band-legend">
          <span className="risk-band-legend__chip">
            <span className="risk-band-legend__swatch" style={{ background: ChartColors.outcome.approved }} /> Low (0–39)
          </span>
          <span className="risk-band-legend__chip">
            <span className="risk-band-legend__swatch" style={{ background: ChartColors.outcome.review }} /> Medium (40–69)
          </span>
          <span className="risk-band-legend__chip">
            <span className="risk-band-legend__swatch" style={{ background: ChartColors.outcome.rejected }} /> High (70–100)
          </span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={mockRiskTrend} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={ChartColors.grid} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} stroke={ChartColors.axisText} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} stroke={ChartColors.axisText} fontSize={12} tickLine={false} axisLine={false} />
            <ReferenceArea y1={0} y2={39} fill={ChartColors.riskBand.low} strokeWidth={0} />
            <ReferenceArea y1={40} y2={69} fill={ChartColors.riskBand.medium} strokeWidth={0} />
            <ReferenceArea y1={70} y2={100} fill={ChartColors.riskBand.high} strokeWidth={0} />
            <Tooltip
              labelFormatter={(value) => formatDate(String(value))}
              contentStyle={{ borderRadius: 10, border: `1px solid ${ChartColors.grid}`, fontSize: 12 }}
            />
            <Line type="monotone" dataKey="avg_risk_score" stroke={ChartColors.riskLine} strokeWidth={2} dot={false} name="Avg risk score" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <Table columns={columns} rows={mockFraudOutcomes} rowKey={(row) => row.id} />
      </Card>
    </div>
  )
}
