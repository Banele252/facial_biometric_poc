import { useEffect, useRef, useState } from 'react'
import './pages.css'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { sendChatMessage } from '../api'
import { initialChatMessages, type ChatMessage } from '../data/mockChatMessages'

let nextId = initialChatMessages.length + 1

export function SystemChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialChatMessages)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || sending) return

    const userMessage: ChatMessage = {
      id: `msg_${nextId++}`,
      sender: 'user',
      text,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setDraft('')
    setSending(true)

    try {
      const { reply } = await sendChatMessage(text)
      setMessages((prev) => [
        ...prev,
        { id: `msg_${nextId++}`, sender: 'system', text: reply, timestamp: new Date().toISOString() },
      ])
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error'
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${nextId++}`,
          sender: 'system',
          text: `Sorry, I couldn't reach the Fraud Assistant (${detail}).`,
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page">
      <p className="page__subtitle">Ask about fraud outcomes, SIM-swap transactions, or audit logs.</p>

      <Card className="chat-panel">
        <div className="chat-panel__messages" ref={listRef}>
          {messages.map((message) => (
            <div key={message.id} className={`chat-bubble chat-bubble--${message.sender}`}>
              {message.text}
            </div>
          ))}
          {sending && <div className="chat-bubble chat-bubble--system">Thinking…</div>}
        </div>
        <form className="chat-panel__composer" onSubmit={handleSubmit}>
          <Input
            placeholder="Ask the Fraud Assistant…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={sending}
          />
          <Button type="submit" size="md" disabled={sending}>
            Send
          </Button>
        </form>
      </Card>
    </div>
  )
}
