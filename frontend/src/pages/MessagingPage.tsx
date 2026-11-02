import { useState, useCallback } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Messaging/Sidebar';
import MessageArea from '../components/Messaging/MessageArea';
import ConversationDetailsModal from '../components/Messaging/ConversationDetailsModal';
import type { Conversation } from '../types/Messaging/Conversation';
import { flattenConversation } from '../types/Messaging/Conversation';

export default function MessagingPage() {
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isModalDisplayed, setIsModalDisplayed] = useState<boolean>(false);

  const handleSelectConversation = useCallback(async (conv: Conversation) => {
    setActiveConversation(conv);
    try {
      const response = await fetch(`/api/conversations/${conv._id}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        const fullDetails = flattenConversation(data);
        setActiveConversation((prev) =>
          prev?._id === conv._id ? { ...prev, ...fullDetails } : prev
        );
      }
    } catch (err) {
      console.error('Failed to load conversation details:', err);
    }
  }, []);

  return (
    <div className="d-flex flex-column" style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>
      <Header />
      <div className="d-flex flex-grow-1 overflow-hidden">
        <Sidebar onSelectConversation={handleSelectConversation} />
        <MessageArea
          conversation={activeConversation}
          onOpenDetails={() => setIsModalDisplayed(true)}
        />
      </div>
      <ConversationDetailsModal
        show={isModalDisplayed}
        onHide={() => setIsModalDisplayed(false)}
        conversation={activeConversation}
      />
    </div>
  );
}
