import { useState, useEffect } from 'react';
import type { Conversation } from '../../types/Messaging/Converstation';
import { MOCK_CONVERSATIONS } from '../../testData/mockConverstations';
import SidebarElement from './SidebarElement';

interface SidebarProps {
  onSelectConversation?: (conversation: Conversation) => void;
}

export default function Sidebar({ onSelectConversation }: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>('conv-1');

  useEffect(() => {
    async function loadConversations() {
      try {
        // Future implementation:
        // const response = await fetch('/api/conversations');
        // if (!response.ok) throw new Error('Failed to fetch conversations');
        // const data = await response.json();

        const data = await Promise.resolve(MOCK_CONVERSATIONS);
        setConversations(data);
        if (data.length > 0) {
          setActiveId(data[0]._id);
        }
      } catch (err) {
        console.error('Error loading conversations:', err);
      }
    }

    loadConversations();
  }, []);

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
        {conversations.map((conv) => (
          <SidebarElement
            key={conv._id}
            conversation={conv}
            isActive={conv._id === activeId}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </aside>
  );
}
