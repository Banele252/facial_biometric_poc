import type { ComponentType } from 'react'
import type { SVGProps } from 'react'
import { AuditLogsIcon, ChatbotIcon, FraudIcon, TransactionsIcon } from './icons'

export interface NavConfigItem {
  path: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const navItems: NavConfigItem[] = [
  { path: '/audit-logs', label: 'Audit Logs', Icon: AuditLogsIcon },
  { path: '/fraud-intelligence', label: 'Fraud Intelligence Repo', Icon: FraudIcon },
  { path: '/transactions', label: 'Transaction Report', Icon: TransactionsIcon },
  { path: '/chatbot', label: 'System Chatbot', Icon: ChatbotIcon },
]
