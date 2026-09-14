import { Button } from './Button'
import { RefreshIcon } from '../../layout/icons'
import './ui.css'

interface RefreshButtonProps {
  onRefresh: () => void
  loading?: boolean
}

/** Manual refresh trigger. Pages also poll on a fixed interval (see
 * useAutoRefresh) - this lets the user pull the latest data on demand
 * instead of waiting for the next tick. */
export function RefreshButton({ onRefresh, loading = false }: RefreshButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="md"
      onClick={onRefresh}
      disabled={loading}
      aria-label="Refresh data"
    >
      <RefreshIcon
        width={16}
        height={16}
        className={loading ? 'ui-refresh-icon ui-refresh-icon--spinning' : 'ui-refresh-icon'}
      />
      Refresh
    </Button>
  )
}
