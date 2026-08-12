// API client for the management console backend.
//
// Endpoints:
//   POST /api/v1/chat   System Chatbot — Fraud Assistant agent

export interface ChatResponse {
  reply: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!resp.ok) {
    const detail = await resp.json().catch(() => null)
    const msg =
      (typeof detail?.detail === 'string' && detail.detail) ||
      detail?.detail?.[0]?.msg ||
      `Request failed (HTTP ${resp.status})`
    throw new Error(msg)
  }
  return resp.json() as Promise<T>
}

export function sendChatMessage(message: string): Promise<ChatResponse> {
  return request('/api/v1/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}
