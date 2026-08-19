import type { ReactNode } from 'react'
import './layout.css'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-shell">
      <Sidebar />
      <div className="dashboard-shell__main">
        <Header />
        <main className="dashboard-shell__content">{children}</main>
      </div>
    </div>
  )
}
