import type { HTMLAttributes } from 'react'
import './ui.css'

type CardProps = HTMLAttributes<HTMLDivElement>

export function Card({ className, ...rest }: CardProps) {
  return <div className={['ui-card', className].filter(Boolean).join(' ')} {...rest} />
}
