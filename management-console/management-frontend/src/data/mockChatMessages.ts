// Seed data for the System Chatbot's initial greeting.

export interface ChatMessage {
  id: string
  sender: 'user' | 'system'
  text: string
  timestamp: string
}

export const initialChatMessages: ChatMessage[] = [
  {
    id: 'msg_1',
    sender: 'system',
    text: 'Hi, I’m the Fraud Assistant. Ask me about fraud outcomes, SIM-swap transactions, or audit logs.',
    timestamp: '2026-08-10T14:05:00Z',
  },
]
