import './ui.css'
import { Card } from './Card'

interface StatTileProps {
  label: string
  value: string | number
  dotColor?: string
}

export function StatTile({ label, value, dotColor }: StatTileProps) {
  return (
    <Card className="ui-stat-tile">
      <div className="ui-stat-tile__label">
        {dotColor && <span className="ui-status-dot" style={{ background: dotColor }} />}
        {label}
      </div>
      <div className="ui-stat-tile__value">{value}</div>
    </Card>
  )
}
