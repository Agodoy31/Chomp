import { useState, useEffect } from 'react';
import type { Conversation } from '../../types/Messaging/Conversation';
import type { IMessage } from '../../types/Messaging/Message';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchMessages,
  postMessage,
  fetchConversationDetails,
} from '../../api/messagingApi';
import Message from './Message';

interface MessageAreaProps {
  conversation?: Conversation | null;
}

export default function MessageArea({ conversation }: MessageAreaProps) {
  const { user } = useAuth();
  const currentUserId = user?.id || '';

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [conversationDetails, setConversationDetails] = useState<Conversation | null>(null);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const conversationId = conversation?._id;

  // Load messages and full conversation details
  useEffect(() => {
    if (!conversationId) return;
    const currentId = conversationId;
    let cancelled = false;

    async function loadChatData() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [msgData, detailsData] = await Promise.all([
          fetchMessages(currentId),
          fetchConversationDetails(currentId).catch(() => null),
        ]);
        if (cancelled) return;
        setMessages(msgData);
        if (detailsData) {
          setConversationDetails(detailsData);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading messages:', err);
        setLoadError(
          err instanceof Error && err.message
            ? err.message
            : 'The server did not respond.'
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadChatData();
    return () => {
      cancelled = true;
    };
  }, [conversationId, reloadKey]);

  if (!conversation) {
    return (
      <main
        className="d-flex flex-column flex-grow-1 h-100 align-items-center justify-content-center text-muted"
        style={{ backgroundColor: '#F5F6FA', minWidth: 0 }}
      >
        <p className="mb-0 fs-5">Pick a conversation to start chatting</p>
      </main>
    );
  }

  const headerInitial = conversation.displayName.charAt(0).toUpperCase();

  const handleSend = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setSendError(null);

    try {
      const newMsg = await postMessage(conversation._id, textToSend);
      setMessages((prev) => [...prev, newMsg]);
      setInputText('');
    } catch (err) {
      console.error('Error sending message:', err);
      setSendError('Failed to send message. Please try again.');
    }
  };

  const activeParticipants =
    conversationDetails?.participants || conversation.participants || [];

  const getSenderName = (senderId: string): string => {
    return (
      activeParticipants.find((p) => p._id === senderId)?.firstName ||
      conversation.displayName
    );
  };

  return (
    <main
      className="d-flex flex-column flex-grow-1 h-100"
      style={{ backgroundColor: '#F5F6FA', minWidth: 0 }}
    >
      {/* Chat Header */}
      <header
        className="d-flex align-items-center justify-content-between px-4 py-3 bg-white border-bottom flex-shrink-0"
        style={{ minHeight: '68px' }}
      >
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle d-flex align-items-center justify-content-center fw-bold"
            style={{
              width: '42px',
              height: '42px',
              backgroundColor: '#A7CDDF',
              color: '#3046C3',
              fontSize: '18px',
            }}
          >
            {headerInitial}
          </div>
          <div>
            <h1 className="h5 fw-bold mb-0 text-dark">
              {conversation.displayName}
            </h1>
          </div>
        </div>

        {/* Three dots vector icon */}
        <button
          type="button"
          className="btn rounded-circle d-flex align-items-center justify-content-center border-0 p-0"
          style={{
            width: '36px',
            height: '36px',
            backgroundColor: '#EDF0F5',
          }}
          aria-label="Conversation details"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M12 7C13.1046 7 14 6.10457 14 5C14 3.89543 13.1046 3 12 3C10.8954 3 10 3.89543 10 5C10 6.10457 10.8954 7 12 7Z"
              fill="#3046C3"
            />
            <path
              d="M12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14Z"
              fill="#3046C3"
            />
            <path
              d="M12 21C13.1046 21 14 20.1046 14 19C14 17.8954 13.1046 17 12 17C10.8954 17 10 17.8954 10 19C10 20.1046 10.8954 21 12 21Z"
              fill="#3046C3"
            />
          </svg>
        </button>
      </header>

      {/* Message History Feed */}
      <div
        className="flex-grow-1 overflow-y-auto px-4 py-3"
        role="log"
        aria-label="Message history"
      >
        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="text-muted text-center py-4"
          >
            Loading messages...
          </div>
        ) : loadError ? (
          <div role="alert" className="text-muted text-center py-4">
            <div>The server did not respond.</div>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm mt-2 rounded-pill px-3"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Retry
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-muted text-center py-4">No messages yet</div>
        ) : (
          <div className="d-flex flex-column">
            {messages.map((msg) => (
              <Message
                key={msg._id}
                message={msg}
                senderName={getSenderName(msg.senderId)}
                isCurrentUser={Boolean(currentUserId && msg.senderId === currentUserId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Message Input Bar */}
      <footer
        className="p-3 px-4 flex-shrink-0"
        style={{ backgroundColor: '#F5F6FA' }}
      >
        {sendError && (
          <div className="text-danger small mb-2 text-center" role="alert">
            {sendError}
          </div>
        )}
        <form
          onSubmit={handleSend}
          className="d-flex align-items-center rounded-pill px-3 py-1 shadow-sm"
          style={{
            backgroundColor: '#EDF0F5',
            border: '1px solid #E2E8F0',
          }}
        >
          <input
            type="text"
            className="form-control border-0 bg-transparent shadow-none"
            placeholder={`Message ${conversation.displayName}...`}
            aria-label={`Message ${conversation.displayName}`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{
              fontSize: '14px',
              color: '#1F2937',
            }}
          />

          {/* Send Arrow Vector Button */}
          <button
            type="submit"
            className="btn rounded-circle d-flex align-items-center justify-content-center p-0 flex-shrink-0"
            style={{
              width: '36px',
              height: '36px',
              backgroundColor: '#3046C3',
              border: 'none',
            }}
            aria-label="Send message"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M4 10H16M10 16L16 10L10 4"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      </footer>
    </main>
  );
}
