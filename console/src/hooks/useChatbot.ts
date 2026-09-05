// src/hooks/useChatbot.ts
import { useState, useCallback } from 'react';
import { managementPost, getApiErrorMessage } from '@/lib/http';
import type { ChatMessage } from '@/types/console';

interface ChatReply {
    reply: string;
    /** Optional server-side conversation handle. */
    conversation_id?: string;
}

function generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2, 10);
}

const GREETING: ChatMessage = {
    id: 'init',
    from: 'bot',
    text: "Hi, I'm the Fraud Assistant. Ask me about fraud outcomes, SIM-swap transactions, or audit logs.",
    timestamp: new Date().toISOString(),
};

export function useChatbot() {
    const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
    const [conversationId, setConversationId] = useState<string | undefined>();
    const [isLoading, setIsLoading] = useState(false);

    const sendMessage = useCallback(
        async (text: string) => {
            const userMsg: ChatMessage = {
                id: generateId(),
                from: 'user',
                text,
                timestamp: new Date().toISOString(),
            };

            // Capture history before the optimistic append so the request
            // body carries the turns the model has actually seen.
            let history: ChatMessage[] = [];
            setMessages((prev) => {
                history = prev;
                return [...prev, userMsg];
            });
            setIsLoading(true);

            try {
                const data = await managementPost<ChatReply>('/chat', {
                    message: text,
                    conversation_id: conversationId,
                    history: history.map((m) => ({
                        role: m.from === 'bot' ? 'assistant' : 'user',
                        content: m.text,
                    })),
                });

                if (data.conversation_id) {
                    setConversationId(data.conversation_id);
                }

                setMessages((prev) => [
                    ...prev,
                    {
                        id: generateId(),
                        from: 'bot',
                        text: data.reply,
                        timestamp: new Date().toISOString(),
                    },
                ]);
            } catch (error) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: generateId(),
                        from: 'bot',
                        text: getApiErrorMessage(error),
                        timestamp: new Date().toISOString(),
                    },
                ]);
            } finally {
                setIsLoading(false);
            }
        },
        [conversationId],
    );

    const reset = useCallback(() => {
        setMessages([GREETING]);
        setConversationId(undefined);
    }, []);

    return { messages, sendMessage, isLoading, reset };
}
