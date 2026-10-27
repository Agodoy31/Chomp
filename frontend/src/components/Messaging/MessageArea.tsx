import { useState, useEffect } from 'react';
import type { Conversation } from '../../types/Messaging/Conversation';
import type { IMessage } from '../../types/Messaging/Message';
import {
  MOCK_ALBERTA_MESSAGES,
  CURRENT_USER_ID,
} from '../../testData/mockConversations';
import Message from './Message';

interface MessageAreaProps {
  conversation?: Conversation | null;
}

export default function MessageArea({ conversation }: MessageAreaProps) {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [inputText, setInputText] = useState('');

  const conversationId = conversation?._id;
  const conversationMessages = conversation?.messages;

  // Load messages for the selected conversation via dummy HTTP request
  useEffect(() => {
    if (!conversationId) return;

    async function loadMessages() {
      try {
        // Future implementation:
        // const response = await fetch(`/api/conversations/...`);
        // if (!response.ok) throw new Error('Failed to fetch messages');
        // const data = await response.json();

        const mockData =
          conversationId === 'conv-1'
            ? MOCK_ALBERTA_MESSAGES
            : conversationMessages || [];

        const data = await Promise.resolve(mockData);
        setMessages(data);
      } catch (err) {
        console.error('Error loading messages:', err);
      }
    }

    loadMessages();
  }, [conversationId, conversationMessages]);

  if (!conversation) {
    return <>You seem to have broken things</>;
  }

  const headerInitial = conversation.displayName.charAt(0).toUpperCase();

  const handleSend = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setInputText('');

    try {
      // Future implementation:
      // const response = await fetch(`/api/conversations/...`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ text: textToSend }),
      // });
      // if (!response.ok) throw new Error('Failed to send message');
      // const newMsg = await response.json();

      const newMsg: IMessage = await Promise.resolve({
        _id: `msg-${Date.now()}`,
        conversationId: conversation._id,
        senderId: CURRENT_USER_ID,
        text: textToSend,
        isAnnouncement: false,
        isSystem: false,
        createdAt: new Date().toISOString(),
      });

      setMessages((prev) => [...prev, newMsg]);
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const getSenderName = (senderId: string): string => {
    return (
      conversation.participants?.find((p) => p._id === senderId)?.firstName ||
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
        {messages.length === 0 ? (
          <div>No messages yet</div>
        ) : (
          <div className="d-flex flex-column">
            {messages.map((msg) => (
              <Message
                key={msg._id}
                message={msg}
                senderName={getSenderName(msg.senderId)}
                isCurrentUser={msg.senderId === CURRENT_USER_ID}
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
            placeholder={`Message ${conversation.displayName}...`}
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
