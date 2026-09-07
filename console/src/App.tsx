import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { AuthGate } from '@/components/AuthGate';
import AuditLogs from '@/routes/AuditLogs';
import FraudIntelligence from '@/routes/FraudIntelligence';
import TransactionReport from '@/routes/TransactionReport';
import SystemChatbot from '@/routes/SystemChatbot';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/audit-logs" replace />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="/fraud-intelligence" element={<FraudIntelligence />} />
            <Route path="/transactions" element={<TransactionReport />} />
            <Route path="/chatbot" element={<SystemChatbot />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </AuthGate>
    </QueryClientProvider>
  );
}
