import { useEffect, useMemo, useState } from 'react'
import './pages.css'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Table, type TableColumn } from '../components/ui/Table'
import { Input, Select } from '../components/ui/Input'
import { getAuditLogs, type AuditLogEntry } from '../api'

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function AuditLogs() {
  const [search, setSearch] = useState('')
  const [process, setProcess] = useState('all')
  const [environment, setEnvironment] = useState('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError(null)
    getAuditLogs({
      process: process === 'all' ? undefined : process,
      environment: environment === 'all' ? undefined : environment,
      limit: 100,
    })
      .then((res) => {
        if (!ignore) setLogs(res.items)
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : 'Failed to load audit logs')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [process, environment])

  // Reflects the currently loaded page of logs, not the full table.
  const processOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.process))), [logs])
  const environmentOptions = useMemo(
    () => Array.from(new Set(logs.map((log) => log.environment))),
    [logs],
  )

  const rows = useMemo(() => {
    if (!search) return logs
    const needle = search.toLowerCase()
    return logs.filter((log) => {
      const haystack = `${log.process} ${log.id} ${JSON.stringify(log.payload)}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [logs, search])

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const columns: TableColumn<AuditLogEntry>[] = [
    { key: 'created_at', header: 'Timestamp', render: (row) => formatTimestamp(row.created_at) },
    { key: 'environment', header: 'Environment', render: (row) => <Badge tone="neutral">{row.environment}</Badge> },
    { key: 'process', header: 'Process', render: (row) => <Badge tone="neutral">{row.process.replace(/_/g, ' ')}</Badge> },
    {
      key: 'payload',
      header: 'Payload',
      render: (row) => {
        const isExpanded = expanded.has(row.id)
        const json = JSON.stringify(row.payload)
        return (
          <div className="payload-preview" onClick={() => toggleExpanded(row.id)}>
            {isExpanded ? <pre>{JSON.stringify(row.payload, null, 2)}</pre> : json.length > 60 ? `${json.slice(0, 60)}…` : json}
          </div>
        )
      },
    },
  ]

  return (
    <div className="page">
      <p className="page__subtitle">Every authentication, verification, and authorisation event recorded across the journey.</p>

      <div className="filters-row">
        <Input placeholder="Search by process, id, or payload…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={process} onChange={(e) => setProcess(e.target.value)}>
          <option value="all">All processes</option>
          {processOptions.map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
        <Select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
          <option value="all">All environments</option>
          {environmentOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {loading ? (
          <p className="page__subtitle">Loading audit logs…</p>
        ) : error ? (
          <p className="page__subtitle">Could not load audit logs: {error}</p>
        ) : (
          <Table columns={columns} rows={rows} rowKey={(row) => row.id} />
        )}
      </Card>
    </div>
  )
}
