import { useEffect, useState } from 'react'
import './pages.css'
import { Card } from '../components/ui/Card'
import { StatTile } from '../components/ui/StatTile'
import { Badge } from '../components/ui/Badge'
import { Table, type TableColumn } from '../components/ui/Table'
import { getBusinessRules, type BusinessRule } from '../api'

export function BusinessRules() {
  const [rules, setRules] = useState<BusinessRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    getBusinessRules()
      .then((res) => {
        if (!ignore) setRules(res.rules)
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load business rules')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [])

  const activeCount = rules.filter((rule) => rule.is_active).length

  const columns: TableColumn<BusinessRule>[] = [
    { key: 'code', header: 'Rule Code', render: (row) => row.code },
    { key: 'name', header: 'Rule Name', render: (row) => row.name },
    { key: 'description', header: 'Description', render: (row) => row.description },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.is_active ? 'approved' : 'neutral'}>{row.is_active ? 'Active' : 'Not active'}</Badge>
      ),
    },
    {
      key: 'validation_count',
      header: 'Validation',
      align: 'right',
      render: (row) => row.validation_count.toLocaleString(),
    },
  ]

  return (
    <div className="page">
      <p className="page__subtitle">
        The checks the verification pipeline runs on every transaction, and how many transactions have been
        processed against each one.
      </p>

      <div className="stat-grid">
        <StatTile label="Active rules" value={activeCount} />
        <StatTile label="Total rules" value={rules.length} />
      </div>

      <Card>
        {loading ? (
          <p className="page__subtitle">Loading business rules…</p>
        ) : error ? (
          <p className="page__subtitle">Could not load business rules: {error}</p>
        ) : (
          <Table columns={columns} rows={rules} rowKey={(row) => row.code} />
        )}
      </Card>
    </div>
  )
}
