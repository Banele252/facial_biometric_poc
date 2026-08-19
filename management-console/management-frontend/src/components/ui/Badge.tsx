import type { ReactNode } from 'react'
import './ui.css'

export type BadgeTone = 'neutral' | 'approved' | 'review' | 'rejected' | 'flagged' | 'pending'

interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge--${tone}`}>
      <span className="ui-badge__dot" />
      {children}
    </span>
  )
}
