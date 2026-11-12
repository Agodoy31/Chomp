import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Sidebar from '../components/Messaging/Sidebar';
import MessageArea from '../components/Messaging/MessageArea';
import ConversationDetailsModal from '../components/Messaging/ConversationDetailsModal';
import type { Conversation } from '../types/Messaging/Conversation';
import { useAuth } from '../hooks/useAuth';

export default function MessagingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isModalDisplayed] = useState<boolean>(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return null;
  }

  return (
    <div className="d-flex flex-column vh-100 overflow-hidden">
      <Header />
      <div className="d-flex flex-grow-1 overflow-hidden">
        <Sidebar
          activeConversationId={activeConversation?._id}
          onSelectConversation={setActiveConversation}
        />
        <MessageArea
          key={activeConversation?._id}
          conversation={activeConversation}
        />
      </div>
      {isModalDisplayed && <ConversationDetailsModal />}
    </div>
  );
}
