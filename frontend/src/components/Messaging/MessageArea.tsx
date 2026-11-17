import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConversationDetails } from '../../types/Messaging/Conversation';
import type { IMessage } from '../../types/Messaging/Message';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchMessages,
  postMessage,
  isUnauthorizedError,
} from '../../api/messagingApi';
import Message from './Message';

// Combine message lists by ID so history and sends can overlap without duplicates
function mergeMessages(current: IMessage[], incoming: IMessage[]): IMessage[] {
  const byId = new Map([...current, ...incoming].map((m) => [m._id, m]));
  return [...byId.values()].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );
}

interface MessageAreaProps {
  conversation: ConversationDetails | null;
  onOpenDetails: () => void;
  onMessageSent: (conversation: ConversationDetails, message: IMessage) => void;
}

export default function MessageArea({
  conversation,
  onOpenDetails,
  onMessageSent,
}: MessageAreaProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const currentUserId = user?.id || '';

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const conversationId = conversation?._id;

  // Load messages for the selected conversation, ignoring responses after unmount/switch
  useEffect(() => {
    if (!conversationId) return;
    const currentId = conversationId;
    let ignore = false;

    async function loadMessages() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const data = await fetchMessages(currentId);
        if (!ignore) setMessages((prev) => mergeMessages(data, prev));
      } catch (err) {
        if (ignore) return;
        if (isUnauthorizedError(err)) {
          navigate('/login');
          return;
        }
        console.error('Error loading messages:', err);
        setLoadError(
          err instanceof Error && err.message
            ? err.message
            : 'The server did not respond.'
        );
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    loadMessages();
    return () => {
      ignore = true;
    };
  }, [conversationId, reloadKey, navigate]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container && !isLoading && !loadError) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length, isLoading, loadError]);

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

  const participants = conversation.participants || [];

  // Check client-side permissions: user must not have READ-only permission
  const currentUserParticipant = currentUserId
    ? participants.find((p) => p.userId._id === currentUserId)
    : undefined;

  const areDetailsLoaded = participants.length > 0;
  const canSend =
    areDetailsLoaded &&
    currentUserParticipant !== undefined &&
    currentUserParticipant.permission !== 'READ';
  const hasNoSendPermission = areDetailsLoaded && !canSend;

  const headerInitial = conversation.displayName.charAt(0).toUpperCase();

  const handleSend = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!canSend) return;
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setSendError(null);

    try {
      const newMsg = await postMessage(conversation._id, textToSend);
      setMessages((prev) => mergeMessages(prev, [newMsg]));
      setInputText('');
      onMessageSent(conversation, newMsg);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        navigate('/login');
        return;
      }
      console.error('Error sending message:', err);
      setSendError(
        err instanceof Error && err.message
          ? err.message
          : 'Failed to send message. Please try again.'
      );
    }
  };

  const getSenderName = (msg: IMessage): string => {
    return msg.sender?.firstName || conversation.displayName;
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
          onClick={onOpenDetails}
          className="btn rounded-circle d-flex align-items-center justify-content-center border-0 p-0"
          style={{
            width: '36px',
            height: '36px',
            backgroundColor: '#EDF0F5',
            cursor: 'pointer',
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
        ref={messagesContainerRef}
        className="flex-grow-1 overflow-y-auto px-4 py-3"
        style={{ overflowX: 'hidden' }}
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
                senderName={getSenderName(msg)}
                isCurrentUser={Boolean(currentUserId && msg.sender?._id === currentUserId)}
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
            aria-label={
              hasNoSendPermission
                ? 'You do not have permission to send messages in this conversation'
                : `Message ${conversation.displayName}`
            }
            maxLength={2000}
            value={
              hasNoSendPermission
                ? 'You do not have permission to send messages in this conversation'
                : inputText
            }
            onChange={(e) => canSend && setInputText(e.target.value)}
            disabled={!canSend}
            style={{
              fontSize: '14px',
              color: canSend ? '#1F2937' : '#6B7280',
              cursor: canSend ? 'text' : 'not-allowed',
              userSelect: canSend ? 'auto' : 'none',
            }}
          />

          {/* Send Arrow Vector Button */}
          <button
            type="submit"
            disabled={!canSend}
            className="btn rounded-circle d-flex align-items-center justify-content-center p-0 flex-shrink-0"
            style={{
              width: '36px',
              height: '36px',
              backgroundColor: canSend ? '#3046C3' : '#9CA3AF',
              border: 'none',
              cursor: canSend ? 'pointer' : 'not-allowed',
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
