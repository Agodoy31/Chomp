import { useState, useEffect } from 'react';
import type { Conversation } from '../../types/Messaging/Conversation';
import { fetchConversations } from '../../api/messagingApi';
import SidebarElement from './SidebarElement';

interface SidebarProps {
  onSelectConversation?: (conversation: Conversation) => void;
  onOpenNewChat?: () => void;
  activeConversationId?: string;
}

export default function Sidebar({
  onSelectConversation,
  onOpenNewChat,
  activeConversationId,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const activeId = activeConversationId ?? selectedId;

  useEffect(() => {
    async function loadConversations() {
      setIsLoading(true);
      try {
        const flattenedData = await fetchConversations();
        setConversations(flattenedData);
        if (flattenedData.length > 0) {
          setSelectedId(flattenedData[0]._id);
          onSelectConversation?.(flattenedData[0]);
        }
      } catch (err) {
        console.error('Error loading conversations:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadConversations();
  }, [onSelectConversation]);

  const handleSelect = (conv: Conversation) => {
    setSelectedId(conv._id);
    onSelectConversation?.(conv);
  };

  return (
    <aside
      className="d-flex flex-column flex-shrink-0 p-3"
      style={{
        backgroundColor: '#FF6C2F',
        width: '320px',
        minWidth: '280px',
        maxWidth: '360px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div className="d-flex align-items-center justify-content-between mb-3 px-1">
        <h2
          className="text-white fw-bold mb-0"
          style={{ fontSize: '1.5rem', letterSpacing: '0.01em' }}
        >
          Messages
        </h2>
        <button
          type="button"
          onClick={onOpenNewChat}
          className="btn rounded-circle d-flex align-items-center justify-content-center p-0"
          style={{
            width: '32px',
            height: '32px',
            backgroundColor: 'rgba(255, 255, 255, 0.25)',
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
          }}
          aria-label="New chat"
          title="New chat"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9 3.75V14.25M3.75 9H14.25"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="d-flex flex-column gap-3">
        {isLoading ? (
          <div>Loading...</div>
        ) : conversations.length === 0 ? (
          <div>No conversations yet</div>
        ) : (
          conversations.map((conv) => (
            <SidebarElement
              key={conv._id}
              conversation={conv}
              isActive={conv._id === activeId}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}
