import { useState } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Messaging/Sidebar';
import MessageArea from '../components/Messaging/MessageArea';
import ConversationDetailsModal from '../components/Messaging/ConversationDetailsModal';
import type { Conversation } from '../types/Messaging/Conversation';
import { MOCK_CONVERSATIONS } from '../testData/mockConversations';

export default function MessagingPage() {
  const [activeConversation, setActiveConversation] = useState<Conversation>(MOCK_CONVERSATIONS[0]);
  const [isModalDisplayed] = useState<boolean>(false);

  return (
    <div className="d-flex flex-column" style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>
      <Header />
      <div className="d-flex flex-grow-1 overflow-hidden">
        <Sidebar onSelectConversation={setActiveConversation} />
        <MessageArea conversation={activeConversation} />
      </div>
      {isModalDisplayed && <ConversationDetailsModal />}
    </div>
  );
}
