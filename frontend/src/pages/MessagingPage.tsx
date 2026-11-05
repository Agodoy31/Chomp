import { useState, useCallback } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Messaging/Sidebar';
import MessageArea from '../components/Messaging/MessageArea';
import ConversationDetailsModal from '../components/Messaging/ConversationDetailsModal';
import NewChatModal from '../components/Messaging/NewChatModal';
import type { Conversation } from '../types/Messaging/Conversation';
import { fetchConversationDetails } from '../api/messagingApi';

export default function MessagingPage() {
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isModalDisplayed, setIsModalDisplayed] = useState<boolean>(false);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState<boolean>(false);

  const handleSelectConversation = useCallback(async (conv: Conversation) => {
    setActiveConversation(conv);
    try {
      const fullDetails = await fetchConversationDetails(conv._id);
      setActiveConversation((prev) =>
        prev?._id === conv._id ? { ...prev, ...fullDetails } : prev
      );
    } catch (err) {
      console.error('Failed to load conversation details:', err);
    }
  }, []);

  const handleChatCreated = (newConv: Conversation) => {
    setActiveConversation(newConv);
    setIsNewChatModalOpen(false);
  };

  return (
    <div className="d-flex flex-column" style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>
      <Header />
      <div className="d-flex flex-grow-1 overflow-hidden">
        <Sidebar
          onSelectConversation={handleSelectConversation}
          onOpenNewChat={() => setIsNewChatModalOpen(true)}
          activeConversationId={activeConversation?._id}
        />
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
      <NewChatModal
        show={isNewChatModalOpen}
        onHide={() => setIsNewChatModalOpen(false)}
        onChatCreated={handleChatCreated}
      />
    </div>
  );
}
