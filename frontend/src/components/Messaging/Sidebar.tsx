import { useState, useEffect } from 'react';
import type { Conversation, RawConversationResponse } from '../../types/Messaging/Conversation';
import { flattenConversation } from '../../types/Messaging/Conversation';
import SidebarElement from './SidebarElement';

interface SidebarProps {
  onSelectConversation?: (conversation: Conversation) => void;
}

export default function Sidebar({ onSelectConversation }: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadConversations() {
      setIsLoading(true);
      try {
        const response = await fetch('/api/conversations', {
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch conversations: ${response.status}`);
        }
        const data: RawConversationResponse[] = await response.json();
        const flattenedData: Conversation[] = Array.isArray(data)
          ? data.map(flattenConversation)
          : [];

        setConversations(flattenedData);
        if (flattenedData.length > 0) {
          setActiveId(flattenedData[0]._id);
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
    setActiveId(conv._id);
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
      <h2
        className="text-white fw-bold mb-3 px-1"
        style={{ fontSize: '1.5rem', letterSpacing: '0.01em' }}
      >
        Messages
      </h2>

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
