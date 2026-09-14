import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'
import './ui.css'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={['ui-input', className].filter(Boolean).join(' ')} {...rest} />
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={['ui-select', className].filter(Boolean).join(' ')} {...rest} />
}
