import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './pages.css'
import { Card } from '../components/ui/Card'
import { StatTile } from '../components/ui/StatTile'
import { Badge } from '../components/ui/Badge'
import { Table, type TableColumn } from '../components/ui/Table'
import { mockTransactions, mockVolumeByDay, type TransactionRecord } from '../data/mockTransactions'
import { ChartColors } from '../theme/chartColors'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const OUTCOME_TONE = {
  approved: 'approved',
  flagged: 'rejected',
  pending: 'review',
} as const

export function TransactionReport() {
  const total = mockTransactions.length
  const approved = mockTransactions.filter((t) => t.outcome === 'approved').length
  const flagged = mockTransactions.filter((t) => t.outcome === 'flagged').length

  const columns: TableColumn<TransactionRecord>[] = [
    { key: 'id', header: 'ID', render: (row) => row.id },
    { key: 'msisdn', header: 'MSISDN', render: (row) => row.msisdn },
    { key: 'identity_reference', header: 'Identity ref', render: (row) => row.identity_reference },
    { key: 'verification_status', header: 'Verification', render: (row) => <Badge tone={row.verification_status === 'ACCEPTED' ? 'approved' : 'rejected'}>{row.verification_status}</Badge> },
    { key: 'fraud_decision', header: 'Fraud decision', render: (row) => row.fraud_decision },
    { key: 'risk_score', header: 'Risk score', align: 'right', render: (row) => row.risk_score },
    { key: 'timestamp', header: 'Timestamp', render: (row) => formatDate(row.timestamp) },
    { key: 'outcome', header: 'Outcome', render: (row) => <Badge tone={OUTCOME_TONE[row.outcome]}>{row.outcome}</Badge> },
  ]

  return (
    <div className="page">
      <p className="page__subtitle">SIM-swap orders processed by the application, gated by verification and fraud decisions.</p>

      <div className="stat-grid">
        <StatTile label="Total transactions" value={total} />
        <StatTile label="Approved" value={approved} dotColor={ChartColors.outcome.approved} />
        <StatTile label="Flagged" value={flagged} dotColor={ChartColors.outcome.rejected} />
      </div>

      <Card className="chart-card">
        <h2 className="chart-card__title">Transaction volume, last 12 days</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={mockVolumeByDay} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={ChartColors.grid} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} stroke={ChartColors.axisText} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke={ChartColors.axisText} fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              labelFormatter={(value) => formatDate(String(value))}
              contentStyle={{ borderRadius: 10, border: `1px solid ${ChartColors.grid}`, fontSize: 12 }}
            />
            <Legend />
            <Bar dataKey="approved" stackId="volume" fill={ChartColors.outcome.approved} name="Approved" />
            <Bar dataKey="pending" stackId="volume" fill={ChartColors.outcome.review} name="Pending" />
            <Bar dataKey="flagged" stackId="volume" fill={ChartColors.outcome.rejected} name="Flagged" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <Table columns={columns} rows={mockTransactions} rowKey={(row) => row.id} />
      </Card>
    </div>
  )
}
