import { Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './layout/DashboardLayout'
import { AuditLogs } from './pages/AuditLogs'
import { FraudIntelligence } from './pages/FraudIntelligence'
import { TransactionReport } from './pages/TransactionReport'
import { SystemChatbot } from './pages/SystemChatbot'

function NotFound() {
  return (
    <div>
      <h1>Page not found</h1>
      <p>The page you&apos;re looking for doesn&apos;t exist.</p>
    </div>
  )
}

export default function App() {
  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/audit-logs" replace />} />
        <Route path="/audit-logs" element={<AuditLogs />} />
        <Route path="/fraud-intelligence" element={<FraudIntelligence />} />
        <Route path="/transactions" element={<TransactionReport />} />
        <Route path="/chatbot" element={<SystemChatbot />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </DashboardLayout>
  )
}
