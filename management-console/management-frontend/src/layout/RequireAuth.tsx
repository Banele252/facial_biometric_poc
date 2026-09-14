import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { getStoredUser } from '../auth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const user = getStoredUser()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
