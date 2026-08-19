import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './layout/DashboardLayout'
import { RequireAuth } from './layout/RequireAuth'
import { AuditLogs } from './pages/AuditLogs'
import { FraudIntelligence } from './pages/FraudIntelligence'
import { TransactionReport } from './pages/TransactionReport'
import { SystemChatbot } from './pages/SystemChatbot'
import { Login } from './pages/Login'

function NotFound() {
  return (
    <div>
      <h1>Page not found</h1>
      <p>The page you&apos;re looking for doesn&apos;t exist.</p>
    </div>
  )
}

function Protected({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <DashboardLayout>{children}</DashboardLayout>
    </RequireAuth>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Navigate to="/audit-logs" replace /></Protected>} />
      <Route path="/audit-logs" element={<Protected><AuditLogs /></Protected>} />
      <Route path="/fraud-intelligence" element={<Protected><FraudIntelligence /></Protected>} />
      <Route path="/transactions" element={<Protected><TransactionReport /></Protected>} />
      <Route path="/chatbot" element={<Protected><SystemChatbot /></Protected>} />
      <Route path="*" element={<Protected><NotFound /></Protected>} />
    </Routes>
  )
}
