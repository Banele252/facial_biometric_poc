import { useEffect, useRef, useState } from 'react'
import './pages.css'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { CANNED_REPLIES, mockChatMessages, type ChatMessage } from '../data/mockChatMessages'

let nextId = mockChatMessages.length + 1

export function SystemChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>(mockChatMessages)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return

    const userMessage: ChatMessage = {
      id: `msg_${nextId++}`,
      sender: 'user',
      text,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setDraft('')

    // Placeholder only — no LLM backend wired up yet.
    window.setTimeout(() => {
      const reply = CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)]
      setMessages((prev) => [
        ...prev,
        { id: `msg_${nextId++}`, sender: 'system', text: reply, timestamp: new Date().toISOString() },
      ])
    }, 600)
  }

  return (
    <div className="page">
      <p className="page__subtitle">Placeholder assistant — responses are canned locally until a real backend is connected.</p>

      <Card className="chat-panel">
        <div className="chat-panel__messages" ref={listRef}>
          {messages.map((message) => (
            <div key={message.id} className={`chat-bubble chat-bubble--${message.sender}`}>
              {message.text}
            </div>
          ))}
        </div>
        <form className="chat-panel__composer" onSubmit={handleSubmit}>
          <Input
            placeholder="Ask the console assistant…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" size="md">
            Send
          </Button>
        </form>
      </Card>
    </div>
  )
}
