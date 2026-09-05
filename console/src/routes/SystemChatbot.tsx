import { useState, useRef, useEffect } from 'react';
import { useChatbot } from '@/hooks/useChatbot';
import { Send, Loader2 } from 'lucide-react';

export default function SystemChatbot() {
  const { messages, sendMessage, isLoading } = useChatbot();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="p-8 h-[calc(100vh-0px)] flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">System Chatbot</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ask about fraud outcomes, SIM-swap transactions, or audit logs.
          </p>
        </div>
        <div className="text-sm text-gray-500">Signed in as banelemdluli25@gmail.com</div>
      </div>

      <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-xl px-4 py-3 rounded-2xl text-sm whitespace-pre-line leading-relaxed ${
                  m.from === 'user'
                    ? 'bg-gray-900 text-white rounded-br-md'
                    : 'bg-gray-50 text-gray-800 border border-gray-200 rounded-bl-md'
                }`}
              >
                {m.text.split('\n').map((line, idx) => {
                  // Simple bold rendering for **text**
                  const parts = line.split(/(\*\*.*?\*\*)/g);
                  return (
                    <span key={idx}>
                      {parts.map((part, pidx) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                          return <strong key={pidx} className={m.from === 'user' ? 'text-mtn-yellow' : 'text-gray-900'}>{part.slice(2, -2)}</strong>;
                        }
                        return <span key={pidx}>{part}</span>;
                      })}
                      {idx < m.text.split('\n').length - 1 && <br />}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 rounded-bl-md">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-gray-100 p-4 flex gap-3">
          <input
            type="text"
            placeholder="Ask the Fraud Assistant..."
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-mtn-yellow"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-6 py-2.5 bg-mtn-yellow hover:bg-mtn-yellow-hover disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 font-medium text-sm rounded-full transition-colors flex items-center gap-2"
          >
            <Send size={14} />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
