import { useState, useEffect } from 'react';
import type { Conversation } from '../../types/Messaging/Conversation';
import type { IMessage } from '../../types/Messaging/Message';
import { useAuth } from '../../hooks/useAuth';
import Message from './Message';

interface MessageAreaProps {
  conversation?: Conversation | null;
  onOpenDetails?: () => void;
}

export default function MessageArea({
  conversation,
  onOpenDetails,
}: MessageAreaProps) {
  const { user } = useAuth();
  const currentUserId = user?.id || '';

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const conversationId = conversation?._id;

  // Load messages for the selected conversation
  useEffect(() => {
    if (!conversationId) return;

    async function loadMessages() {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/messages`,
          {
            credentials: 'include',
          }
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch messages: ${response.status}`);
        }
        const data: IMessage[] = await response.json();
        // Backend returns messages newest-first; reverse to chronological order (oldest at top, newest at bottom)
        setMessages([...data].reverse());
      } catch (err) {
        console.error('Error loading messages:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadMessages();
  }, [conversationId]);

  if (!conversation) {
    return null;
  }

  const participants = conversation.participants || [];

  // Check client-side permissions: user must not have READ-only permission
  const currentUserParticipant = participants.find(
    (p) =>
      (currentUserId && p._id === currentUserId) ||
      p.firstName.toLowerCase() === 'you'
  );

  const canSend =
    participants.length > 0
      ? currentUserParticipant !== undefined &&
        currentUserParticipant.permission !== 'READ'
      : true;

  const headerInitial = conversation.displayName.charAt(0).toUpperCase();

  const handleSend = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!canSend) return;
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setInputText('');

    try {
      const response = await fetch(
        `/api/conversations/${conversation._id}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ text: textToSend }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }

      const newMsg: IMessage = await response.json();
      setMessages((prev) => [...prev, newMsg]);
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const getSenderName = (senderId: string): string => {
    return (
      participants.find((p) => p._id === senderId)?.firstName ||
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
      <div className="flex-grow-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div>Loading...</div>
        ) : messages.length === 0 ? (
          <div>No messages yet</div>
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
            placeholder={
              canSend
                ? `Message ${conversation.displayName}...`
                : 'You do not have permission to send messages in this conversation'
            }
            value={
              canSend
                ? inputText
                : 'You do not have permission to send messages in this conversation'
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
