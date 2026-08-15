import { useState } from 'react'
import { Button } from './ui/Button'
import { ReportIcon } from '../layout/icons'
import { downloadTransactionReport, type Transaction } from '../api'

export function ReportDownloadButton({ transaction }: { transaction: Transaction }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setDownloading(true)
    setError(null)
    try {
      const blob = await downloadTransactionReport(transaction.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `trust-platform-report-${transaction.id}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download report')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={downloading} title={error ?? undefined}>
      <ReportIcon /> {downloading ? 'Generating…' : 'trans report'}
    </Button>
  )
}
