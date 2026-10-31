import { useState } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Messaging/Sidebar';
import MessageArea from '../components/Messaging/MessageArea';
import ConversationDetailsModal from '../components/Messaging/ConversationDetailsModal';
import type { Conversation } from '../types/Messaging/Conversation';
import { MOCK_CONVERSATIONS } from '../testData/mockConversations';

export default function MessagingPage() {
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(MOCK_CONVERSATIONS[0]);
  const [isModalDisplayed, setIsModalDisplayed] = useState<boolean>(false);

  return (
    <div className="d-flex flex-column vh-100 overflow-hidden">
      <Header />
      <div className="d-flex flex-grow-1 overflow-hidden">
        <Sidebar
          activeConversationId={activeConversation?._id}
          onSelectConversation={setActiveConversation}
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
    </div>
  );
}
